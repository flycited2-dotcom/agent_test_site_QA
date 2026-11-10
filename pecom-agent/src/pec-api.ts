/**
 * Клиент API личного кабинета ПЭК.
 * Документация: https://kabinet.pecom.ru/api/v1/
 *
 * - POST https://kabinet.pecom.ru/api/v1/<группа>/<метод>/
 * - Basic-аутентификация: логин личного кабинета + ключ API (как пароль)
 * - JSON в UTF-8, заголовки Content-Type / Accept, поддерживается gzip
 * - Логические ошибки приходят с кодом 200 и телом { "error": { "title", "message" } }
 */
import { config } from './config';

export class PecApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PecApiError';
  }
}

export type Coordinates = { latitude: number | string; longitude: number | string };

export type DeliveryType = {
  type: number;
  name: string;
  fullName: string;
  contractIsRequired: boolean;
};

export type ProfileData = {
  name: string;
  inn: string;
  kpp: string;
  email: string;
  phone: string;
};

export type ZoneByAddress = {
  zoneId?: string;
  zoneName?: string;
  branchUID?: string;
  branchCode?: string;
  branchTitle?: string;
  mainWarehouseId?: string;
  warehousePoint?: { latitude: number; longitude: number };
  GeoData?: {
    precision?: 'exact' | 'near' | 'bad' | string;
    kind?: string;
    Address?: {
      country_code?: string;
      formatted?: string;
      Components?: Array<{ kind: string; name: string }>;
    };
  };
};

export type Department = {
  warehouseId: string;
  departmentType: string;
  departmentTypeId: number;
  branchId?: string;
  branchName: string;
  divisionName: string;
  address: string;
  coordinates?: { latitude: number; longitude: number };
  timeZone?: string;
  email?: string;
  phone?: string;
  maxWeight?: number;
  maxVolume?: number;
  maxDimension?: number;
  maxWeightOnePlace?: number;
  maxCount?: number;
  scheduleHolidayDays?: string[];
};

export type NearestDepartmentsResponse = {
  freeDepartments?: Department[];
  paidDepartments?: Department[];
};

export type NearestDepartmentsRequest = {
  address?: string;
  coordinates?: { latitude: string; longitude: string };
  weight?: number | null;
  volume?: number | null;
  maxDimension?: number | null;
  maxWeightPerPlace?: number | null;
  departmentOperation: 2 | 3;
  type: number;
  searchRadius: number;
  limit: number;
};

export type CalcCargo = {
  length?: number;
  width?: number;
  height?: number;
  volume?: number;
  maxSize?: number;
  isHP?: boolean;
  sealingPositionsCount?: number;
  weight: number;
  maxPlaceWeight?: number;
};

export type HandlingServices = {
  isLoading: boolean;
  floor: number;
  carryingDistance: number;
  isElevator: boolean;
};

export type CalculatePriceRequest = {
  currencyCode?: string;
  types: number[];
  senderWarehouseId?: string;
  receiverWarehouseId?: string;
  isOpenCarSender: boolean;
  isOpenCarReceiver: boolean;
  isHyperMarket: boolean;
  plannedDateTime: string;
  isInsurance: boolean;
  isInsurancePrice: number;
  isPickUp: boolean;
  isDelivery: boolean;
  needReturnDocuments?: boolean;
  needArrangeTransportationDocuments?: boolean;
  senderDistanceType: number;
  receiverDistanceType: number;
  pickupServices?: HandlingServices;
  deliveryServices?: HandlingServices;
  pickup?: { address: string; coordinates?: { latitude: string; longitude: string } };
  delivery?: { address: string; coordinates?: { latitude: string; longitude: string } };
  cargos: CalcCargo[];
};

export type CalcService = {
  serviceType: string;
  senderCity?: string;
  cost: number | string;
  info: string;
  insuranceTerm?: boolean;
  services: CalcService[] | null;
};

export type CalcTransfer = {
  type: number;
  hasError: boolean;
  errorMessage: string | null;
  costTotal: number;
  estDeliveryTime?: number;
  services: CalcService[];
};

export type CalcCommonTerm = {
  type: number;
  branchSender?: string;
  branchReceiver?: string;
  discountedDeliveryWeekDays?: number[];
  transporting?: string[];
  transportingWithDelivery?: string[];
  transportingWithPickup?: string;
  transportingWithDeliveryWithPickup?: string;
  senderShippingDays?: number[];
};

export type CalculatePriceResponse = {
  hasError: boolean;
  errorMessage: string | null;
  currencyCode?: string;
  branchSenderUID?: string;
  branchSender?: string;
  branchReceiverUID?: string;
  branchReceiver?: string;
  transfers: CalcTransfer[];
  transportingTimes?: string[];
  commonTerms?: CalcCommonTerm[];
};

export type BasicStatusItem = {
  info: {
    cargoStatus: string;
    takeOnStockDateTime?: string | null;
    sendingDateTime?: string | null;
    arrivalDateTime?: string | null;
    giveOutDateTime?: string | null;
    arrivalPlanDateTime?: string | null;
    deliveryPlanDate?: string | null;
    receivedByClientDateTime?: string | null;
  };
  cargo: {
    code: string;
    cargoBarCode?: string;
    positionBarCodes?: string[];
  };
};

export type CurrentStatusItem = {
  cargoCode: string;
  currentStatus: {
    Tooltip?: string;
    Id?: number;
    ClientStatus?: string;
    IsActive?: boolean;
    ClientStatusLevel2?: string;
    ReturnReason?: string;
  };
};

export type StatusHistoryItem = {
  cargoCode: string;
  statuses: Array<{ id: number; date: string; name: string; isCancel: boolean; isFinal: boolean }>;
};

export type OrderListItem = {
  // В документации ПЭК ключи "сargos"/"сode" написаны с кириллической «с» — поддерживаем оба варианта
  code?: string;
  сode?: string;
  orderNumber?: string;
  cargoStatus?: number;
  description?: string;
  orderDate?: string;
  intakePlanDateTime?: string;
  takeOnStockDateTime?: string;
  kindOfTransportationType?: string;
  shippingType?: string;
  Sender?: { IntakeAddress?: string; WarehouseAddress?: string; Counterpart?: { Name?: string } };
  Receiver?: { DelivieryAddress?: string; WarehouseAddress?: string; Counterpart?: { Name?: string } };
};

export class PecApi {
  constructor(
    private readonly login = config.pec.login,
    private readonly apiKey = config.pec.apiKey,
    private readonly baseUrl = config.pec.baseUrl,
    private readonly timeoutMs = config.pec.timeoutMs
  ) {}

  isConfigured(): boolean {
    return Boolean(this.login && this.apiKey);
  }

  async call<T>(group: string, method: string, body: unknown = {}): Promise<T> {
    if (!this.isConfigured()) {
      throw new PecApiError('Не заданы PEC_LOGIN и/или PEC_API_KEY в .env', 0);
    }
    const url = `${this.baseUrl}/${group}/${method}/`;
    const auth = Buffer.from(`${this.login}:${this.apiKey}`, 'utf8').toString('base64');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json;charset=utf-8',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip'
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal
      });
    } catch (error) {
      const reason = controller.signal.aborted ? `таймаут ${this.timeoutMs} мс` : (error as Error).message;
      throw new PecApiError(`ПЭК API недоступен (${group}/${method}): ${reason}`, 0);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    const apiError = extractError(data);
    if (apiError) {
      throw new PecApiError(apiError, response.status, data);
    }
    if (response.status === 404) {
      throw new PecApiError(`Метод ПЭК API не найден: ${group}/${method}`, 404);
    }
    if (response.status === 401 || response.status === 403) {
      throw new PecApiError('Нет доступа к методу ПЭК API (проверьте логин, ключ API и права)', response.status);
    }
    if (!response.ok) {
      throw new PecApiError(`ПЭК API вернул HTTP ${response.status}`, response.status, text.slice(0, 500));
    }
    if (data === null && text) {
      throw new PecApiError('ПЭК API вернул не-JSON ответ', response.status, text.slice(0, 500));
    }
    return data as T;
  }

  profileData(): Promise<ProfileData> {
    return this.call('auth', 'profiledata', {});
  }

  typesOfDelivery(): Promise<DeliveryType[]> {
    return this.call('typesofdelivery', 'all', {});
  }

  findZoneByAddress(address: string): Promise<ZoneByAddress> {
    return this.call('branches', 'findzonebyaddress', { address });
  }

  nearestDepartments(request: NearestDepartmentsRequest): Promise<NearestDepartmentsResponse> {
    return this.call('branches', 'nearestdepartments', request);
  }

  calculatePrice(request: CalculatePriceRequest): Promise<CalculatePriceResponse> {
    return this.call('calculator', 'calculateprice', request);
  }

  basicStatus(cargoCodes: string[]): Promise<{ cargos: BasicStatusItem[] }> {
    return this.call('cargos', 'basicstatus', { cargoCodes: cargoCodes.slice(0, 50) });
  }

  currentStatus(cargoCodes: string[]): Promise<{ cargos: CurrentStatusItem[] }> {
    return this.call('cargos', 'currentstatus', { cargoCodes: cargoCodes.slice(0, 15) });
  }

  statusFullHistory(cargoCodes: string[]): Promise<StatusHistoryItem[]> {
    return this.call('cargos', 'statusfullhistory', { cargoCodes });
  }

  listAllOrderByLogin(selectBy: 0 | 1 | 2, dateBegin: string, dateEnd: string): Promise<Record<string, OrderListItem[]>> {
    return this.call('cargos', 'listallorderbylogin', { selectBy, dateBegin, dateEnd });
  }
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('error' in data)) return null;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const e = error as { title?: string; message?: string; fields?: Array<{ Key?: string; Value?: string[] }> };
  const parts = [e.title, e.message].filter((part) => part && String(part).trim());
  if (Array.isArray(e.fields)) {
    for (const field of e.fields) {
      const values = Array.isArray(field.Value) ? field.Value.join('; ') : '';
      parts.push(`${field.Key ?? 'поле'}: ${values}`);
    }
  }
  return parts.join(' — ') || 'Ошибка ПЭК API';
}

export const pecApi = new PecApi();
