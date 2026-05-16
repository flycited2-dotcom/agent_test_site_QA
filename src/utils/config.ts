import dotenv from 'dotenv';
import { readRuntimeConfig } from './runtime-config';
dotenv.config();

const runtime = readRuntimeConfig(process.env.BASE_URL || 'https://climat-simf.ru/');
const qaMode = process.env.QA_MODE || 'smoke';
const enterpriseMode = qaMode === 'enterprise' || runtime.site.depth === 'enterprise';

function numberSetting(name: string, fallback: number): number {
  return Number(process.env[name] || fallback);
}

export const config = {
  baseUrl: runtime.site.url,
  siteProfile: runtime.site.profile,
  testDepth: runtime.site.depth,
  safeMode: runtime.site.safeMode,
  maxProductsFull: numberSetting('MAX_PRODUCTS_FULL', enterpriseMode ? 1200 : 300),
  maxProductsSmoke: numberSetting('MAX_PRODUCTS_SMOKE', enterpriseMode ? 30 : 8),
  maxCategoryPages: numberSetting('MAX_CATEGORY_PAGES', enterpriseMode ? 350 : 80),
  actionDelayMs: numberSetting('ACTION_DELAY_MS', enterpriseMode ? 250 : 150),
  qaMode,
  auditScale: enterpriseMode ? 'enterprise-30x' : 'standard',
  testUser: {
    name: process.env.QA_TEST_NAME || 'QA TEST',
    phone: process.env.QA_TEST_PHONE || '+79990000000',
    email: process.env.QA_TEST_EMAIL || 'qa-test@example.com',
    comment: process.env.QA_TEST_COMMENT || 'Автоматический тест QA Agent. Не обрабатывать как реальную заявку.'
  }
};

export function absoluteUrl(pathOrUrl: string): string {
  try { return new URL(pathOrUrl, config.baseUrl).toString(); } catch { return config.baseUrl; }
}
