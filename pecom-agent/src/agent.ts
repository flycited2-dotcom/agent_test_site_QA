/**
 * ИИ-помощник по ПЭК на Claude: понимает свободный текст («сколько стоит отправить 2 коробки
 * по 15 кг из Симферополя в Москву?») и сам вызывает инструменты API ПЭК.
 * Включается, если задан ANTHROPIC_API_KEY.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import {
  calculate,
  extractCargoCodes,
  findOffices,
  myCargos,
  cargoCodeOf,
  resolveZone,
  track,
  deliveryTypeName
} from './services';

const SYSTEM_PROMPT = `Ты — помощник клиента транспортной компании «ПЭК» (pecom.ru). Работаешь в Telegram.
Ты помогаешь: рассчитать стоимость и срок перевозки, отследить груз по коду, подобрать отделение ПЭК
для сдачи или получения груза, проверить, обслуживает ли ПЭК адрес, посмотреть грузы в личном кабинете.

Правила:
- Все цифры (стоимость, сроки, статусы, адреса отделений) бери только из результатов инструментов. Ничего не выдумывай.
  Если инструмент вернул ошибку — объясни её простыми словами и подскажи, какие данные уточнить.
- Для расчёта нужны: откуда, куда, общий вес, количество мест и габариты места (или общий объём и максимальный габарит).
  Если чего-то не хватает — коротко спроси. Габариты без единиц считай сантиметрами. Объявленную стоимость
  (для страховки) спроси один раз, если пользователь её не назвал — можно считать без страховки.
- Забор от адреса и доставку до адреса включай, только если пользователь об этом говорит.
- Адреса передавай полностью: страна, регион, город, улица, дом (сколько известно).
- Отвечай по-русски, коротко и по делу. Форматирование — только простой текст и эмодзи, без Markdown-таблиц.
- Стоимость ориентировочная, итоговая — по факту приёмки груза. Упоминай это при расчётах.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'calculate_delivery',
    description:
      'Рассчитать стоимость и срок перевозки ПЭК по всем доступным тарифам (авто, авиа). Возвращает стоимость по каждому тарифу, услуги и сроки.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Откуда: город или полный адрес (для забора — полный адрес)' },
        to: { type: 'string', description: 'Куда: город или полный адрес (для доставки — полный адрес)' },
        weight_kg: { type: 'number', description: 'Общий вес груза, кг' },
        places: { type: 'integer', description: 'Количество мест (коробок, паллет)' },
        length_m: { type: 'number', description: 'Длина одного места, м' },
        width_m: { type: 'number', description: 'Ширина одного места, м' },
        height_m: { type: 'number', description: 'Высота одного места, м' },
        total_volume_m3: { type: 'number', description: 'Общий объём, м³ — если габариты места неизвестны' },
        max_size_m: { type: 'number', description: 'Максимальный габарит места, м — обязателен вместе с total_volume_m3' },
        declared_value_rub: { type: 'number', description: 'Объявленная стоимость груза для страхования, руб. 0 — без страховки' },
        pickup: { type: 'boolean', description: 'Нужен забор груза от адреса отправителя' },
        delivery: { type: 'boolean', description: 'Нужна доставка до адреса получателя' },
        hard_packaging: { type: 'boolean', description: 'Защитная транспортировочная упаковка' }
      },
      required: ['from', 'to', 'weight_kg', 'places']
    }
  },
  {
    name: 'track_cargo',
    description: 'Статус груза ПЭК по коду груза (можно несколько кодов). Возвращает статус, ключевые даты и, по запросу, историю статусов.',
    input_schema: {
      type: 'object',
      properties: {
        cargo_codes: { type: 'array', items: { type: 'string' }, description: 'Коды грузов, например 780339690775' },
        with_history: { type: 'boolean', description: 'Вернуть полную историю статусов' }
      },
      required: ['cargo_codes']
    }
  },
  {
    name: 'find_offices',
    description: 'Найти ближайшие к адресу отделения и ПВЗ ПЭК для сдачи (send) или получения (receive) груза.',
    input_schema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Адрес или город' },
        operation: { type: 'string', enum: ['send', 'receive'], description: 'send — сдать груз, receive — получить груз' },
        weight_kg: { type: 'number', description: 'Вес груза, кг (для отбора по ограничениям)' },
        volume_m3: { type: 'number', description: 'Объём груза, м³' },
        max_dimension_m: { type: 'number', description: 'Максимальный габарит, м' }
      },
      required: ['address', 'operation']
    }
  },
  {
    name: 'check_address',
    description: 'Проверить, обслуживает ли ПЭК адрес: филиал, тарифная зона, точность распознавания адреса.',
    input_schema: {
      type: 'object',
      properties: { address: { type: 'string', description: 'Адрес' } },
      required: ['address']
    }
  },
  {
    name: 'list_my_cargos',
    description: 'Список грузов в личном кабинете ПЭК клиента за последние N дней (по дате заявки).',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'Сколько дней назад смотреть, по умолчанию 30' } },
      required: []
    }
  }
];

type ToolInput = Record<string, unknown>;

async function runTool(name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    case 'calculate_delivery': {
      const result = await calculate({
        from: String(input.from),
        to: String(input.to),
        cargo: {
          weightKg: Number(input.weight_kg),
          places: Number(input.places) || 1,
          lengthM: input.length_m as number | undefined,
          widthM: input.width_m as number | undefined,
          heightM: input.height_m as number | undefined,
          totalVolumeM3: input.total_volume_m3 as number | undefined,
          maxSizeM: input.max_size_m as number | undefined
        },
        declaredValue: Number(input.declared_value_rub) || 0,
        pickup: Boolean(input.pickup),
        delivery: Boolean(input.delivery),
        hardPackaging: Boolean(input.hard_packaging)
      });
      const transfers = await Promise.all(
        (result.response.transfers || []).map(async (t) => ({
          tariff: await deliveryTypeName(t.type),
          error: t.hasError ? t.errorMessage : null,
          cost_total_rub: t.costTotal,
          est_delivery_days: t.estDeliveryTime,
          services: t.services
        }))
      );
      return {
        from: result.fromZone.GeoData?.Address?.formatted || result.fromZone.branchTitle,
        to: result.toZone.GeoData?.Address?.formatted || result.toZone.branchTitle,
        branch_sender: result.response.branchSender,
        branch_receiver: result.response.branchReceiver,
        planned_handover: result.request.plannedDateTime,
        pickup: result.request.isPickUp,
        delivery: result.request.isDelivery,
        error: result.response.hasError ? result.response.errorMessage : null,
        transfers,
        terms: result.response.commonTerms
      };
    }
    case 'track_cargo': {
      const codes = Array.isArray(input.cargo_codes)
        ? (input.cargo_codes as unknown[]).map(String)
        : extractCargoCodes(String(input.cargo_codes ?? ''));
      return track(codes, Boolean(input.with_history));
    }
    case 'find_offices': {
      const offices = await findOffices(String(input.address), input.operation === 'receive' ? 'receive' : 'send', {
        weightKg: input.weight_kg as number | undefined,
        volumeM3: input.volume_m3 as number | undefined,
        maxDimensionM: input.max_dimension_m as number | undefined
      });
      return offices.map((o) => ({
        name: o.divisionName,
        type: o.departmentType,
        address: o.address,
        phone: o.phone,
        email: o.email,
        limits: { maxWeight: o.maxWeight, maxVolume: o.maxVolume, maxDimension: o.maxDimension, maxWeightOnePlace: o.maxWeightOnePlace }
      }));
    }
    case 'check_address': {
      const zone = await resolveZone(String(input.address));
      return {
        formatted: zone.GeoData?.Address?.formatted,
        precision: zone.GeoData?.precision,
        branch: zone.branchTitle,
        zone: zone.zoneName
      };
    }
    case 'list_my_cargos': {
      const days = Number(input.days) > 0 ? Math.min(Number(input.days), 365) : 30;
      const items = await myCargos(days);
      return items.slice(0, 50).map((item) => ({
        code: cargoCodeOf(item),
        order_date: item.orderDate,
        order_number: item.orderNumber,
        description: item.description,
        from: item.Sender?.IntakeAddress || item.Sender?.WarehouseAddress,
        to: item.Receiver?.DelivieryAddress || item.Receiver?.WarehouseAddress
      }));
    }
    default:
      throw new Error(`Неизвестный инструмент: ${name}`);
  }
}

const client = new Anthropic({ apiKey: config.ai.apiKey || undefined });
const histories = new Map<string, Anthropic.Beta.BetaMessageParam[]>();

export function resetConversation(chatId: string): void {
  histories.delete(chatId);
}

export async function askAgent(chatId: string, userText: string): Promise<string> {
  let messages = histories.get(chatId) || [];
  if (messages.length >= config.ai.maxHistoryMessages) messages = [];
  messages.push({ role: 'user', content: userText });

  for (let step = 0; step < 8; step += 1) {
    const response = await client.beta.messages.create({
      model: config.ai.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: config.ai.effort },
      system: SYSTEM_PROMPT,
      tools,
      messages
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'refusal') {
      histories.delete(chatId);
      return 'Не могу ответить на этот запрос. Попробуйте переформулировать.';
    }
    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      histories.set(chatId, messages);
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return text || 'Готово.';
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (toolUse) => {
        try {
          const output = await runTool(toolUse.name, (toolUse.input || {}) as ToolInput);
          return { type: 'tool_result' as const, tool_use_id: toolUse.id, content: JSON.stringify(output) };
        } catch (error) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: `Ошибка: ${(error as Error).message}`,
            is_error: true
          };
        }
      })
    );
    messages.push({ role: 'user', content: results });
  }

  histories.delete(chatId);
  return 'Не удалось завершить запрос за отведённое число шагов. Попробуйте сформулировать проще или воспользуйтесь кнопками меню.';
}
