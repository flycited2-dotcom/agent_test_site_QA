/**
 * CRM Agent 1 — Smoke
 * Проверяет: авторизация работает, основные разделы доступны, нет критических JS-ошибок.
 * Частота: каждые 30 минут.
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import { goToSection } from '../../src/crm/actions.js';

test.describe('CRM Smoke: базовая доступность', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан — заполните .env и повторите');

  test('страница входа открывается', async ({ page }) => {
    const loginUrl = crm.url + crm.loginPath;
    const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: crm.timeout });
    expect(response?.status(), `Страница входа должна открываться без ошибки: ${loginUrl}`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();

    const title = await page.title();
    expect(title, 'Страница входа не должна быть страницей ошибки').not.toMatch(/404|500|error/i);
  });

  test('авторизация администратора', async ({ page }) => {
    await loginAsAdmin(page);

    const url = page.url();
    expect(url, 'После входа должен открыться дашборд, а не страница входа').not.toContain(crm.loginPath);
    await expect(page.locator('body')).toBeVisible();
  });

  test('авторизация менеджера', async ({ page }) => {
    test.skip(
      crm.managerEmail === crm.adminEmail,
      'CRM_MANAGER_EMAIL не задан — используется аккаунт администратора, тест пропускается'
    );
    await loginAsManager(page);

    const url = page.url();
    expect(url, 'Менеджер должен войти успешно').not.toContain(crm.loginPath);
  });

  test('раздел заявок/лидов доступен', async ({ page }) => {
    await loginAsAdmin(page);
    const status = await goToSection(page, crm.leadsPath);
    expect(status, `Раздел лидов должен открываться: ${crm.url + crm.leadsPath}`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();

    const title = await page.title();
    expect(title).not.toMatch(/404|403|500/);
  });

  test('раздел клиентов доступен', async ({ page }) => {
    await loginAsAdmin(page);
    const status = await goToSection(page, crm.clientsPath);
    expect(status, `Раздел клиентов должен открываться: ${crm.url + crm.clientsPath}`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });

  test('раздел задач доступен', async ({ page }) => {
    await loginAsAdmin(page);
    const status = await goToSection(page, crm.tasksPath);
    expect(status, `Раздел задач должен открываться: ${crm.url + crm.tasksPath}`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });

  test('дашборд не выдаёт критических JS-ошибок', async ({ page }) => {
    const criticalErrors: string[] = [];
    page.on('pageerror', err => {
      if (/TypeError|ReferenceError|SyntaxError/i.test(err.message)) {
        criticalErrors.push(err.message);
      }
    });

    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    expect(
      criticalErrors,
      `Критические JS-ошибки на дашборде:\n${criticalErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('сессия не слетает при навигации между разделами', async ({ page }) => {
    await loginAsAdmin(page);

    for (const [path, name] of [
      [crm.leadsPath, 'Лиды'],
      [crm.clientsPath, 'Клиенты'],
      [crm.tasksPath, 'Задачи'],
      [crm.leadsPath, 'Лиды (повтор)'],
    ] as [string, string][]) {
      const status = await goToSection(page, path);
      expect(status, `Переход в раздел "${name}" должен работать`).toBeLessThan(400);

      const url = page.url();
      expect(url, `После перехода в "${name}" не должно быть редиректа на страницу входа`).not.toContain(crm.loginPath);
    }
  });
});
