import dotenv from 'dotenv';
dotenv.config();

export const config = {
  baseUrl: process.env.BASE_URL || 'https://climat-simf.ru/',
  maxProductsFull: Number(process.env.MAX_PRODUCTS_FULL || 300),
  maxProductsSmoke: Number(process.env.MAX_PRODUCTS_SMOKE || 8),
  maxCategoryPages: Number(process.env.MAX_CATEGORY_PAGES || 80),
  actionDelayMs: Number(process.env.ACTION_DELAY_MS || 150),
  qaMode: process.env.QA_MODE || 'smoke',
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
