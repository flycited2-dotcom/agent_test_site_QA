/** Сквозной тест логики на ответах-примерах из документации API ПЭК (сеть не используется). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PEC_LOGIN = 'demo';
process.env.PEC_API_KEY = 'DEMOKEY';

const calls: Array<{ url: string; body: any; auth: string }> = [];
const responses: Record<string, unknown> = {
  'branches/findzonebyaddress': {
    zoneId: 'z', zoneName: 'Москва город', branchUID: 'b', branchCode: 'МС', branchTitle: 'Москва',
    mainWarehouseId: 'dc6c746d-812d-11e4-bbfc-001999d8b3c5',
    GeoData: { precision: 'exact', kind: 'locality', Address: { formatted: 'Россия, Москва' } }
  },
  'calculator/calculateprice': {
    hasError: false, errorMessage: null, branchSender: 'Москва Восток', branchReceiver: 'Санкт-Петербург',
    transfers: [
      { type: 3, hasError: false, errorMessage: null, costTotal: 5319, estDeliveryTime: 3,
        services: [{ serviceType: 'Перевозка', cost: 5269, info: 'Перевозка:', services: null },
                   { serviceType: 'Перевозка', cost: 50, info: 'Страхование:', services: null }] },
      { type: 1, hasError: true, errorMessage: 'Длина груза превышает допустимую для АВИА.', costTotal: 0, services: [] }
    ],
    transportingTimes: ['0001-01-01T12:00:00'],
    commonTerms: [{ type: 3, transporting: ['1 - 2'], transportingWithDelivery: ['2 - 3'] }]
  },
  'typesofdelivery/all': [
    { type: 3, name: 'ПЭК:LTL Авто', fullName: 'ПЭК:LTL Автоперевозка (сборный груз)', contractIsRequired: false },
    { type: 1, name: 'ПЭК:Express Авиа', fullName: 'ПЭК:Express Авиаперевозка', contractIsRequired: false }
  ],
  'cargos/basicstatus': { cargos: [{ info: { cargoStatus: 'В пути', takeOnStockDateTime: '2026-11-01T13:51:40' },
    cargo: { code: '780339690775' } }] },
  'cargos/currentstatus': { cargos: [{ cargoCode: '780339690775', currentStatus: { ClientStatus: 'В пути',
    ClientStatusLevel2: 'Отправлен на терминал выдачи Санкт-Петербург', Tooltip: 'Ожидайте <уведомление>' } }] },
  'cargos/statusfullhistory': [{ cargoCode: '780339690775', statuses: [
    { id: 4000, date: '2026-11-01T17:42:37', name: 'Забор груза заказан', isCancel: false, isFinal: false }] }],
  'branches/nearestdepartments': { freeDepartments: [{ warehouseId: 'w', departmentType: 'Отделение компании',
    departmentTypeId: 0, branchName: 'Самара', divisionName: 'Самара Запад', address: 'г. Самара, ул. Верхне-Карьерная, д. 3В',
    coordinates: { latitude: 53.18, longitude: 50.17 }, phone: '8(846) 201-60-33', maxWeight: 0 }], paidDepartments: [] }
};

globalThis.fetch = (async (url: string, init: any) => {
  const key = String(url).replace('https://kabinet.pecom.ru/api/v1/', '').replace(/\/$/, '');
  calls.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
  if (key === 'auth/profiledata') {
    return new Response(JSON.stringify({ error: { title: 'Неверный логин или ключ API', message: 'Проверьте' } }), { status: 403 });
  }
  return new Response(JSON.stringify(responses[key] ?? {}), { status: 200 });
}) as typeof fetch;

const services = await import('../src/services');
const { pecApi, PecApiError } = await import('../src/pec-api');

test('расчёт: запрос по документации и форматирование', async () => {
  const result = await services.calculate({
    from: 'Москва', to: 'Санкт-Петербург',
    cargo: { weightKg: 50, places: 2, lengthM: 0.6, widthM: 0.4, heightM: 0.3 },
    declaredValue: 15000, delivery: true
  });
  const req = calls.find((c) => c.url.endsWith('/calculator/calculateprice/'))!.body;
  assert.deepEqual(req.types, [3, 1]);
  assert.equal(req.senderWarehouseId, 'dc6c746d-812d-11e4-bbfc-001999d8b3c5');
  assert.equal(req.isInsurance, true);
  assert.equal(req.isInsurancePrice, 15000);
  assert.equal(req.isDelivery, true);
  assert.deepEqual(req.delivery, { address: 'Санкт-Петербург' });
  assert.equal(req.cargos.length, 2);
  assert.equal(req.cargos[0].weight, 25);
  assert.match(req.plannedDateTime, /^\d{4}-\d{2}-\d{2}T10:00:00$/);
  const auth = calls[0].auth;
  assert.equal(auth, 'Basic ' + Buffer.from('demo:DEMOKEY').toString('base64'));
  const text = await services.formatCalc(result);
  assert.match(text, /5[\s ]?319 ₽/);
  assert.match(text, /срок 2 - 3 сут\./);
  assert.match(text, /Express Авиаперевозка<\/b>: Длина груза/);
  console.log(text);
});

test('отслеживание: статус, детали, история, экранирование HTML', async () => {
  const results = await services.track(['780339690775'], true);
  assert.equal(results[0].status, 'В пути');
  assert.equal(results[0].history?.length, 1);
  const text = services.formatTrack(results);
  assert.match(text, /&lt;уведомление&gt;/);
  assert.match(text, /Сдан в ПЭК: 01\.11\.2026 13:51/);
  console.log(text);
});

test('отделения', async () => {
  const offices = await services.findOffices('Самара', 'receive');
  const req = calls.find((c) => c.url.endsWith('/branches/nearestdepartments/'))!.body;
  assert.equal(req.departmentOperation, 3);
  assert.equal(req.type, 3);
  console.log(services.formatOffices('Самара', offices, 'receive'));
});

test('ошибка авторизации ПЭК превращается в понятное сообщение', async () => {
  await assert.rejects(() => pecApi.profileData(), (e: any) => e instanceof PecApiError && /Неверный логин или ключ API/.test(e.message));
});
