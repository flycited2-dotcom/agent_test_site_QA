import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { parseCommand, helpText } from './commands';
import { normalizeDepth, normalizeProfile, readRuntimeConfig, writeRuntimeConfig, updateRuntimeSite, type RuntimeConfig, type SiteProfile, type TestDepth } from '../utils/runtime-config';
import { listReportFiles, todayIso } from '../reporters/report-files';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const controlPath = path.resolve('storage/control.json');
const offsetPath = path.resolve('storage/telegram-offset.txt');

if (!token || !chatId) {
  console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is empty');
  process.exit(0);
}

type ReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

function writeControl(value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(controlPath), { recursive: true });
  fs.writeFileSync(controlPath, JSON.stringify(value, null, 2), 'utf8');
}

function mainKeyboard(runtime = readRuntimeConfig()): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Статус', callback_data: 'status' },
        { text: 'Отчёт', callback_data: 'report' }
      ],
      [
        { text: runtime.site.depth === 'smoke' ? 'Smoke активен' : 'Smoke', callback_data: 'mode:smoke' },
        { text: runtime.site.depth === 'critical' ? 'Critical активен' : 'Critical', callback_data: 'mode:critical' },
        { text: runtime.site.depth === 'full' ? 'Full активен' : 'Full', callback_data: 'mode:full' }
      ],
      [
        { text: 'Smoke сейчас', callback_data: 'run:smoke' },
        { text: 'Critical сейчас', callback_data: 'run:critical' },
        { text: 'Full сейчас', callback_data: 'run:full' }
      ],
      [
        { text: `Профиль: ${runtime.site.profile}`, callback_data: 'menu:profile' }
      ],
      [
        { text: 'Выбор запуска', callback_data: 'menu:run' },
        { text: 'Перезапуск', callback_data: 'restart' }
      ],
      [
        { text: 'Пауза', callback_data: 'pause' },
        { text: 'Продолжить', callback_data: 'resume' }
      ]
    ]
  };
}

function modeKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Smoke', callback_data: 'mode:smoke' },
        { text: 'Critical', callback_data: 'mode:critical' },
        { text: 'Full', callback_data: 'mode:full' }
      ],
      [{ text: 'Назад', callback_data: 'menu:main' }]
    ]
  };
}

function runKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Smoke сейчас', callback_data: 'run:smoke' },
        { text: 'Critical сейчас', callback_data: 'run:critical' }
      ],
      [
        { text: 'Full сейчас', callback_data: 'run:full' },
        { text: 'Назад', callback_data: 'menu:main' }
      ]
    ]
  };
}

function profileKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Авто', callback_data: 'profile:auto' },
        { text: 'Лендинг', callback_data: 'profile:landing' }
      ],
      [
        { text: 'Контент', callback_data: 'profile:content' },
        { text: 'Каталог', callback_data: 'profile:catalog' },
        { text: 'Магазин', callback_data: 'profile:shop' }
      ],
      [{ text: 'Назад', callback_data: 'menu:main' }]
    ]
  };
}

async function telegram(method: string, body: Record<string, unknown> | FormData): Promise<any> {
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Telegram ${method} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sendMessage(text: string, replyMarkup?: ReplyMarkup): Promise<void> {
  await telegram('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

async function answerCallback(callbackQueryId: string): Promise<void> {
  await telegram('answerCallbackQuery', { callback_query_id: callbackQueryId });
}

async function sendDocument(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) return;
  const data = new FormData();
  data.set('chat_id', chatId);
  data.set('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  await telegram('sendDocument', data);
}

function runCommand(command: string, args: string[]): void {
  const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
  child.unref();
}

function setDepth(runtime: RuntimeConfig, depth: TestDepth): RuntimeConfig {
  runtime.site.depth = depth;
  writeRuntimeConfig(runtime);
  return runtime;
}

function setProfile(runtime: RuntimeConfig, profile: SiteProfile): RuntimeConfig {
  runtime.site.profile = profile;
  writeRuntimeConfig(runtime);
  return runtime;
}

async function sendMenu(): Promise<void> {
  const runtime = readRuntimeConfig();
  await sendMessage([
    'Панель QA Agent',
    `Сайт: ${runtime.site.url}`,
    `Режим расписания: ${runtime.site.depth}`,
    `Профиль: ${runtime.site.profile}`
  ].join('\n'), mainKeyboard(runtime));
}

async function handle(text: string): Promise<void> {
  const command = parseCommand(text);
  const runtime = readRuntimeConfig();

  if (command.type === 'menu') {
    await sendMenu();
    return;
  }

  if (command.type === 'status') {
    const activePath = path.resolve('reports/developer/QA_ACTIVE_ISSUES.md');
    const coveragePath = path.resolve('reports/developer/QA_COVERAGE.md');
    const active = fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf8') : 'Активный отчёт ещё не создан.';
    const coverage = fs.existsSync(coveragePath) ? fs.readFileSync(coveragePath, 'utf8') : 'Отчёт покрытия ещё не создан.';
    await sendMessage(`Сайт: ${runtime.site.url}\nПрофиль: ${runtime.site.profile}\nРежим расписания: ${runtime.site.depth}\n\n${active.slice(0, 1400)}\n\n${coverage.slice(0, 1400)}`, mainKeyboard(runtime));
    return;
  }

  if (command.type === 'report') {
    const files = listReportFiles(todayIso());
    for (const file of files) await sendDocument(file.path);
    await sendMessage(files.length ? 'Отчёты отправлены.' : 'Отчёты ещё не созданы. Запустите /запуск smoke.', mainKeyboard(runtime));
    return;
  }

  if (command.type === 'run') {
    runCommand('npm', ['run', `qa:run:${command.depth}`]);
    await sendMessage(`Запустил проверку: ${command.depth}`, mainKeyboard(runtime));
    return;
  }

  if (command.type === 'pause') {
    writeControl({ paused: true, updatedAt: new Date().toISOString() });
    await sendMessage('Расписание поставлено на паузу.', mainKeyboard(runtime));
    return;
  }

  if (command.type === 'resume') {
    writeControl({ paused: false, updatedAt: new Date().toISOString() });
    await sendMessage('Расписание продолжено.', mainKeyboard(runtime));
    return;
  }

  if (command.type === 'restart') {
    writeControl({ paused: false, restartedAt: new Date().toISOString() });
    runCommand('npm', ['run', `qa:run:${runtime.site.depth}`]);
    await sendMessage(`Перезапустил агента и запустил проверку: ${runtime.site.depth}`, mainKeyboard(runtime));
    return;
  }

  if (command.type === 'site') {
    const next = updateRuntimeSite(command.url);
    await sendMessage(`Сайт переключён: ${next.site.url}\nПрофиль: ${next.site.profile}`, mainKeyboard(next));
    return;
  }

  if (command.type === 'profile') {
    setProfile(runtime, command.profile);
    await sendMessage(`Профиль установлен: ${command.profile}`, mainKeyboard(runtime));
    return;
  }

  if (command.type === 'depth') {
    setDepth(runtime, command.depth);
    await sendMessage(`Режим расписания установлен: ${command.depth}`, mainKeyboard(runtime));
    return;
  }

  await sendMessage(helpText(), mainKeyboard(runtime));
}

async function handleCallback(data: string, callbackQueryId: string): Promise<void> {
  await answerCallback(callbackQueryId);
  const runtime = readRuntimeConfig();

  if (data === 'menu:main') {
    await sendMenu();
    return;
  }
  if (data === 'menu:mode') {
    await sendMessage('Выберите режим расписания. После выбора планировщик будет запускать только этот тип проверки.', modeKeyboard());
    return;
  }
  if (data === 'menu:run') {
    await sendMessage('Какую проверку запустить прямо сейчас?', runKeyboard());
    return;
  }
  if (data === 'menu:profile') {
    await sendMessage('Выберите профиль сайта.', profileKeyboard());
    return;
  }
  if (data.startsWith('mode:')) {
    const depth = normalizeDepth(data.slice('mode:'.length));
    setDepth(runtime, depth);
    await sendMessage(`Режим расписания установлен: ${depth}`, mainKeyboard(runtime));
    return;
  }
  if (data.startsWith('run:')) {
    const depth = normalizeDepth(data.slice('run:'.length));
    runCommand('npm', ['run', `qa:run:${depth}`]);
    await sendMessage(`Запустил проверку: ${depth}`, mainKeyboard(runtime));
    return;
  }
  if (data.startsWith('profile:')) {
    const profile = normalizeProfile(data.slice('profile:'.length));
    setProfile(runtime, profile);
    await sendMessage(`Профиль установлен: ${profile}`, mainKeyboard(runtime));
    return;
  }

  if (data === 'status') await handle('/статус');
  else if (data === 'report') await handle('/отчет');
  else if (data === 'pause') await handle('/пауза');
  else if (data === 'resume') await handle('/продолжить');
  else if (data === 'restart') await handle('/перезапуск');
  else await sendMenu();
}

async function poll(): Promise<void> {
  let offset = fs.existsSync(offsetPath) ? Number(fs.readFileSync(offsetPath, 'utf8')) : 0;
  while (true) {
    try {
      const updates = await telegram('getUpdates', { timeout: 25, offset });
      for (const update of updates.result || []) {
        offset = update.update_id + 1;
        fs.mkdirSync(path.dirname(offsetPath), { recursive: true });
        fs.writeFileSync(offsetPath, String(offset), 'utf8');
        const callback = update.callback_query;
        if (callback && String(callback.message?.chat?.id) === String(chatId) && callback.data) {
          await handleCallback(callback.data, callback.id);
          continue;
        }

        const message = update.message;
        if (!message || String(message.chat?.id) !== String(chatId) || !message.text) continue;
        await handle(message.text);
      }
    } catch (error) {
      console.log(`Telegram bot polling error: ${(error as Error).message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

await poll();
