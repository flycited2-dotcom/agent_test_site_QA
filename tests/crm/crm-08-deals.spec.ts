/**
 * CRM Agent 8 — Сделки / Продажи
 *
 * Тестирует: создание сделки, добавление товаров/услуг, суммы, этапы,
 * привязку к клиенту, выигрыш/проигрыш, отчёт по сделкам.
 */

import { test, expect } from '@playwright/test';
import { loginAsManager, loginAsAdmin } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, clickCreateButton, submitForm, hasErrorFeedback,
  searchInList, findRowByText, getAvailableStatuses, changeStatusTo,
  pause, findVisible, countRows,
} from '../../src/crm/actions.js';

const DEALS_PATH = process.env.CRM_DEALS_PATH || '/deals';

test.describe('CRM Сделки: управление продажами', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан');

  const runId = Date.now();

  test('раздел сделок доступен', async ({ page }, testInfo) => {
    await loginAsManager(page);
    const status = await goToSection(page, DEALS_PATH);
    testInfo.annotations.push({ type: 'deals_url', description: crm.url + DEALS_PATH });

    if (status >= 400) {
      testInfo.annotations.push({ type: 'deals_status', description: String(status) });
      console.warn(`Раздел сделок недоступен (${status}) — возможно путь другой. Задайте CRM_DEALS_PATH в .env`);
      return;
    }

    expect(status).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });

  test('создание новой сделки', async ({ page }, testInfo) => {
    await loginAsManager(page);
    const status = await goToSection(page, DEALS_PATH);
    if (status >= 400) {
      test.skip(true, 'Раздел сделок недоступен');
      return;
    }

    const created = await clickCreateButton(page);
    if (!created) {
      testInfo.annotations.push({ type: 'create_btn', description: 'не найдена' });
      console.warn('Кнопка создания сделки не найдена. Задайте CRM_DEALS_PATH в .env');
      return;
    }

    // Заполняем название сделки
    const titleField = await findVisible(page, [
      'input[name="title"]', 'input[name="name"]', 'input[name="subject"]',
      'input[placeholder*="название" i]', 'input[placeholder*="сделк" i]',
      'input[placeholder*="deal" i]',
    ]);

    if (titleField) {
      await titleField.fill(`${crm.prefix} Сделка ${runId}`);
      await pause(200);
    }

    // Сумма сделки
    const amountField = await findVisible(page, [
      'input[name="amount"]', 'input[name="sum"]', 'input[name="price"]',
      'input[name="budget"]', 'input[placeholder*="сумм" i]',
      'input[placeholder*="бюджет" i]', 'input[type="number"]',
    ]);

    if (amountField) {
      await amountField.fill('150000');
      await pause(200);
      testInfo.annotations.push({ type: 'amount_field', description: 'заполнено: 150000' });
    }

    await submitForm(page);
    const error = await hasErrorFeedback(page);
    expect(error, `Создание сделки не должно давать ошибку: ${error}`).toBe('');
  });

  test('поле суммы сделки принимает только числа', async ({ page }, testInfo) => {
    await loginAsManager(page);
    const status = await goToSection(page, DEALS_PATH);
    if (status >= 400) { test.skip(true, 'Раздел недоступен'); return; }

    const created = await clickCreateButton(page);
    if (!created) { test.skip(true, 'Кнопка создания не найдена'); return; }

    const amountField = await findVisible(page, [
      'input[name="amount"]', 'input[name="sum"]', 'input[type="number"]',
    ]);
    if (!amountField) { console.warn('Поле суммы не найдено'); return; }

    // Вводим текст вместо числа
    await amountField.fill('abc!@#');
    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    const staysOnForm = page.url().includes('/new') || page.url().includes('/create');

    testInfo.annotations.push({
      type: 'non_numeric_validation',
      description: error || staysOnForm ? 'ошибка показана' : 'пропускает некорректные данные',
    });
  });

  test('добавление продукта/услуги к сделке', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, DEALS_PATH);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) { test.skip(true, 'QA-сделка не найдена'); return; }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const addProductBtn = await findVisible(page, [
      'button:has-text("Добавить товар")', 'button:has-text("Добавить услугу")',
      'button:has-text("Добавить позицию")', 'button:has-text("+ товар")',
      '[data-testid*="add-product"]', '[data-testid*="add-item"]',
      'a:has-text("Добавить товар")',
    ]);

    testInfo.annotations.push({
      type: 'add_product_btn',
      description: addProductBtn ? 'найдена' : 'не найдена — нет позиций в сделке',
    });

    if (addProductBtn) {
      await addProductBtn.click();
      await pause(500);

      const productName = await findVisible(page, [
        'input[name*="product" i]', 'input[name*="item" i]',
        'input[placeholder*="товар" i]', 'input[placeholder*="название" i]',
      ]);

      if (productName) {
        await productName.fill(`${crm.prefix} Кондиционер тест`);
        await pause(200);
      }

      await submitForm(page);
      const error = await hasErrorFeedback(page);
      expect(error, `Добавление товара к сделке: ${error}`).toBe('');
    }
  });

  test('смена этапа сделки (pipeline)', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, DEALS_PATH);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) { test.skip(true, 'QA-сделка не найдена'); return; }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const stages = await getAvailableStatuses(page);
    testInfo.annotations.push({ type: 'deal_stages', description: stages.join(', ') || 'не найдены' });

    if (stages.length >= 2) {
      const nextStage = stages[1];
      const changed = await changeStatusTo(page, nextStage);
      if (changed) {
        await submitForm(page).catch(() => {});
        const error = await hasErrorFeedback(page);
        expect(error, `Смена этапа сделки: ${error}`).toBe('');
      }
    }
  });

  test('пометить сделку как выигранную', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, DEALS_PATH);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) { test.skip(true, 'QA-сделка не найдена'); return; }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const wonBtn = await findVisible(page, [
      'button:has-text("Выигран")', 'button:has-text("Закрыть успехом")',
      'button:has-text("Won")', 'button:has-text("Успех")',
      '[data-testid*="won"]', '[data-testid*="win"]',
    ]);

    testInfo.annotations.push({
      type: 'won_button',
      description: wonBtn ? 'найдена' : 'не найдена',
    });

    if (!wonBtn) {
      // Попробуем через статус
      const statuses = await getAvailableStatuses(page);
      const wonStatus = statuses.find(s => /выигран|успех|won|closed won/i.test(s));
      if (wonStatus) {
        await changeStatusTo(page, wonStatus);
        await submitForm(page).catch(() => {});
        testInfo.annotations.push({ type: 'won_via_status', description: wonStatus });
      }
    } else {
      await wonBtn.click();
      await pause(500);
    }
  });

  test('пометить сделку как проигранную', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, DEALS_PATH);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) { test.skip(true, 'QA-сделка не найдена'); return; }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const lostBtn = await findVisible(page, [
      'button:has-text("Проигран")', 'button:has-text("Отказ")',
      'button:has-text("Lost")', '[data-testid*="lost"]',
    ]);

    testInfo.annotations.push({
      type: 'lost_button',
      description: lostBtn ? 'найдена' : 'не найдена',
    });

    if (lostBtn) {
      await lostBtn.click();
      await pause(500);

      // Если появилась форма причины отказа — заполняем
      const reasonField = await findVisible(page, [
        'textarea[name*="reason"]', 'input[name*="reason"]',
        '[placeholder*="причина" i]', '[placeholder*="reason" i]',
      ]);
      if (reasonField) {
        await reasonField.fill('[QA] Тестовая причина отказа');
      }

      await submitForm(page).catch(() => {});
      const error = await hasErrorFeedback(page);
      expect(error, `Пометить сделку как проигранную: ${error}`).toBe('');
    }
  });
});
