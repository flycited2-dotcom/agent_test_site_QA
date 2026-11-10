import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalcCargos,
  extractCargoCodes,
  formatDateTime,
  nextPlannedDateTime,
  parseDimensions,
  parseNumber,
  parseVolume
} from '../src/services';
import { splitMessage } from '../src/telegram';

test('parseDimensions: сантиметры по умолчанию', () => {
  assert.deepEqual(parseDimensions('60x40x30'), { lengthM: 0.6, widthM: 0.4, heightM: 0.3 });
  assert.deepEqual(parseDimensions('60 х 40 х 30 см'), { lengthM: 0.6, widthM: 0.4, heightM: 0.3 });
});

test('parseDimensions: метры и миллиметры', () => {
  assert.deepEqual(parseDimensions('1.2*0.8*1,5'), { lengthM: 1.2, widthM: 0.8, heightM: 1.5 });
  assert.deepEqual(parseDimensions('600x400x300 мм'), { lengthM: 0.6, widthM: 0.4, heightM: 0.3 });
  assert.equal(parseDimensions('просто текст'), null);
});

test('parseVolume', () => {
  assert.deepEqual(parseVolume('0.5 м3 макс 1.2'), { totalVolumeM3: 0.5, maxSizeM: 1.2 });
  assert.deepEqual(parseVolume('объём 2,4'), { totalVolumeM3: 2.4, maxSizeM: undefined });
});

test('parseNumber', () => {
  assert.equal(parseNumber('3,5 кг'), 3.5);
  assert.equal(parseNumber('15 000 ₽'), 15000);
  assert.equal(parseNumber('нет'), null);
});

test('buildCalcCargos делит вес по местам и округляет вверх', () => {
  const cargos = buildCalcCargos({ weightKg: 10, places: 3, lengthM: 0.6, widthM: 0.4, heightM: 0.3 });
  assert.equal(cargos.length, 3);
  assert.equal(cargos[0].weight, 3.34);
  const byVolume = buildCalcCargos({ weightKg: 100, places: 2, totalVolumeM3: 1, maxSizeM: 1.2 });
  assert.deepEqual(byVolume[0], { volume: 0.5, maxSize: 1.2, weight: 50 });
  assert.throws(() => buildCalcCargos({ weightKg: 1, places: 1 }));
});

test('extractCargoCodes', () => {
  assert.deepEqual(extractCargoCodes('где мой груз 780339690775 и 999932277461?'), ['780339690775', '999932277461']);
  assert.deepEqual(extractCargoCodes('вес 25 кг'), []);
});

test('nextPlannedDateTime: ближайший будний день 10:00', () => {
  // пятница 2026-11-13 12:00 UTC → понедельник 16.11
  assert.equal(nextPlannedDateTime(new Date('2026-11-13T12:00:00Z')), '2026-11-16T10:00:00');
  // вторник → среда
  assert.equal(nextPlannedDateTime(new Date('2026-11-10T08:00:00Z')), '2026-11-11T10:00:00');
});

test('formatDateTime', () => {
  assert.equal(formatDateTime('2011-03-10T09:24:24'), '10.03.2011 09:24');
  assert.equal(formatDateTime('0001-01-01T12:00:00'), '');
  assert.equal(formatDateTime(null), '');
});

test('splitMessage не превышает лимит', () => {
  const text = Array.from({ length: 500 }, (_, i) => `строка ${i} `.repeat(5)).join('\n');
  const parts = splitMessage(text, 4000);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 4000));
});
