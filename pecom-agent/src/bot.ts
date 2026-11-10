/**
 * Telegram-бот «Помощник ПЭК».
 * Запуск: npm run bot
 */
import { aiEnabled, config } from './config';
import { askAgent, resetConversation } from './agent';
import { PecApiError, pecApi } from './pec-api';
import {
  calculate,
  escapeHtml,
  extractCargoCodes,
  findOffices,
  formatCalc,
  formatMyCargos,
  formatOffices,
  formatTrack,
  formatZone,
  myCargos,
  parseDimensions,
  parseNumber,
  parseVolume,
  resolveZone,
  statusKey,
  track,
  type CalcInput,
  type CargoInput
} from './services';
import { readJson, readSubscriptions, writeJson, writeSubscriptions } from './storage';
import { sendText, tg, type InlineButton, type ReplyMarkup, type TgUpdate } from './telegram';

if (!config.telegram.token) {
  console.error('TELEGRAM_BOT_TOKEN не задан в .env — бот не запущен.');
  process.exit(1);
}

/* ───────────────────────────── Клавиатуры ───────────────────────────── */

const BTN = {
  calc: '🧮 Рассчитать доставку',
  track: '📦 Отследить груз',
  offices: '🏢 Отделения ПЭК',
  my: '📋 Мои грузы',
  watches: '🔔 Подписки',
  help: 'ℹ️ Помощь'
};

const mainMenu: ReplyMarkup = {
  keyboard: [
    [{ text: BTN.calc }, { text: BTN.track }],
    [{ text: BTN.offices }, { text: BTN.my }],
    [{ text: BTN.watches }, { text: BTN.help }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

const cancelButton: InlineButton[] = [{ text: '✖️ Отмена', callback_data: 'cancel' }];

function inline(rows: InlineButton[][]): ReplyMarkup {
  return { inline_keyboard: rows };
}

/* ───────────────────────────── Состояние диалога ───────────────────────────── */

type CalcDraft = Omit<Partial<CalcInput>, 'cargo'> & { cargo?: Partial<CargoInput> };

type ChatState =
  | { step: 'idle' }
  | { step: 'calc_from' | 'calc_to' | 'calc_weight' | 'calc_places' | 'calc_size' | 'calc_value' | 'calc_options'; draft: CalcDraft }
  | { step: 'track_code' }
  | { step: 'office_address'; operation: 'send' | 'receive' }
  | { step: 'check_address' };

const states = new Map<string, ChatState>();
const getState = (chatId: string): ChatState => states.get(chatId) || { step: 'idle' };
const setState = (chatId: string, state: ChatState) => states.set(chatId, state);

/* ───────────────────────────── Справка ───────────────────────────── */

function helpText(): string {
  return [
    '🤖 <b>Помощник по ТК ПЭК</b>',
    '',
    `${BTN.calc} — стоимость и сроки (авто и авиа), с забором/доставкой и страховкой`,
    `${BTN.track} — статус груза по коду, история, подписка на изменения`,
    `${BTN.offices} — ближайшие отделения и ПВЗ для сдачи/получения`,
    `${BTN.my} — грузы из вашего личного кабинета ПЭК`,
    '',
    '<b>Команды:</b>',
    '/calc Москва; Симферополь; 50; 60x40x30; 2; 15000 — быстрый расчёт',
    '   (откуда; куда; вес кг; габариты места; мест; объявленная стоимость)',
    '/track 780339690775 — статус груза',
    '/history 780339690775 — история статусов',
    '/watch 780339690775 — уведомлять об изменениях статуса',
    '/unwatch 780339690775 — перестать следить',
    '/office Симферополь, ул. Ленина 1 — отделения для сдачи груза',
    '/check адрес — обслуживает ли ПЭК адрес',
    '/my 30 — мои грузы за 30 дней',
    '/profile — данные личного кабинета',
    '/reset — начать разговор с ИИ заново, /cancel — отменить ввод',
    '',
    aiEnabled()
      ? '💬 Можно писать обычным текстом: «сколько стоит отправить 3 коробки по 10 кг из Симферополя в Краснодар?»'
      : '💬 Просто пришлите код груза — покажу статус. (ИИ-режим выключен: не задан ANTHROPIC_API_KEY.)'
  ].join('\n');
}

/* ───────────────────────────── Ошибки ───────────────────────────── */

function errorText(error: unknown): string {
  if (error instanceof PecApiError) return `⚠️ ПЭК: ${escapeHtml(error.message)}`;
  return `⚠️ ${escapeHtml((error as Error)?.message || String(error))}`;
}

async function safe(chatId: string, job: () => Promise<void>): Promise<void> {
  try {
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
    await job();
  } catch (error) {
    console.error(new Date().toISOString(), 'error', error);
    await sendText(chatId, errorText(error), { markup: mainMenu }).catch(() => undefined);
  }
}

/* ───────────────────────────── Действия ───────────────────────────── */

async function doTrack(chatId: string, codes: string[], withHistory = false): Promise<void> {
  const results = await track(codes, withHistory);
  const subs = readSubscriptions()[chatId] || {};
  const rows: InlineButton[][] = results.slice(0, 5).map((r) => [
    { text: `🕓 История ${r.code}`, callback_data: `hist:${r.code}` },
    subs[r.code] !== undefined
      ? { text: '🔕 Не следить', callback_data: `unwatch:${r.code}` }
      : { text: '🔔 Следить', callback_data: `watch:${r.code}` }
  ]);
  await sendText(chatId, formatTrack(results), { markup: rows.length ? inline(rows) : undefined });
}

async function doWatch(chatId: string, code: string): Promise<void> {
  const [result] = await track([code]);
  const all = readSubscriptions();
  all[chatId] = all[chatId] || {};
  all[chatId][code] = statusKey(result);
  writeSubscriptions(all);
  await sendText(
    chatId,
    `🔔 Слежу за грузом <code>${escapeHtml(code)}</code>. Сейчас: <b>${escapeHtml(result.status)}</b>.\n` +
      `Проверяю каждые ${config.watch.intervalMinutes} мин. и напишу при изменении статуса.`
  );
}

async function doUnwatch(chatId: string, code: string): Promise<void> {
  const all = readSubscriptions();
  if (all[chatId]) delete all[chatId][code];
  writeSubscriptions(all);
  await sendText(chatId, `🔕 Больше не слежу за грузом <code>${escapeHtml(code)}</code>.`);
}

async function showWatches(chatId: string): Promise<void> {
  const subs = readSubscriptions()[chatId] || {};
  const codes = Object.keys(subs);
  if (!codes.length) {
    await sendText(chatId, 'Подписок нет. Отследите груз и нажмите «🔔 Следить» или отправьте /watch КОД.');
    return;
  }
  const lines = ['🔔 <b>Слежу за грузами:</b>', ...codes.map((code) => `• <code>${escapeHtml(code)}</code> — ${escapeHtml(subs[code] || '—')}`)];
  await sendText(chatId, lines.join('\n'), {
    markup: inline(codes.slice(0, 10).map((code) => [{ text: `🔕 ${code}`, callback_data: `unwatch:${code}` }]))
  });
}

async function doOffices(chatId: string, address: string, operation: 'send' | 'receive'): Promise<void> {
  const offices = await findOffices(address, operation);
  await sendText(chatId, formatOffices(address, offices, operation), { markup: mainMenu });
}

async function doMy(chatId: string, days: number): Promise<void> {
  const items = await myCargos(days);
  await sendText(chatId, formatMyCargos(items, days), { markup: mainMenu });
}

async function doProfile(chatId: string): Promise<void> {
  const p = await pecApi.profileData();
  await sendText(
    chatId,
    [
      '👤 <b>Личный кабинет ПЭК</b>',
      `Имя: ${escapeHtml(p.name || '—')}`,
      `ИНН: ${escapeHtml(p.inn || '—')}${p.kpp ? `, КПП ${escapeHtml(p.kpp)}` : ''}`,
      `E-mail: ${escapeHtml(p.email || '—')}`,
      `Телефон: ${escapeHtml(p.phone || '—')}`
    ].join('\n')
  );
}

/* ───────────────────────────── Мастер расчёта ───────────────────────────── */

function draftSummary(draft: CalcDraft): string {
  const c = draft.cargo || {};
  const size = c.lengthM
    ? `${Math.round((c.lengthM || 0) * 100)}×${Math.round((c.widthM || 0) * 100)}×${Math.round((c.heightM || 0) * 100)} см`
    : c.totalVolumeM3
      ? `объём ${c.totalVolumeM3} м³, макс. габарит ${c.maxSizeM} м`
      : '—';
  return [
    `Откуда: <b>${escapeHtml(draft.from || '—')}</b>`,
    `Куда: <b>${escapeHtml(draft.to || '—')}</b>`,
    `Вес: <b>${c.weightKg ?? '—'} кг</b>, мест: <b>${c.places ?? '—'}</b>, место: <b>${escapeHtml(size)}</b>`,
    `Страховка: <b>${draft.declaredValue ? `${draft.declaredValue} ₽` : 'нет'}</b>`
  ].join('\n');
}

function optionsKeyboard(draft: CalcDraft): ReplyMarkup {
  return inline([
    [
      { text: `${draft.pickup ? '✅' : '⬜️'} Забор от адреса`, callback_data: 'calc:pickup' },
      { text: `${draft.delivery ? '✅' : '⬜️'} Доставка до адреса`, callback_data: 'calc:delivery' }
    ],
    [{ text: `${draft.hardPackaging ? '✅' : '⬜️'} Защитная упаковка`, callback_data: 'calc:hp' }],
    [{ text: '🧮 Рассчитать', callback_data: 'calc:go' }],
    cancelButton
  ]);
}

async function askOptions(chatId: string, draft: CalcDraft): Promise<void> {
  setState(chatId, { step: 'calc_options', draft });
  await sendText(
    chatId,
    `${draftSummary(draft)}\n\nВыберите услуги и нажмите «Рассчитать».\n<i>Для забора/доставки укажите в «откуда/куда» полный адрес (город, улица, дом).</i>`,
    { markup: optionsKeyboard(draft) }
  );
}

async function runCalc(chatId: string, draft: CalcDraft): Promise<void> {
  const input: CalcInput = {
    from: draft.from!,
    to: draft.to!,
    cargo: {
      weightKg: draft.cargo!.weightKg!,
      places: draft.cargo!.places || 1,
      lengthM: draft.cargo!.lengthM,
      widthM: draft.cargo!.widthM,
      heightM: draft.cargo!.heightM,
      totalVolumeM3: draft.cargo!.totalVolumeM3,
      maxSizeM: draft.cargo!.maxSizeM
    },
    declaredValue: draft.declaredValue,
    pickup: draft.pickup,
    delivery: draft.delivery,
    hardPackaging: draft.hardPackaging
  };
  const result = await calculate(input);
  setState(chatId, { step: 'idle' });
  await sendText(chatId, await formatCalc(result), {
    markup: inline([[{ text: '🔁 Пересчитать с другими услугами', callback_data: 'calc:again' }]])
  });
  lastCalc.set(chatId, draft);
}

const lastCalc = new Map<string, CalcDraft>();

/** /calc Москва; Симферополь; 50; 60x40x30; 2; 15000 */
function parseQuickCalc(args: string): CalcDraft | string {
  const parts = args.split(/[;|\n]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) {
    return 'Формат: /calc откуда; куда; вес кг; габариты места (60x40x30) или объём (0.5 м3 макс 1.2); [мест]; [объявленная стоимость]';
  }
  const [from, to, weightText, sizeText, placesText, valueText] = parts;
  const weightKg = parseNumber(weightText);
  if (!weightKg || weightKg <= 0) return 'Не понял вес. Пример: 50';
  const dims = parseDimensions(sizeText);
  const volume = dims ? null : parseVolume(sizeText);
  if (!dims && !(volume && volume.maxSizeM)) return 'Не понял габариты. Пример: 60x40x30 (см) или «0.5 м3 макс 1.2»';
  const places = placesText ? Math.max(1, Math.round(parseNumber(placesText) || 1)) : 1;
  const declaredValue = valueText ? parseNumber(valueText) || 0 : 0;
  return {
    from,
    to,
    declaredValue,
    cargo: { weightKg, places, ...(dims || {}), ...(volume || {}) }
  };
}

async function handleCalcStep(chatId: string, state: Extract<ChatState, { draft: CalcDraft }>, text: string): Promise<void> {
  const draft = state.draft;
  const cargo: Partial<CargoInput> = (draft.cargo = draft.cargo || {});
  switch (state.step) {
    case 'calc_from': {
      await resolveZone(text); // проверяем, что адрес обслуживается
      draft.from = text;
      setState(chatId, { step: 'calc_to', draft });
      await sendText(chatId, '📍 Куда везём? Город или полный адрес получателя.', { markup: inline([cancelButton]) });
      return;
    }
    case 'calc_to': {
      await resolveZone(text);
      draft.to = text;
      setState(chatId, { step: 'calc_weight', draft });
      await sendText(chatId, '⚖️ Общий вес груза, кг? Например: 25', { markup: inline([cancelButton]) });
      return;
    }
    case 'calc_weight': {
      const weight = parseNumber(text);
      if (!weight || weight <= 0) {
        await sendText(chatId, 'Укажите вес числом, например 25 или 3,5');
        return;
      }
      cargo.weightKg = weight;
      setState(chatId, { step: 'calc_places', draft });
      await sendText(chatId, '📦 Сколько мест (коробок/паллет)?', {
        markup: inline([
          [1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `places:${n}` })),
          cancelButton
        ])
      });
      return;
    }
    case 'calc_places': {
      const places = parseNumber(text);
      if (!places || places < 1) {
        await sendText(chatId, 'Укажите количество мест числом, например 2');
        return;
      }
      cargo.places = Math.round(places);
      setState(chatId, { step: 'calc_size', draft });
      await sendText(
        chatId,
        '📐 Габариты <b>одного места</b> Д×Ш×В, по умолчанию в см: <code>60x40x30</code>\n' +
          'Или общий объём с максимальным габаритом: <code>0.5 м3 макс 1.2</code>',
        { markup: inline([cancelButton]) }
      );
      return;
    }
    case 'calc_size': {
      const dims = parseDimensions(text);
      const volume = dims ? null : parseVolume(text);
      if (!dims && !(volume && volume.maxSizeM)) {
        await sendText(chatId, 'Не понял габариты. Пример: <code>60x40x30</code> или <code>0.5 м3 макс 1.2</code>');
        return;
      }
      Object.assign(cargo, dims || volume);
      setState(chatId, { step: 'calc_value', draft });
      await sendText(chatId, '🛡 Объявленная стоимость груза для страховки, ₽? Или нажмите «Без страховки».', {
        markup: inline([[{ text: 'Без страховки', callback_data: 'value:0' }], cancelButton])
      });
      return;
    }
    case 'calc_value': {
      draft.declaredValue = Math.max(0, parseNumber(text) || 0);
      await askOptions(chatId, draft);
      return;
    }
    case 'calc_options': {
      await sendText(chatId, 'Выберите услуги кнопками выше и нажмите «Рассчитать», или /cancel.');
      return;
    }
  }
}

/* ───────────────────────────── Обработка сообщений ───────────────────────────── */

function isAllowed(chatId: string): boolean {
  return config.telegram.allowedChatIds.includes(chatId);
}

async function handleCommand(chatId: string, command: string, args: string): Promise<boolean> {
  switch (command) {
    case '/start':
    case '/menu':
    case '/help':
      setState(chatId, { step: 'idle' });
      await sendText(chatId, helpText(), { markup: mainMenu });
      return true;
    case '/cancel':
      setState(chatId, { step: 'idle' });
      await sendText(chatId, 'Отменено.', { markup: mainMenu });
      return true;
    case '/reset':
      resetConversation(chatId);
      setState(chatId, { step: 'idle' });
      await sendText(chatId, 'Начали разговор заново.', { markup: mainMenu });
      return true;
    case '/id':
      await sendText(chatId, `Ваш chat id: <code>${escapeHtml(chatId)}</code>`);
      return true;
    case '/calc': {
      if (!args) {
        setState(chatId, { step: 'calc_from', draft: {} });
        await sendText(chatId, '📍 Откуда отправляем? Город или полный адрес (для забора).', { markup: inline([cancelButton]) });
        return true;
      }
      const draft = parseQuickCalc(args);
      if (typeof draft === 'string') {
        await sendText(chatId, escapeHtml(draft));
        return true;
      }
      await askOptions(chatId, draft);
      return true;
    }
    case '/track':
    case '/history': {
      const codes = extractCargoCodes(args);
      if (!codes.length) {
        setState(chatId, { step: 'track_code' });
        await sendText(chatId, 'Пришлите код груза (например 780339690775). Можно несколько через пробел.', { markup: inline([cancelButton]) });
        return true;
      }
      await doTrack(chatId, codes, command === '/history');
      return true;
    }
    case '/watch':
    case '/unwatch': {
      const [code] = extractCargoCodes(args);
      if (!code) {
        await sendText(chatId, `Укажите код груза: ${command} 780339690775`);
        return true;
      }
      await (command === '/watch' ? doWatch(chatId, code) : doUnwatch(chatId, code));
      return true;
    }
    case '/watches':
      await showWatches(chatId);
      return true;
    case '/office':
    case '/offices': {
      if (!args) {
        await askOfficeOperation(chatId);
        return true;
      }
      await doOffices(chatId, args, 'send');
      return true;
    }
    case '/check': {
      if (!args) {
        setState(chatId, { step: 'check_address' });
        await sendText(chatId, 'Пришлите адрес для проверки.', { markup: inline([cancelButton]) });
        return true;
      }
      await sendText(chatId, formatZone(await resolveZone(args)));
      return true;
    }
    case '/my': {
      const days = Math.min(365, Math.max(1, Math.round(parseNumber(args) || 30)));
      await doMy(chatId, days);
      return true;
    }
    case '/profile':
      await doProfile(chatId);
      return true;
    default:
      return false;
  }
}

async function askOfficeOperation(chatId: string): Promise<void> {
  await sendText(chatId, 'Что нужно сделать с грузом?', {
    markup: inline([
      [
        { text: '📤 Сдать груз', callback_data: 'office:send' },
        { text: '📥 Получить груз', callback_data: 'office:receive' }
      ],
      cancelButton
    ])
  });
}

async function handleMessage(chatId: string, rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text) return;

  // Кнопки главного меню
  switch (text) {
    case BTN.calc:
      return handleCommand(chatId, '/calc', '').then(() => undefined);
    case BTN.track:
      return handleCommand(chatId, '/track', '').then(() => undefined);
    case BTN.offices:
      return askOfficeOperation(chatId);
    case BTN.my:
      return doMy(chatId, 30);
    case BTN.watches:
      return showWatches(chatId);
    case BTN.help:
      return handleCommand(chatId, '/help', '').then(() => undefined);
  }

  if (text.startsWith('/')) {
    const [head, ...rest] = text.split(/\s+/);
    const command = head.split('@')[0].toLowerCase();
    const handled = await handleCommand(chatId, command, text.slice(head.length).trim() || rest.join(' '));
    if (!handled) await sendText(chatId, 'Неизвестная команда. /help — список команд.');
    return;
  }

  const state = getState(chatId);
  switch (state.step) {
    case 'track_code': {
      const codes = extractCargoCodes(text);
      if (!codes.length) {
        await sendText(chatId, 'Не вижу кода груза. Пришлите цифры, например 780339690775, или /cancel.');
        return;
      }
      setState(chatId, { step: 'idle' });
      await doTrack(chatId, codes);
      return;
    }
    case 'office_address':
      setState(chatId, { step: 'idle' });
      await doOffices(chatId, text, state.operation);
      return;
    case 'check_address':
      setState(chatId, { step: 'idle' });
      await sendText(chatId, formatZone(await resolveZone(text)));
      return;
    case 'idle':
      break;
    default:
      await handleCalcStep(chatId, state, text);
      return;
  }

  // Свободный текст
  if (aiEnabled()) {
    const answer = await askAgent(chatId, text);
    await sendText(chatId, escapeHtml(answer), { markup: mainMenu });
    return;
  }
  const codes = extractCargoCodes(text);
  if (codes.length) {
    await doTrack(chatId, codes);
    return;
  }
  await sendText(chatId, helpText(), { markup: mainMenu });
}

async function handleCallback(chatId: string, data: string): Promise<void> {
  const [action, value = ''] = data.split(':');
  const state = getState(chatId);
  switch (action) {
    case 'cancel':
      setState(chatId, { step: 'idle' });
      await sendText(chatId, 'Отменено.', { markup: mainMenu });
      return;
    case 'hist':
      await doTrack(chatId, [value], true);
      return;
    case 'watch':
      await doWatch(chatId, value);
      return;
    case 'unwatch':
      await doUnwatch(chatId, value);
      return;
    case 'office':
      setState(chatId, { step: 'office_address', operation: value === 'receive' ? 'receive' : 'send' });
      await sendText(chatId, 'Пришлите адрес или город — подберу ближайшие отделения.', { markup: inline([cancelButton]) });
      return;
    case 'places':
      if (state.step === 'calc_places') await handleCalcStep(chatId, state, value);
      return;
    case 'value':
      if (state.step === 'calc_value') await handleCalcStep(chatId, state, value);
      return;
    case 'calc': {
      if (value === 'again') {
        const draft = lastCalc.get(chatId);
        if (draft) await askOptions(chatId, { ...draft });
        else await handleCommand(chatId, '/calc', '');
        return;
      }
      if (state.step !== 'calc_options') return;
      const draft = state.draft;
      if (value === 'pickup') draft.pickup = !draft.pickup;
      if (value === 'delivery') draft.delivery = !draft.delivery;
      if (value === 'hp') draft.hardPackaging = !draft.hardPackaging;
      if (value === 'go') {
        await runCalc(chatId, draft);
        return;
      }
      await sendText(chatId, draftSummary(draft), { markup: optionsKeyboard(draft) });
      return;
    }
  }
}

/* ───────────────────────────── Наблюдение за грузами ───────────────────────────── */

const FINAL_STATUS_RE = /(выдан|доставлен|утилизирован|возвращен отправителю|аннулирован)/i;

async function checkSubscriptions(): Promise<void> {
  const all = readSubscriptions();
  let changed = false;
  for (const [chatId, subs] of Object.entries(all)) {
    const codes = Object.keys(subs);
    if (!codes.length || !isAllowed(chatId)) continue;
    let results;
    try {
      results = await track(codes);
    } catch (error) {
      console.error('watch: ошибка проверки', chatId, (error as Error).message);
      continue;
    }
    for (const result of results) {
      if (!(result.code in subs)) continue;
      const key = statusKey(result);
      if (subs[result.code] === key) continue;
      subs[result.code] = key;
      changed = true;
      const final = FINAL_STATUS_RE.test(result.status);
      await sendText(chatId, `🔔 <b>Статус груза изменился</b>\n\n${formatTrack([result])}${final ? '\n\n✅ Конечный статус — подписка снята.' : ''}`).catch(
        (error) => console.error('watch: не отправлено', (error as Error).message)
      );
      if (final) delete subs[result.code];
    }
  }
  if (changed) writeSubscriptions(all);
}

/* ───────────────────────────── Цикл опроса ───────────────────────────── */

async function poll(): Promise<void> {
  let offset = readJson<number>('telegram-offset.json', 0);
  console.log(
    `Помощник ПЭК запущен. ИИ: ${aiEnabled() ? config.ai.model : 'выключен'}. ` +
      `Разрешённые чаты: ${config.telegram.allowedChatIds.join(', ') || 'нет (бот ответит только chat id)'}`
  );
  await tg('setMyCommands', {
    commands: [
      { command: 'calc', description: 'Рассчитать доставку' },
      { command: 'track', description: 'Отследить груз' },
      { command: 'office', description: 'Ближайшие отделения' },
      { command: 'my', description: 'Мои грузы' },
      { command: 'watches', description: 'Подписки на грузы' },
      { command: 'help', description: 'Помощь' }
    ]
  }).catch((error) => console.error('setMyCommands', (error as Error).message));

  for (;;) {
    let updates: TgUpdate[] = [];
    try {
      updates = await tg<TgUpdate[]>('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, 45000);
    } catch (error) {
      console.error('getUpdates', (error as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      writeJson('telegram-offset.json', offset);
      const chatId = String(update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? '');
      if (!chatId) continue;

      if (update.callback_query) {
        await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id }).catch(() => undefined);
      }
      if (!isAllowed(chatId)) {
        console.warn(`Сообщение из неразрешённого чата ${chatId}`);
        await sendText(
          chatId,
          `⛔️ Доступ закрыт. Ваш chat id: <code>${escapeHtml(chatId)}</code>\nДобавьте его в TELEGRAM_ALLOWED_CHAT_IDS в .env и перезапустите бота.`
        ).catch(() => undefined);
        continue;
      }
      if (update.callback_query?.data) {
        void safe(chatId, () => handleCallback(chatId, update.callback_query!.data!));
      } else if (update.message?.text) {
        void safe(chatId, () => handleMessage(chatId, update.message!.text!));
      }
    }
  }
}

setInterval(() => {
  checkSubscriptions().catch((error) => console.error('watch', error));
}, config.watch.intervalMinutes * 60 * 1000);

poll().catch((error) => {
  console.error('Фатальная ошибка', error);
  process.exit(1);
});
