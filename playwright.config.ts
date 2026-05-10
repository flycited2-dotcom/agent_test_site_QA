import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { readRuntimeConfig } from './src/utils/runtime-config';

dotenv.config();

const baseURL = readRuntimeConfig(process.env.BASE_URL || 'https://climat-simf.ru/').site.url;
const timeout = Number(process.env.DEFAULT_TIMEOUT_MS || 15000);

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: timeout },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/json/results.json' }]
  ],
  use: {
    baseURL,
    headless: (process.env.HEADLESS || 'true') !== 'false',
    actionTimeout: timeout,
    navigationTimeout: timeout,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-android', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-iphone', use: { ...devices['iPhone 14'] } }
  ],
  outputDir: 'test-results'
});
