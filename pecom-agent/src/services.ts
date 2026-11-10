/**
 * Бизнес-логика помощника: расчёт, отслеживание, отделения. Возвращает и «сырые» данные (для ИИ-агента),
 * и готовый текст в Telegram-HTML (для бота).
 */
import { config } from './config';
import {
  pecApi,
  PecApiError,
  type CalcCargo,
  type CalculatePriceRequest,
  type CalculatePriceResponse,
  type Department,
  type DeliveryType,
  type OrderListItem,
  type ZoneByAddress
} from './pec-api';

export const TYPE_NAMES: Record<number, string> = {
  1: 'Express Авиа',
  3: 'LTL Авто (сборный груз)',
  5: 'Express Авто',
  7: 'Доставка в торговые сети (паллеты)',
  12: 'EasyWay Авто (для интернет-магазинов)'
};

let typesCache: DeliveryType[] | null = null;

export async function deliveryTypeName(type: number): Promise<string> {
  if (!typesCache) {
    try {
      typesCache = await pecApi.typesOfDelivery();
    } catch {
      typesCache = [];
    }
  }
  const found = typesCache.find((item) => item.type === type);
  return found?.fullName || found?.name || TYPE_NAMES[type] || `Тариф ${type}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[TТ ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value;
  const [, y, m, d, hh, mm] = match;
  if (y === '0001') return '';
  return hh ? `${d}.${m}.${y} ${hh}:${mm}` : `${d}.${m}.${y}`;
}

function money(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

function round2up(value: number): number {
  return Math.ceil(value * 100 - 1e-9) / 100;
}

/* ───────────────────────────── Разбор ввода ───────────────────────────── */

export type CargoInput = {
  weightKg: number;
  places: number;
  /** габариты одного места в метрах */
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  /** общий объём груза, м³ (если габариты мест не известны) */
  totalVolumeM3?: number;
  /** максимальный габарит места, м (обязателен вместе с объёмом) */
  maxSizeM?: number;
};

/** Число из строки с запятой или точкой */
export function parseNumber(text: string): number | null {
  const match = /-?\d+(?:[.,]\d+)?/.exec(text.replace(/\s+/g, ''));
  if (!match) return null;
  const n = Number(match[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Габариты «60x40x30» (по умолчанию в сантиметрах), «0.6*0.4*0.3 м», «600х400х300 мм».
 * Возвращает метры.
 */
export function parseDimensions(text: string): { lengthM: number; widthM: number; heightM: number } | null {
  const normalized = text.toLowerCase().replace(/,/g, '.');
  const match = /(\d+(?:\.\d+)?)\s*[x×х*]\s*(\d+(?:\.\d+)?)\s*[x×х*]\s*(\d+(?:\.\d+)?)\s*(мм|mm|см|cm|м|m)?/.exec(normalized);
  if (!match) return null;
  const values = [Number(match[1]), Number(match[2]), Number(match[3])];
  let unit = match[4];
  if (!unit) {
    // без единиц: если все значения < 5 — скорее всего метры, иначе сантиметры
    unit = values.every((v) => v < 5) ? 'м' : 'см';
  }
  const factor = unit === 'мм' || unit === 'mm' ? 0.001 : unit === 'см' || unit === 'cm' ? 0.01 : 1;
  const [lengthM, widthM, heightM] = values.map((v) => round2up(v * factor));
  if (!(lengthM > 0 && widthM > 0 && heightM > 0)) return null;
  return { lengthM, widthM, heightM };
}

/** «объём 0.5 макс 1.2» → общий объём м³ и максимальный габарит м */
export function parseVolume(text: string): { totalVolumeM3: number; maxSizeM?: number } | null {
  const normalized = text.toLowerCase().replace(/,/g, '.');
  const volume = /(\d+(?:\.\d+)?)\s*(?:м3|м³|m3|куб)/.exec(normalized) || /об[ъь]?[её]м\D*(\d+(?:\.\d+)?)/.exec(normalized);
  if (!volume) return null;
  const totalVolumeM3 = Number(volume[1]);
  if (!(totalVolumeM3 > 0)) return null;
  const max = /макс\D*(\d+(?:\.\d+)?)/.exec(normalized);
  return { totalVolumeM3, maxSizeM: max ? Number(max[1]) : undefined };
}

export function buildCalcCargos(input: CargoInput): CalcCargo[] {
  const places = Math.max(1, Math.round(input.places || 1));
  const weightPerPlace = round2up(input.weightKg / places);
  const cargos: CalcCargo[] = [];
  for (let i = 0; i < places; i += 1) {
    if (input.lengthM && input.widthM && input.heightM) {
      cargos.push({ length: input.lengthM, width: input.widthM, height: input.heightM, weight: weightPerPlace });
    } else if (input.totalVolumeM3 && input.maxSizeM) {
      cargos.push({ volume: round2up(input.totalVolumeM3 / places), maxSize: input.maxSizeM, weight: weightPerPlace });
    } else {
      throw new Error('Нужны габариты места (Д×Ш×В) или общий объём вместе с максимальным габаритом');
    }
  }
  return cargos;
}

/** Ближайший рабочий день (пн–пт) 10:00 по Москве, не раньше завтрашнего дня */
export function nextPlannedDateTime(now = new Date()): string {
  const msk = new Date(now.getTime() + 3 * 3600 * 1000);
  const date = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + 1));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T10:00:00`;
}

/* ───────────────────────────── Зоны / адреса ───────────────────────────── */

export async function resolveZone(address: string): Promise<ZoneByAddress> {
  const zone = await pecApi.findZoneByAddress(address);
  if (!zone || !zone.mainWarehouseId) {
    throw new PecApiError(`Адрес «${address}» не обслуживается ПЭК или не распознан. Уточните: страна, регион, город.`, 200);
  }
  return zone;
}

export function formatZone(zone: ZoneByAddress): string {
  const lines = [
    `📍 <b>${escapeHtml(zone.GeoData?.Address?.formatted || zone.zoneName || '')}</b>`,
    `Филиал ПЭК: <b>${escapeHtml(zone.branchTitle || '—')}</b>${zone.branchCode ? ` (${escapeHtml(zone.branchCode)})` : ''}`,
    `Тарифная зона: ${escapeHtml(zone.zoneName || '—')}`
  ];
  const precision = zone.GeoData?.precision;
  if (precision === 'bad') lines.push('⚠️ Адрес распознан плохо — заявку по нему не примут, уточните адрес.');
  if (precision === 'near') lines.push('ℹ️ Адрес распознан приблизительно — при оформлении потребуется уточнение.');
  return lines.join('\n');
}

/* ───────────────────────────── Расчёт ───────────────────────────── */

export type CalcInput = {
  from: string;
  to: string;
  cargo: CargoInput;
  declaredValue?: number;
  pickup?: boolean;
  delivery?: boolean;
  types?: number[];
  hardPackaging?: boolean;
};

export type CalcResult = {
  request: CalculatePriceRequest;
  response: CalculatePriceResponse;
  fromZone: ZoneByAddress;
  toZone: ZoneByAddress;
};

export async function calculate(input: CalcInput): Promise<CalcResult> {
  const [fromZone, toZone] = await Promise.all([resolveZone(input.from), resolveZone(input.to)]);
  const cargos = buildCalcCargos(input.cargo);
  if (input.hardPackaging) cargos.forEach((cargo) => (cargo.isHP = true));
  const declared = input.declaredValue && input.declaredValue > 0 ? input.declaredValue : 0;
  const noHandling = { isLoading: false, floor: 0, carryingDistance: 0, isElevator: false };

  const request: CalculatePriceRequest = {
    types: input.types?.length ? input.types : config.pec.calcTypes,
    senderWarehouseId: fromZone.mainWarehouseId,
    receiverWarehouseId: toZone.mainWarehouseId,
    isOpenCarSender: false,
    isOpenCarReceiver: false,
    isHyperMarket: false,
    plannedDateTime: nextPlannedDateTime(),
    isInsurance: declared > 0,
    isInsurancePrice: declared,
    isPickUp: Boolean(input.pickup),
    isDelivery: Boolean(input.delivery),
    senderDistanceType: 0,
    receiverDistanceType: 0,
    pickupServices: noHandling,
    deliveryServices: noHandling,
    cargos
  };
  if (input.pickup) request.pickup = { address: input.from };
  if (input.delivery) request.delivery = { address: input.to };

  const response = await pecApi.calculatePrice(request);
  return { request, response, fromZone, toZone };
}

function termFor(result: CalcResult, type: number): string {
  const term = result.response.commonTerms?.find((item) => item.type === type);
  if (!term) return '';
  const { isPickUp, isDelivery } = result.request;
  if (isPickUp && isDelivery && term.transportingWithDeliveryWithPickup) return term.transportingWithDeliveryWithPickup;
  if (isPickUp && term.transportingWithPickup) return term.transportingWithPickup;
  if (isDelivery && term.transportingWithDelivery?.length) return term.transportingWithDelivery[0];
  return term.transporting?.[0] || '';
}

function flattenServices(services: CalcTransfer['services'], depth = 0): string[] {
  const lines: string[] = [];
  for (const service of services || []) {
    const cost = Number(service.cost);
    if (Number.isFinite(cost) && cost > 0) {
      lines.push(`${'  '.repeat(depth)}• ${escapeHtml(String(service.info || service.serviceType).replace(/:$/, ''))}: ${money(cost)}`);
    }
    if (service.services?.length) lines.push(...flattenServices(service.services, depth + 1));
  }
  return lines;
}
type CalcTransfer = CalculatePriceResponse['transfers'][number];

export async function formatCalc(result: CalcResult): Promise<string> {
  const { request, response, fromZone, toZone } = result;
  const weight = request.cargos.reduce((sum, cargo) => sum + cargo.weight, 0);
  const volume = request.cargos.reduce(
    (sum, cargo) => sum + (cargo.volume ?? (cargo.length || 0) * (cargo.width || 0) * (cargo.height || 0)),
    0
  );
  const lines = [
    '🚚 <b>Расчёт ПЭК</b>',
    `Откуда: ${escapeHtml(fromZone.GeoData?.Address?.formatted || fromZone.branchTitle)}${request.isPickUp ? ' (забор от адреса)' : ' (сдача на склад)'}`,
    `Куда: ${escapeHtml(toZone.GeoData?.Address?.formatted || toZone.branchTitle)}${request.isDelivery ? ' (доставка до адреса)' : ' (самовывоз со склада)'}`,
    `Груз: мест ${request.cargos.length}, ${round2up(weight)} кг, ${round2up(volume)} м³${request.isInsurance ? `, страховка на ${money(request.isInsurancePrice)}` : ''}`,
    `Филиалы: ${escapeHtml(response.branchSender || fromZone.branchTitle || '—')} → ${escapeHtml(response.branchReceiver || toZone.branchTitle || '—')}`,
    `Плановая сдача груза: ${formatDateTime(request.plannedDateTime)}`,
    ''
  ];
  if (response.hasError && response.errorMessage) {
    lines.push(`⚠️ ${escapeHtml(response.errorMessage)}`, '');
  }
  for (const transfer of response.transfers || []) {
    const name = await deliveryTypeName(transfer.type);
    if (transfer.hasError) {
      lines.push(`❌ <b>${escapeHtml(name)}</b>: ${escapeHtml(transfer.errorMessage || 'расчёт невозможен')}`, '');
      continue;
    }
    const term = termFor(result, transfer.type);
    const days = term ? `${term} сут.` : transfer.estDeliveryTime ? `${transfer.estDeliveryTime} дн.` : '—';
    lines.push(`✅ <b>${escapeHtml(name)}</b>: <b>${money(transfer.costTotal)}</b>, срок ${escapeHtml(days)}`);
    lines.push(...flattenServices(transfer.services));
    lines.push('');
  }
  lines.push('<i>Стоимость ориентировочная, итог — по факту приёмки груза в ПЭК.</i>');
  return lines.join('\n');
}

/* ───────────────────────────── Отслеживание ───────────────────────────── */

export type TrackResult = {
  code: string;
  status: string;
  detail?: string;
  tooltip?: string;
  returnReason?: string;
  dates: Array<[string, string]>;
  history?: Array<{ date: string; name: string; isCancel: boolean }>;
};

const CARGO_CODE_RE = /(?<!\d)\d{9,14}(?!\d)/g;

export function extractCargoCodes(text: string): string[] {
  return Array.from(new Set(text.match(CARGO_CODE_RE) || []));
}

export async function track(codes: string[], withHistory = false): Promise<TrackResult[]> {
  const unique = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (!unique.length) throw new Error('Не указан код груза');
  const results = new Map<string, TrackResult>();

  const basic = await pecApi.basicStatus(unique).catch((error: unknown) => {
    if (error instanceof PecApiError && error.status === 404) return { cargos: [] };
    throw error;
  });
  for (const item of basic.cargos || []) {
    const code = item.cargo?.code || '';
    const info = item.info || ({} as typeof item.info);
    const dates: Array<[string, string]> = [];
    const push = (label: string, value?: string | null) => {
      const formatted = formatDateTime(value);
      if (formatted) dates.push([label, formatted]);
    };
    push('Сдан в ПЭК', info.takeOnStockDateTime);
    push('Отправлен', info.sendingDateTime);
    push('Плановое прибытие', info.arrivalPlanDateTime);
    push('Прибыл', info.arrivalDateTime);
    push('Плановая доставка', info.deliveryPlanDate);
    push('Выдан с филиала', info.giveOutDateTime);
    push('Получен клиентом', info.receivedByClientDateTime);
    results.set(code, { code, status: info.cargoStatus || 'неизвестно', dates });
  }

  // Детализированный статус (метод доступен зарегистрированным пользователям)
  for (let i = 0; i < unique.length; i += 15) {
    try {
      const current = await pecApi.currentStatus(unique.slice(i, i + 15));
      for (const item of current.cargos || []) {
        const existing = results.get(item.cargoCode) || { code: item.cargoCode, status: '', dates: [] };
        existing.status = item.currentStatus?.ClientStatus || existing.status;
        existing.detail = item.currentStatus?.ClientStatusLevel2 || undefined;
        existing.tooltip = item.currentStatus?.Tooltip || undefined;
        existing.returnReason = item.currentStatus?.ReturnReason || undefined;
        results.set(item.cargoCode, existing);
      }
    } catch {
      // базового статуса достаточно
    }
  }

  if (withHistory && results.size) {
    try {
      const history = await pecApi.statusFullHistory(Array.from(results.keys()));
      for (const item of history || []) {
        const target = results.get(item.cargoCode);
        if (target) {
          target.history = (item.statuses || []).map((s) => ({ date: s.date, name: s.name, isCancel: s.isCancel }));
        }
      }
    } catch {
      // история необязательна
    }
  }

  for (const code of unique) {
    if (!results.has(code)) results.set(code, { code, status: 'не найден', dates: [] });
  }
  return unique.map((code) => results.get(code)!).concat(
    Array.from(results.values()).filter((item) => !unique.includes(item.code))
  );
}

export function statusKey(result: TrackResult): string {
  return [result.status, result.detail || ''].join(' | ');
}

export function formatTrack(results: TrackResult[]): string {
  return results
    .map((r) => {
      const lines = [`📦 Груз <code>${escapeHtml(r.code)}</code>: <b>${escapeHtml(r.status)}</b>`];
      if (r.detail) lines.push(escapeHtml(r.detail));
      if (r.tooltip) lines.push(`<i>${escapeHtml(r.tooltip)}</i>`);
      if (r.returnReason) lines.push(`Причина возврата: ${escapeHtml(r.returnReason)}`);
      for (const [label, value] of r.dates) lines.push(`${escapeHtml(label)}: ${escapeHtml(value)}`);
      if (r.history?.length) {
        lines.push('', '<b>История:</b>');
        for (const h of r.history) {
          const text = `${formatDateTime(h.date)} — ${escapeHtml(h.name)}`;
          lines.push(h.isCancel ? `<s>${text}</s>` : text);
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/* ───────────────────────────── Отделения ───────────────────────────── */

export async function findOffices(
  address: string,
  operation: 'send' | 'receive' = 'send',
  cargo?: { weightKg?: number; volumeM3?: number; maxDimensionM?: number },
  limit = 5
): Promise<Department[]> {
  const response = await pecApi.nearestDepartments({
    address,
    weight: cargo?.weightKg ?? null,
    volume: cargo?.volumeM3 ?? null,
    maxDimension: cargo?.maxDimensionM ?? null,
    maxWeightPerPlace: null,
    departmentOperation: operation === 'send' ? 2 : 3,
    type: 3,
    searchRadius: 50,
    limit
  });
  return [...(response.freeDepartments || []), ...(response.paidDepartments || [])].slice(0, limit * 2);
}

export function formatOffices(address: string, offices: Department[], operation: 'send' | 'receive'): string {
  if (!offices.length) return `Рядом с «${escapeHtml(address)}» подходящих отделений ПЭК не найдено (радиус 50 км).`;
  const header = `🏢 <b>Отделения ПЭК для ${operation === 'send' ? 'сдачи' : 'получения'} груза</b> рядом с «${escapeHtml(address)}»:`;
  const items = offices.map((o, index) => {
    const limits: string[] = [];
    if (o.maxWeight) limits.push(`до ${o.maxWeight} кг`);
    if (o.maxVolume) limits.push(`до ${o.maxVolume} м³`);
    if (o.maxDimension) limits.push(`габарит до ${o.maxDimension} м`);
    if (o.maxWeightOnePlace) limits.push(`место до ${o.maxWeightOnePlace} кг`);
    const lines = [
      `${index + 1}. <b>${escapeHtml(o.divisionName)}</b> — ${escapeHtml(o.departmentType)}`,
      `   ${escapeHtml(o.address)}`
    ];
    if (o.phone) lines.push(`   ☎️ ${escapeHtml(o.phone)}`);
    if (limits.length) lines.push(`   Ограничения: ${escapeHtml(limits.join(', '))}`);
    if (o.coordinates) {
      lines.push(`   <a href="https://yandex.ru/maps/?pt=${o.coordinates.longitude},${o.coordinates.latitude}&z=16&l=map">на карте</a>`);
    }
    return lines.join('\n');
  });
  return [header, ...items].join('\n');
}

/* ───────────────────────────── Мои грузы ───────────────────────────── */

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function myCargos(days = 30): Promise<OrderListItem[]> {
  const end = new Date();
  const begin = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const response = await pecApi.listAllOrderByLogin(1, isoDate(begin), isoDate(end));
  const list = (response?.['cargos'] || response?.['сargos'] || []) as OrderListItem[];
  return list;
}

export function cargoCodeOf(item: OrderListItem): string {
  return item.code || item['сode'] || '';
}

export function formatMyCargos(items: OrderListItem[], days: number): string {
  if (!items.length) return `За последние ${days} дн. грузов в личном кабинете не найдено.`;
  const lines = [`📋 <b>Грузы за ${days} дн.</b> (${items.length} шт.):`];
  for (const item of items.slice(0, 30)) {
    const from = item.Sender?.IntakeAddress || item.Sender?.WarehouseAddress || '';
    const to = item.Receiver?.DelivieryAddress || item.Receiver?.WarehouseAddress || '';
    lines.push(
      `• <code>${escapeHtml(cargoCodeOf(item))}</code> ${escapeHtml(formatDateTime(item.orderDate))}` +
        `${item.description ? ` — ${escapeHtml(item.description)}` : ''}` +
        `${from || to ? `\n  ${escapeHtml(from)} → ${escapeHtml(to)}` : ''}`
    );
  }
  if (items.length > 30) lines.push(`…и ещё ${items.length - 30}`);
  return lines.join('\n');
}
