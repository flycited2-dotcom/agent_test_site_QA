/**
 * CRM Agent 7 — Воронка продаж / Pipeline
 *
 * Тестирует полный жизненный цикл лида через все этапы воронки:
 * Новый → Принят → В работе → Коммерческое предложение → Согласование → Закрыт/Выигран
 *
 * Также: назначение ответственного, установка даты перезвона, история изменений.
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, clickCreateButton, fillLeadForm, submitForm,
  hasSuccessFeedback, hasErrorFeedback, searchInList, findRowByText,
  getAvailableStatuses, changeStatusTo, pause, findVisible,
} from '../../src/crm/actions.js';

test.describe('CRM Воронка: полный путь лида по этапам', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан');

  const runId = Date.now();
  const pipelineLead = {
    name:    `${crm.prefix} Воронка ${runId}`,
    phone:   crm.testPhone,
    email:   crm.testEmail,
    comment: crm.testComment,
  };

  test('создание лида — начало воронки', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания не найдена');
      return;
    }

    const { filled } = await fillLeadForm(page, pipelineLead);
    expect(filled, 'Имя должно заполниться').toContain('name');

    await submitForm(page);
    const error = await hasErrorFeedback(page);
    expect(error, `Создание лида для воронки: ${error}`).toBe('');

    testInfo.annotations.push({ type: 'lead_created', description: pipelineLead.name });
  });

  test('все этапы воронки доступны и переключаются', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-лид не найден — создайте сначала');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const statuses = await getAvailableStatuses(page);
    testInfo.annotations.push({ type: 'pipeline_stages', description: statuses.join(' → ') || 'не найдены' });

    if (statuses.length === 0) {
      console.warn('Поле статуса не обнаружено. Добавьте select[name="status"] в форму лида.');
      return;
    }

    expect(
      statuses.length,
      `В воронке должно быть хотя бы 2 этапа. Найдено: ${statuses.join(', ')}`
    ).toBeGreaterThanOrEqual(2);

    // Последовательно проходим каждый этап
    const passedStages: string[] = [];
    for (const stage of statuses) {
      const changed = await changeStatusTo(page, stage);
      if (changed) {
        await submitForm(page).catch(() => {});
        await pause(500);
        const error = await hasErrorFeedback(page);
        if (!error) passedStages.push(stage);
      }
    }

    testInfo.annotations.push({ type: 'stages_passed', description: passedStages.join(', ') });
    expect(
      passedStages.length,
      `Должен пройти хотя бы один этап воронки. Пройдено: ${passedStages.join(', ')}`
    ).toBeGreaterThan(0);
  });

  test('назначение ответственного менеджера', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-лид не найден');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    // Ищем поле назначения ответственного
    const assignField = await findVisible(page, [
      'select[name*="assign" i]', 'select[name*="manager" i]',
      'select[name*="responsible" i]', 'select[name*="user" i]',
      '[data-testid*="assign"]', '[placeholder*="ответственн" i]',
      '[placeholder*="менеджер" i]',
    ]);

    testInfo.annotations.push({
      type: 'assign_field',
      description: assignField ? 'найдено' : 'не найдено',
    });

    if (!assignField) {
      console.warn('Поле назначения менеджера не найдено — возможно реализовано иначе');
      return;
    }

    // Выбираем первого доступного
    const selectEl = page.locator('select[name*="assign" i], select[name*="manager" i], select[name*="responsible" i]').first();
    if (await selectEl.count() > 0) {
      const options = await selectEl.locator('option').allTextContents();
      testInfo.annotations.push({ type: 'available_managers', description: options.join(', ') });

      if (options.length >= 2) {
        const targetManager = options.find(o => o.trim()) || options[1];
        await selectEl.selectOption({ label: targetManager });
        await submitForm(page);
        const error = await hasErrorFeedback(page);
        expect(error, `Назначение менеджера не должно давать ошибку: ${error}`).toBe('');
        testInfo.annotations.push({ type: 'assigned_to', description: targetManager });
      }
    }
  });

  test('установка даты перезвона / callback', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-лид не найден');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    // Дата перезвона / next contact
    const callbackField = await findVisible(page, [
      'input[name*="callback" i]', 'input[name*="call_date" i]',
      'input[name*="next_contact" i]', 'input[name*="follow_up" i]',
      'input[type="date"]', 'input[type="datetime-local"]',
      '[placeholder*="перезвон" i]', '[placeholder*="дата контакт" i]',
    ]);

    testInfo.annotations.push({
      type: 'callback_field',
      description: callbackField ? 'найдено' : 'не найдено',
    });

    if (!callbackField) {
      console.warn('Поле даты перезвона не найдено — возможно реализовано через задачи');
      return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const inputType = await callbackField.getAttribute('type');
    if (inputType === 'datetime-local') {
      await callbackField.fill(dateStr + 'T10:00');
    } else {
      await callbackField.fill(dateStr);
    }

    await submitForm(page);
    const error = await hasErrorFeedback(page);
    expect(error, `Установка даты перезвона не должна давать ошибку: ${error}`).toBe('');
    testInfo.annotations.push({ type: 'callback_set', description: dateStr });
  });

  test('история изменений лида (лог активности)', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-лид не найден');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const historySection = await findVisible(page, [
      '[data-testid*="history"]', '[data-testid*="activity"]', '[data-testid*="log"]',
      '[data-testid*="timeline"]', 'text=История', 'text=Активность',
      'text=Лог', '[class*="history"]', '[class*="activity"]', '[class*="timeline"]',
      '[class*="log"]',
    ]);

    testInfo.annotations.push({
      type: 'history_section',
      description: historySection ? 'найдена' : 'не найдена',
    });

    if (historySection) {
      const historyItems = await page.locator('[class*="history"] li, [class*="activity"] li, [class*="timeline"] .item').count();
      testInfo.annotations.push({ type: 'history_items', description: String(historyItems) });
    }
  });

  test('конвертация лида в клиента / сделку', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-лид не найден');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const convertBtn = await findVisible(page, [
      'button:has-text("Конвертировать")', 'a:has-text("Конвертировать")',
      'button:has-text("Создать клиента")', 'button:has-text("В клиенты")',
      'button:has-text("В сделку")', 'button:has-text("Convert")',
      '[data-testid*="convert"]',
    ]);

    testInfo.annotations.push({
      type: 'convert_button',
      description: convertBtn ? 'найдена' : 'не найдена — возможно конвертация не предусмотрена',
    });

    if (convertBtn) {
      await convertBtn.click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await pause();

      const url = page.url();
      const error = await hasErrorFeedback(page);
      testInfo.annotations.push({ type: 'after_convert_url', description: url });
      expect(error, `Конвертация не должна давать ошибку: ${error}`).toBe('');
    }
  });

  test('архивирование / закрытие лида без выигрыша', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-лид не найден');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const closeBtn = await findVisible(page, [
      'button:has-text("Закрыть")', 'button:has-text("Архивировать")',
      'button:has-text("Отказ")', 'button:has-text("Проигран")',
      'button:has-text("Не закрыта")', '[data-testid*="close"]',
      '[data-testid*="archive"]',
    ]);

    testInfo.annotations.push({
      type: 'close_button',
      description: closeBtn ? 'найдена' : 'не найдена',
    });

    if (closeBtn) {
      await closeBtn.click();
      await pause(500);
      const error = await hasErrorFeedback(page);
      expect(error, `Закрытие лида не должно давать ошибку: ${error}`).toBe('');
    } else {
      // Попробуем через статус
      const statuses = await getAvailableStatuses(page);
      const closedStatus = statuses.find(s =>
        /закрыт|отказ|проигран|архив|closed|lost/i.test(s)
      );
      if (closedStatus) {
        await changeStatusTo(page, closedStatus);
        await submitForm(page).catch(() => {});
        testInfo.annotations.push({ type: 'closed_via_status', description: closedStatus });
      }
    }
  });
});
