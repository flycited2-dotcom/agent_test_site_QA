import { test, expect } from '@playwright/test';
import { parseCommand, runtimeAfterManualRun } from '../src/telegram/commands';

test('parses Russian Telegram commands', () => {
  expect(parseCommand('/статус')).toEqual({ type: 'status' });
  expect(parseCommand('/отчёт')).toEqual({ type: 'report' });
  expect(parseCommand('/отчет')).toEqual({ type: 'report' });
  expect(parseCommand('/запуск critical')).toEqual({ type: 'run', depth: 'critical' });
  expect(parseCommand('/запуск enterprise')).toEqual({ type: 'run', depth: 'enterprise' });
  expect(parseCommand('/режим full')).toEqual({ type: 'depth', depth: 'full' });
  expect(parseCommand('/режим enterprise')).toEqual({ type: 'depth', depth: 'enterprise' });
  expect(parseCommand('/меню')).toEqual({ type: 'menu' });
  expect(parseCommand('/star')).toEqual({ type: 'menu' });
  expect(parseCommand('/сайт https://example.com')).toEqual({ type: 'site', url: 'https://example.com' });
  expect(parseCommand('/профиль магазин')).toEqual({ type: 'profile', profile: 'shop' });
});

test('manual run also switches the active schedule depth', () => {
  const runtime = {
    site: {
      url: 'https://example.com/',
      profile: 'shop' as const,
      depth: 'critical' as const,
      safeMode: true
    },
    notifications: {
      telegram: true,
      googleDrive: true,
      email: false
    }
  };

  expect(runtimeAfterManualRun(runtime, 'enterprise').site.depth).toBe('enterprise');
});
