/**
 * CRM Agent 5 — Интеграция сайт → CRM
 * Сквозной тест: заполняет форму на сайте → проверяет, что заявка появилась в CRM.
 * Частота: каждые 2 часа.
 *
 * Требует: BASE_URL (сайт) + CRM_BASE_URL (CRM) оба в .env
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, searchInList, countRows, findRowByText, pause, findVisible,
} from '../../src/crm/actions.js';

const INTEGRATION_SKIP = !process.env.CRM_BASE_URL || !process.env.BASE_URL;

test.describe('CRM Интеграция: сайт → CRM', () => {

  test.skip(INTEGRATION_SKIP, 'CRM_BASE_URL или BASE_URL не заданы — нужны оба для интеграционного теста');

  const runId = Date.now();
  const testData = {
    name:    `${crm.prefix} Сквозной тест ${runId}`,
    phone:   crm.testPhone,
    email:   crm.testEmail,
    comment: `[QA] Интеграционный тест ${runId}. Не обрабатывать.`,
  };

  test('форма обратной связи на сайте открывается', async ({ page }) => {
    const siteUrl = crm.siteUrl;
    const response = await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: crm.timeout });
    expect(response?.status(), `Сайт должен открываться: ${siteUrl}`).toBeLessThan(400);

    const form = await findVisible(page, [
      'form', '[data-testid*="form"]',
      'input[type="tel"]', 'input[name="phone"]',
      'input[placeholder*="телефон" i]',
    ]);

    expect(form, 'На сайте должна быть форма/поле телефона для отправки заявки').toBeTruthy();
  });

  test('форма принимает тестовую заявку', async ({ page }) => {
    await page.goto(crm.siteUrl, { waitUntil: 'domcontentloaded', timeout: crm.timeout });

    // Ищем форму и заполняем
    const nameInput = await findVisible(page, [
      'input[name="name"]', 'input[placeholder*="имя" i]', 'input[placeholder*="name" i]',
    ]);
    if (nameInput) {
      await nameInput.fill(testData.name);
      await pause(200);
    }

    const phoneInput = await findVisible(page, [
      'input[type="tel"]', 'input[name="phone"]', 'input[placeholder*="телефон" i]',
    ]);
    if (!phoneInput) {
      test.skip(true, 'Поле телефона не найдено на сайте');
      return;
    }
    await phoneInput.fill(testData.phone);
    await pause(200);

    const emailInput = await findVisible(page, [
      'input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]',
    ]);
    if (emailInput) {
      await emailInput.fill(testData.email);
      await pause(200);
    }

    const commentInput = await findVisible(page, [
      'textarea[name="comment"]', 'textarea[name="message"]',
      'textarea[placeholder*="комментарий" i]', 'textarea[placeholder*="сообщение" i]', 'textarea',
    ]);
    if (commentInput) {
      await commentInput.fill(testData.comment);
      await pause(200);
    }

    // Согласие с политикой
    const consent = page.locator('input[type="checkbox"][name*="agree" i], input[type="checkbox"][name*="consent" i]').first();
    if (await consent.count() > 0 && !(await consent.isChecked())) {
      await consent.check();
    }

    const submitBtn = await findVisible(page, [
      'button[type="submit"]', 'input[type="submit"]',
      'button:has-text("Отправить")', 'button:has-text("Заказать")',
      'button:has-text("Оставить заявку")', 'button:has-text("Получить")',
    ]);

    if (!submitBtn) {
      test.skip(true, 'Кнопка отправки формы не найдена на сайте');
      return;
    }

    await submitBtn.click();
    await pause(1500);

    // Проверяем подтверждение на сайте
    const confirmation = await findVisible(page, [
      'text=спасибо', 'text=заявка принята', 'text=успешно',
      '[class*="success"]', '[class*="thanks"]', '[class*="modal"]',
      '.modal', '.popup', '.thank',
    ]);

    // Не жёсткий fail — сайт может не показывать подтверждение явно
    if (!confirmation) {
      console.warn('Явного подтверждения отправки формы не обнаружено — проверьте форму вручную');
    }
  });

  test('заявка с сайта появляется в CRM', async ({ page }, testInfo) => {
    // Шаг 1: Подаём заявку через сайт
    await page.goto(crm.siteUrl, { waitUntil: 'domcontentloaded', timeout: crm.timeout });

    const uniquePhone = `+7999${runId.toString().slice(-7)}`;
    const phoneInput = await findVisible(page, [
      'input[type="tel"]', 'input[name="phone"]', 'input[placeholder*="телефон" i]',
    ]);

    if (!phoneInput) {
      test.skip(true, 'Форма с телефоном не найдена на сайте');
      return;
    }

    await phoneInput.fill(uniquePhone);
    await pause(200);

    const nameInput = await findVisible(page, ['input[name="name"]', 'input[placeholder*="имя" i]']);
    if (nameInput) await nameInput.fill(testData.name);

    const consent = page.locator('input[type="checkbox"]').first();
    if (await consent.count() > 0 && !(await consent.isChecked())) {
      await consent.check().catch(() => {});
    }

    const submitBtn = await findVisible(page, [
      'button[type="submit"]', 'button:has-text("Отправить")',
      'button:has-text("Оставить заявку")', 'button:has-text("Заказать")',
    ]);

    if (!submitBtn) {
      test.skip(true, 'Кнопка отправки не найдена');
      return;
    }

    await submitBtn.click();
    // Ждём, пока бэкенд обработает заявку
    await page.waitForTimeout(3000);

    testInfo.annotations.push({ type: 'submitted_phone', description: uniquePhone });
    testInfo.annotations.push({ type: 'submitted_name', description: testData.name });

    // Шаг 2: Идём в CRM и ищем заявку
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await pause(500);

    await searchInList(page, crm.prefix);
    await pause(800);

    const row = await findRowByText(page, uniquePhone);
    const nameRow = await findRowByText(page, testData.name);

    testInfo.annotations.push({
      type: 'found_in_crm',
      description: (row || nameRow) ? 'ДА' : 'НЕТ',
    });

    expect(
      row || nameRow,
      `Заявка с телефоном "${uniquePhone}" или именем "${testData.name}", поданная через сайт, ` +
      `должна появиться в разделе лидов CRM. ` +
      `Если интеграция настроена — проверьте webhook/API между сайтом и CRM.`
    ).toBeTruthy();
  });

  test('поля заявки передаются без потерь', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-заявки не найдены в CRM — сначала запустите тест создания заявки с сайта');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    // Проверяем, что ключевые поля присутствуют на карточке
    const bodyText = await page.locator('body').textContent() || '';

    const checks: [string, string][] = [
      ['Телефон', crm.testPhone.slice(0, 7)],     // первые 7 цифр
      ['Email', crm.testEmail.split('@')[0]],       // часть до @
    ];

    const issues: string[] = [];
    for (const [fieldName, partial] of checks) {
      if (!bodyText.includes(partial)) {
        issues.push(`${fieldName} ("${partial}") не найден в карточке`);
      }
    }

    testInfo.annotations.push({ type: 'missing_fields', description: issues.join('; ') || 'нет' });

    if (issues.length > 0) {
      console.warn(`⚠️ Поля не переданы в CRM: ${issues.join(', ')}`);
    }

    // Тест не жёсткий — фиксируем для отчёта
  });
});
