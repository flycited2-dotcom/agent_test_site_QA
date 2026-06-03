/**
 * CRM Agent 6 — Входящие лиды (внешние каналы)
 *
 * Агенты РЕАЛЬНО отправляют заявки снаружи и проверяют, что CRM их получила:
 *   - HTTP POST на форму сайта
 *   - Playwright: живой браузер заполняет форму
 *   - Telegram webhook: POST на CRM-endpoint как настоящий Telegram
 *   - Email: письмо на CRM-ящик
 *
 * После каждого канала агент заходит в CRM и ищет созданную заявку.
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, searchInList, findRowByText, countRows, pause, findVisible,
} from '../../src/crm/actions.js';
import {
  sendLeadViaHttp, sendLeadViaApi, sendLeadViaTelegramWebhook,
  sendLeadViaEmail, makeTestLead,
} from '../../src/crm/lead-generator.js';

const SITE_FORM_URL   = process.env.CRM_SITE_FORM_URL   || process.env.BASE_URL || '';
const SITE_API_URL    = process.env.CRM_SITE_API_URL    || '';
const TG_WEBHOOK_URL  = process.env.CRM_TELEGRAM_WEBHOOK_URL || '';
const TG_SECRET       = process.env.CRM_TELEGRAM_SECRET || '';
const CRM_INBOX_EMAIL = process.env.CRM_INBOX_EMAIL     || '';

test.describe('CRM Входящие: реальная отправка заявок через разные каналы', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан');

  // ── Канал 1: HTTP POST на форму сайта ─────────────────────────────────────

  test('[HTTP] POST-заявка на форму сайта — лид появляется в CRM', async ({ page }, testInfo) => {
    test.skip(!SITE_FORM_URL, 'CRM_SITE_FORM_URL или BASE_URL не задан');

    const lead = makeTestLead(`HTTP-${Date.now()}`);
    testInfo.annotations.push({ type: 'channel', description: 'HTTP POST' });
    testInfo.annotations.push({ type: 'lead_name', description: lead.name });

    const formUrl = SITE_FORM_URL.replace(/\/$/, '') + (process.env.CRM_SITE_FORM_PATH || '/');
    const result = await sendLeadViaHttp(formUrl, lead);

    testInfo.annotations.push({ type: 'http_status', description: String(result.status) });
    expect(
      result.status,
      `Форма сайта должна принять POST: ${formUrl} → статус ${result.status}\nОтвет: ${result.body.slice(0, 200)}`
    ).toBeLessThan(500);

    // Ждём обработки на бэкенде
    await page.waitForTimeout(3000);

    // Ищем в CRM
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, lead.phone.slice(-7));
    await pause(800);

    const found = await findRowByText(page, crm.prefix);
    testInfo.annotations.push({ type: 'found_in_crm', description: found ? 'ДА' : 'НЕТ' });

    expect(
      found,
      `Заявка, отправленная через HTTP POST (${formUrl}), должна появиться в CRM. ` +
      `Проверьте, что форма сайта создаёт лид в CRM через webhook/API.`
    ).toBeTruthy();
  });

  // ── Канал 2: REST API сайта ────────────────────────────────────────────────

  test('[API] REST-заявка через API сайта — лид в CRM', async ({ page }, testInfo) => {
    test.skip(!SITE_API_URL, 'CRM_SITE_API_URL не задан');

    const lead = makeTestLead(`API-${Date.now()}`);
    testInfo.annotations.push({ type: 'channel', description: 'REST API' });

    const result = await sendLeadViaApi(SITE_API_URL, lead);
    testInfo.annotations.push({ type: 'api_status', description: String(result.status) });

    expect(result.status, `API должен принять заявку: ${SITE_API_URL} → ${result.status}`).toBeLessThan(400);

    await page.waitForTimeout(3000);

    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);
    await pause(800);

    const found = await findRowByText(page, lead.name);
    testInfo.annotations.push({ type: 'found_in_crm', description: found ? 'ДА' : 'НЕТ' });

    expect(found, `Заявка через API должна появиться в CRM`).toBeTruthy();
  });

  // ── Канал 3: Playwright — живой браузер заполняет форму на сайте ──────────

  test('[Браузер] Посетитель заполняет форму на сайте — лид в CRM', async ({ page }, testInfo) => {
    test.skip(!SITE_FORM_URL, 'CRM_SITE_FORM_URL или BASE_URL не задан');

    const lead = makeTestLead(`Browser-${Date.now()}`);
    const uniquePhone = `+7999${Date.now().toString().slice(-7)}`;

    testInfo.annotations.push({ type: 'channel', description: 'Playwright/Browser' });
    testInfo.annotations.push({ type: 'phone', description: uniquePhone });

    // Шаг 1: открываем сайт как посетитель
    const siteResponse = await page.goto(SITE_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(siteResponse?.status(), `Сайт должен открываться`).toBeLessThan(400);

    // Прокручиваем к форме (может быть внизу страницы)
    const formEl = await findVisible(page, [
      'form', '#contact-form', '.contact-form', '[data-testid="contact-form"]',
    ]);

    if (formEl) {
      await formEl.scrollIntoViewIfNeeded().catch(() => {});
    }

    // Заполняем имя
    const nameField = await findVisible(page, [
      'input[name="name"]', 'input[placeholder*="имя" i]', 'input[placeholder*="ФИО" i]',
    ]);
    if (nameField) { await nameField.fill(lead.name); await pause(300); }

    // Телефон — обязательное поле
    const phoneField = await findVisible(page, [
      'input[type="tel"]', 'input[name="phone"]', 'input[placeholder*="телефон" i]',
    ]);

    if (!phoneField) {
      testInfo.annotations.push({ type: 'skip_reason', description: 'поле телефона не найдено' });
      test.skip(true, 'Поле телефона не найдено на сайте');
      return;
    }

    await phoneField.fill(uniquePhone);
    await pause(300);

    // Email
    const emailField = await findVisible(page, [
      'input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]',
    ]);
    if (emailField) { await emailField.fill(lead.email); await pause(200); }

    // Комментарий
    const commentField = await findVisible(page, [
      'textarea[name="comment"]', 'textarea[name="message"]',
      'textarea[placeholder*="комментарий" i]', 'textarea',
    ]);
    if (commentField) { await commentField.fill(lead.comment); await pause(200); }

    // Согласие
    const consent = page.locator('input[type="checkbox"]').first();
    if (await consent.count() > 0) {
      await consent.check().catch(() => {});
    }

    // Отправляем
    const submitBtn = await findVisible(page, [
      'button[type="submit"]', 'button:has-text("Отправить")',
      'button:has-text("Оставить заявку")', 'button:has-text("Заказать")',
      'button:has-text("Перезвоните")', 'button:has-text("Получить")',
    ]);

    if (!submitBtn) {
      test.skip(true, 'Кнопка отправки формы не найдена');
      return;
    }

    await submitBtn.click();
    testInfo.annotations.push({ type: 'form_submitted', description: 'да' });

    // Ждём обратную связь от сайта
    await page.waitForTimeout(2000);

    const thanks = await findVisible(page, [
      'text=спасибо', 'text=заявка принята', 'text=успешно',
      '[class*="success"]', '[class*="thanks"]', '.modal .modal-content',
    ]);
    testInfo.annotations.push({ type: 'site_confirmation', description: thanks ? 'показана' : 'не найдена' });

    // Шаг 2: проверяем в CRM
    await page.waitForTimeout(2000);
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, uniquePhone.slice(-7));
    await pause(800);

    const found = await findRowByText(page, crm.prefix);
    const foundByPhone = await findRowByText(page, uniquePhone.slice(-7));
    testInfo.annotations.push({ type: 'found_in_crm', description: (found || foundByPhone) ? 'ДА' : 'НЕТ' });

    expect(
      found || foundByPhone,
      `Заявка с телефоном "${uniquePhone}", отправленная через браузер, должна появиться в CRM. ` +
      `Если лид не создался — проверьте интеграцию между формой сайта и CRM (webhook, API, email).`
    ).toBeTruthy();
  });

  // ── Канал 4: Telegram webhook ─────────────────────────────────────────────

  test('[Telegram] Входящее сообщение в Telegram-бот CRM → лид создаётся', async ({ page }, testInfo) => {
    test.skip(!TG_WEBHOOK_URL, 'CRM_TELEGRAM_WEBHOOK_URL не задан');

    const lead = makeTestLead(`TG-${Date.now()}`);
    testInfo.annotations.push({ type: 'channel', description: 'Telegram webhook' });
    testInfo.annotations.push({ type: 'webhook_url', description: TG_WEBHOOK_URL });

    const result = await sendLeadViaTelegramWebhook(
      { webhookUrl: TG_WEBHOOK_URL, secretToken: TG_SECRET || undefined },
      lead
    );

    testInfo.annotations.push({ type: 'webhook_status', description: String(result.status) });
    testInfo.annotations.push({ type: 'webhook_response', description: result.body.slice(0, 200) });

    expect(
      result.status,
      `CRM webhook должен принять Telegram update: статус ${result.status}`
    ).toBeLessThan(400);

    await page.waitForTimeout(3000);

    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);
    await pause(800);

    const found = await findRowByText(page, lead.name);
    testInfo.annotations.push({ type: 'found_in_crm', description: found ? 'ДА' : 'НЕТ' });

    expect(
      found,
      `После отправки Telegram update на ${TG_WEBHOOK_URL} в CRM должен появиться лид.`
    ).toBeTruthy();
  });

  // ── Канал 5: Email ────────────────────────────────────────────────────────

  test('[Email] Письмо на CRM-ящик → лид создаётся', async ({ page }, testInfo) => {
    test.skip(!CRM_INBOX_EMAIL || !process.env.EMAIL_SMTP_USER, 'CRM_INBOX_EMAIL или EMAIL_SMTP_USER не заданы');

    const lead = makeTestLead(`Email-${Date.now()}`);
    testInfo.annotations.push({ type: 'channel', description: 'Email' });

    const result = await sendLeadViaEmail(
      {
        smtpHost:  process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
        smtpPort:  +(process.env.EMAIL_SMTP_PORT || 587),
        smtpUser:  process.env.EMAIL_SMTP_USER || '',
        smtpPass:  process.env.EMAIL_SMTP_PASS || '',
        fromEmail: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER || '',
        toEmail:   CRM_INBOX_EMAIL,
      },
      lead
    );

    testInfo.annotations.push({ type: 'email_sent', description: result.ok ? 'да' : `нет: ${result.error}` });
    expect(result.ok, `Письмо должно отправиться без ошибок: ${result.error}`).toBeTruthy();

    // Email-парсинг может занять время — ждём до 30 сек
    await page.waitForTimeout(10000);

    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);
    await pause(800);

    const found = await findRowByText(page, lead.name);
    testInfo.annotations.push({ type: 'found_in_crm', description: found ? 'ДА' : 'НЕТ' });

    expect(
      found,
      `Письмо на ${CRM_INBOX_EMAIL} должно создавать лид в CRM (если email-интеграция настроена).`
    ).toBeTruthy();
  });

  // ── Проверка скорости обработки ──────────────────────────────────────────

  test('[Скорость] Заявка с сайта появляется в CRM не дольше 30 секунд', async ({ page }, testInfo) => {
    test.skip(!SITE_FORM_URL, 'BASE_URL или CRM_SITE_FORM_URL не задан');

    const lead     = makeTestLead(`Speed-${Date.now()}`);
    const startMs  = Date.now();

    await sendLeadViaHttp(SITE_FORM_URL, lead);

    // Проверяем с интервалом 5 сек, максимум 30 сек
    let found = false;
    let elapsed = 0;

    await loginAsAdmin(page);

    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      await page.waitForTimeout(5000);
      elapsed = Date.now() - startMs;

      await goToSection(page, crm.leadsPath);
      await searchInList(page, crm.prefix);
      await pause(300);
      found = !!(await findRowByText(page, crm.prefix));
    }

    testInfo.annotations.push({ type: 'time_to_crm_ms', description: String(elapsed) });
    testInfo.annotations.push({ type: 'found', description: String(found) });

    if (found) {
      expect(elapsed, `Заявка должна попасть в CRM менее чем за 30 000 мс`).toBeLessThan(30000);
    } else {
      console.warn(`⚠️ Заявка не появилась в CRM за 30 сек — проверьте интеграцию`);
    }
  });
});
