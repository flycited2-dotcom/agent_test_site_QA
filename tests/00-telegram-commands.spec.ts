import { test, expect } from '@playwright/test';
import { parseCommand } from '../src/telegram/commands';

test('parses Russian Telegram commands', () => {
  expect(parseCommand('/статус')).toEqual({ type: 'status' });
  expect(parseCommand('/отчёт')).toEqual({ type: 'report' });
  expect(parseCommand('/отчет')).toEqual({ type: 'report' });
  expect(parseCommand('/запуск critical')).toEqual({ type: 'run', depth: 'critical' });
  expect(parseCommand('/сайт https://example.com')).toEqual({ type: 'site', url: 'https://example.com' });
  expect(parseCommand('/профиль магазин')).toEqual({ type: 'profile', profile: 'shop' });
});
