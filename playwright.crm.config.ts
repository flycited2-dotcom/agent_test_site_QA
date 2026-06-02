/**
 * Playwright config для CRM-агентов.
 * Запуск: npx playwright test --config=playwright.crm.config.ts
 */

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

const timeout = +(process.env.CRM_TIMEOUT_MS || '20000');
const mode    = process.env.CRM_QA_MODE || 'smoke';
const workers = mode === 'full' ? 1 : 1; // CRM всегда 1 воркер — нельзя параллелить состояние

export default defineConfig({
  testDir:       './tests/crm',
  timeout:       90_000,
  expect:        { timeout },
  fullyParallel: false,  // тесты CRM последовательны — они делят данные
  workers,
  retries:       1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/crm/html', open: 'never' }],
    ['json', { outputFile: 'reports/crm/json/results.json' }],
  ],

  use: {
    baseURL:              process.env.CRM_BASE_URL || '',
    headless:             (process.env.HEADLESS || 'true') !== 'false',
    actionTimeout:        timeout,
    navigationTimeout:    timeout,
    trace:                'retain-on-failure',
    screenshot:           'only-on-failure',
    video:                'retain-on-failure',
    ignoreHTTPSErrors:    true,
    viewport:             { width: 1440, height: 900 },
  },

  projects: [
    { name: 'crm-desktop', use: { ...devices['Desktop Chrome'] } },
  ],

  outputDir: 'test-results/crm',
});
