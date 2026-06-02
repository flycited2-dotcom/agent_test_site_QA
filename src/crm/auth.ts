import { type Page } from '@playwright/test';
import { crm } from './config.js';

async function pause(ms = crm.delay): Promise<void> {
  await new Promise(r => setTimeout(r, ms));
}

async function findVisible(page: Page, selectors: string[]): Promise<import('@playwright/test').Locator | null> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) return el;
  }
  return null;
}

export async function loginAsCrmUser(page: Page, email: string, password: string): Promise<void> {
  if (!crm.url) throw new Error('CRM_BASE_URL не задан в .env — заполните перед запуском CRM-тестов');
  if (!email) throw new Error('Email/логин CRM не задан в .env (CRM_ADMIN_EMAIL или CRM_MANAGER_EMAIL)');
  if (!password) throw new Error('Пароль CRM не задан в .env (CRM_ADMIN_PASSWORD или CRM_MANAGER_PASSWORD)');

  const loginUrl = crm.url + crm.loginPath;
  const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: crm.timeout });

  if (response && response.status() >= 400) {
    throw new Error(`Страница входа недоступна: ${loginUrl} → HTTP ${response.status()}`);
  }

  const emailField = await findVisible(page, [
    'input[name="email"]', 'input[type="email"]',
    'input[name="login"]', 'input[name="username"]',
    'input[placeholder*="email" i]', 'input[placeholder*="логин" i]',
    'input[placeholder*="почта" i]', 'input[placeholder*="mail" i]',
  ]);
  if (!emailField) throw new Error(`Поле логина/email не найдено на ${loginUrl}`);

  const passField = await findVisible(page, [
    'input[type="password"]', 'input[name="password"]',
    'input[name="pass"]', 'input[placeholder*="пароль" i]',
  ]);
  if (!passField) throw new Error(`Поле пароля не найдено на ${loginUrl}`);

  await emailField.fill(email);
  await pause(300);
  await passField.fill(password);
  await pause(300);

  const submitBtn = await findVisible(page, [
    'button[type="submit"]', 'input[type="submit"]',
    'button:has-text("Войти")', 'button:has-text("Вход")',
    'button:has-text("Авторизоваться")', 'button:has-text("Login")',
    'button:has-text("Sign in")', 'button:has-text("Продолжить")',
  ]);
  if (!submitBtn) throw new Error(`Кнопка входа не найдена на ${loginUrl}`);

  await submitBtn.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await pause(800);

  const currentUrl = page.url();
  if (currentUrl.includes(crm.loginPath) || currentUrl.includes('error')) {
    const errText = await page.locator('.error, .alert-danger, [class*="error"], [class*="invalid"]').first()
      .textContent().catch(() => '');
    throw new Error(`Авторизация не удалась (остались на ${currentUrl}). Ошибка на странице: "${errText || 'не определена'}"`);
  }
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAsCrmUser(page, crm.adminEmail, crm.adminPass);
}

export async function loginAsManager(page: Page): Promise<void> {
  await loginAsCrmUser(page, crm.managerEmail, crm.managerPass);
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (!url || url === 'about:blank') return false;
  return !url.includes(crm.loginPath);
}
