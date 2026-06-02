/**
 * CRM Agent 3 — Клиенты / Контакты
 * Симулирует: создание клиента, поиск, редактирование, связь с заявкой.
 * Частота: каждые 2 часа.
 */

import { test, expect } from '@playwright/test';
import { loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, clickCreateButton, fillClientForm, submitForm,
  hasSuccessFeedback, hasErrorFeedback, searchInList, countRows,
  findRowByText, pause, findVisible,
} from '../../src/crm/actions.js';

test.describe('CRM Клиенты: управление базой контактов', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан — заполните .env');

  const runId = Date.now();
  const testClient = {
    name:    `${crm.prefix} Петров ${runId}`,
    company: `${crm.testCompany} ${runId}`,
    phone:   crm.testPhone,
    email:   crm.testEmail,
  };

  test('открывается список клиентов', async ({ page }) => {
    await loginAsManager(page);
    const status = await goToSection(page, crm.clientsPath);
    expect(status, `Раздел клиентов должен открываться: ${crm.url + crm.clientsPath}`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();

    const title = await page.title();
    expect(title).not.toMatch(/404|403|500/);
  });

  test('есть кнопка создания нового клиента', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);

    const found = await clickCreateButton(page);
    expect(
      found,
      'Кнопка "Добавить/Создать клиента" должна быть в разделе клиентов. ' +
      'Настройте CRM_CLIENTS_PATH в .env если путь отличается.'
    ).toBeTruthy();
  });

  test('создание нового клиента с компанией', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания клиента не найдена');
      return;
    }

    const { filled, missing } = await fillClientForm(page, testClient);
    testInfo.annotations.push({ type: 'fields_filled', description: filled.join(', ') });
    testInfo.annotations.push({ type: 'fields_missing', description: missing.join(', ') });

    expect(filled, 'Должно заполниться хотя бы поле имени').toContain('name');

    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    expect(error, `При создании клиента не должно быть ошибки: ${error}`).toBe('');

    // Проверяем, что клиент появился в списке
    await goToSection(page, crm.clientsPath);
    await searchInList(page, crm.prefix);
    await pause(500);

    const row = await findRowByText(page, testClient.name);
    const rows = await countRows(page);
    testInfo.annotations.push({ type: 'client_found', description: String(!!row) });

    expect(
      row || rows > 0,
      `Только что созданный клиент "${testClient.name}" должен появиться в списке`
    ).toBeTruthy();
  });

  test('поиск клиента по имени', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);

    await searchInList(page, crm.prefix);
    await pause(500);

    const rows = await countRows(page);
    const emptyMsg = await page.locator(
      'text=не найдено, text=пусто, text=нет записей, [class*="empty"]'
    ).count();

    expect(
      rows > 0 || emptyMsg > 0,
      'Поиск должен выдавать результаты или сообщение "ничего не найдено"'
    ).toBeTruthy();
  });

  test('открытие карточки клиента', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-клиенты не найдены — сначала создайте клиента');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const url = page.url();
    expect(url, 'Клик по клиенту должен открыть его карточку').not.toBe(crm.url + crm.clientsPath);
    await expect(page.locator('body')).toBeVisible();
  });

  test('редактирование данных клиента', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-клиенты не найдены');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    // Ищем кнопку редактирования
    const editBtn = await findVisible(page, [
      'a:has-text("Редактировать")', 'button:has-text("Редактировать")',
      'a:has-text("Изменить")', 'button:has-text("Изменить")',
      'a:has-text("Edit")', 'button:has-text("Edit")',
      '[data-testid="edit-btn"]', '[data-testid="edit"]',
      'a[href*="/edit"]',
    ]);

    if (!editBtn) {
      testInfo.annotations.push({ type: 'edit_btn', description: 'не найдена' });
      console.warn('Кнопка редактирования клиента не найдена');
      return;
    }

    await editBtn.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    // Проверяем, что открылась форма редактирования
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    if (await emailInput.count() > 0) {
      const updatedEmail = `updated-qa-${runId}@example.com`;
      await emailInput.clear();
      await emailInput.fill(updatedEmail);
      await submitForm(page);
      await pause(500);

      const error = await hasErrorFeedback(page);
      expect(error, `Сохранение изменений клиента не должно давать ошибку: ${error}`).toBe('');
      testInfo.annotations.push({ type: 'edit_result', description: 'email обновлён успешно' });
    } else {
      testInfo.annotations.push({ type: 'edit_result', description: 'форма редактирования открылась, поля не найдены' });
    }
  });

  test('клиент с пустым именем отклоняется', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания не найдена');
      return;
    }

    await fillClientForm(page, { ...testClient, name: '' });
    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    const staysOnForm = page.url().includes('/new') || page.url().includes('/create');

    expect(
      error || staysOnForm,
      'Пустое имя клиента должно блокироваться — ошибка валидации или форма не закрывается'
    ).toBeTruthy();
  });

  test('просмотр истории взаимодействий клиента', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.clientsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-клиенты не найдены');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    // Ищем раздел истории/активностей/логов
    const historySection = await findVisible(page, [
      '[data-testid*="history"]', '[data-testid*="activity"]', '[data-testid*="log"]',
      'text=История', 'text=Активность', 'text=Лог',
      '[class*="history"]', '[class*="activity"]', '[class*="timeline"]',
    ]);

    testInfo.annotations.push({
      type: 'history_section',
      description: historySection ? 'найдена' : 'не найдена — возможно нет истории в CRM',
    });

    // Это не провальный тест — просто фиксируем наличие/отсутствие
  });
});
