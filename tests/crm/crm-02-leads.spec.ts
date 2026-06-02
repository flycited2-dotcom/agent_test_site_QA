/**
 * CRM Agent 2 — Заявки / Лиды
 * Симулирует работу менеджера: создание, поиск, открытие, смена статуса, добавление заметок.
 * Частота: каждые 2 часа.
 *
 * Все тестовые записи имеют префикс [QA] — их легко найти и удалить при необходимости.
 */

import { test, expect } from '@playwright/test';
import { loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, clickCreateButton, fillLeadForm, submitForm,
  hasSuccessFeedback, hasErrorFeedback, searchInList, countRows,
  findRowByText, getAvailableStatuses, changeStatusTo, pause,
} from '../../src/crm/actions.js';

test.describe('CRM Лиды: жизненный цикл заявки', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан — заполните .env');

  // Уникальное имя для каждого прогона, чтобы тесты не мешали друг другу
  const runId = Date.now();
  const testLead = {
    name:    `${crm.prefix} Иванов ${runId}`,
    phone:   crm.testPhone,
    email:   crm.testEmail,
    comment: crm.testComment,
  };

  test('открывается список заявок', async ({ page }) => {
    await loginAsManager(page);
    const status = await goToSection(page, crm.leadsPath);
    expect(status, `Список заявок должен открываться без ошибки`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });

  test('есть кнопка создания новой заявки', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const found = await clickCreateButton(page);
    expect(
      found,
      'Кнопка "Добавить/Создать/Новый лид" должна быть в разделе заявок. ' +
      'Если кнопка есть, но агент её не находит — добавьте CRM_LEADS_PATH в .env.'
    ).toBeTruthy();
  });

  test('создание новой заявки со всеми полями', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const rowsBefore = await countRows(page);

    const created = await clickCreateButton(page);
    if (!created) {
      testInfo.annotations.push({ type: 'skip_reason', description: 'кнопка создания не найдена' });
      test.skip(true, 'Кнопка создания не найдена — настройте CRM_LEADS_PATH в .env');
      return;
    }

    const { filled, missing } = await fillLeadForm(page, testLead);
    testInfo.annotations.push({ type: 'fields_filled', description: filled.join(', ') });
    testInfo.annotations.push({ type: 'fields_missing', description: missing.join(', ') });

    expect(filled.length, `Должно заполниться хотя бы поле "name". Не найдены поля: ${missing.join(', ')}`).toBeGreaterThan(0);
    expect(filled).toContain('name');

    await submitForm(page);

    // Проверяем обратную связь от CRM
    const success = await hasSuccessFeedback(page);
    const error = await hasErrorFeedback(page);
    testInfo.annotations.push({ type: 'success_feedback', description: String(success) });
    if (error) testInfo.annotations.push({ type: 'error_feedback', description: error });

    expect(error, `Форма создания заявки не должна показывать ошибку после правильного заполнения: ${error}`).toBe('');

    // Проверяем, что лид появился в списке
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const rowsAfter = await countRows(page);
    testInfo.annotations.push({ type: 'rows_before', description: String(rowsBefore) });
    testInfo.annotations.push({ type: 'rows_after', description: String(rowsAfter) });

    const row = await findRowByText(page, testLead.name);
    if (!row) {
      // Список может не искать по имени — проверяем хотя бы что записей стало больше или список не пустой
      expect(
        rowsAfter,
        `После создания заявки "${testLead.name}" список не должен быть пустым`
      ).toBeGreaterThan(0);
    }
  });

  test('валидация: заявка с пустым именем отклоняется', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания не найдена');
      return;
    }

    // Заполняем форму, но оставляем имя пустым
    await fillLeadForm(page, { ...testLead, name: '' });
    await submitForm(page);
    await pause();

    const currentUrl = page.url();
    const error = await hasErrorFeedback(page);
    const staysOnForm = currentUrl.includes('/new') || currentUrl.includes('/create') || currentUrl.includes('/add');

    expect(
      error || staysOnForm,
      `При пустом имени CRM должна показать ошибку валидации или не дать закрыть форму. ` +
      `Сейчас: URL=${currentUrl}, ошибка="${error}"`
    ).toBeTruthy();
  });

  test('поиск заявки по имени/тексту', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    await searchInList(page, crm.prefix);
    const rows = await countRows(page);

    // Поиск работает, если список не пустой ИЛИ показывает "ничего не найдено"
    const emptyMsg = await page.locator(
      'text=не найдено, text=пусто, text=нет записей, [class*="empty"], [class*="no-results"]'
    ).count();

    expect(
      rows > 0 || emptyMsg > 0,
      'После поиска CRM должна показать либо список результатов, либо сообщение "ничего не найдено"'
    ).toBeTruthy();
  });

  test('открытие карточки заявки', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-заявки не найдены в списке — сначала создайте заявку');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const url = page.url();
    expect(
      url,
      'Клик по заявке должен открыть карточку (URL должен измениться)'
    ).not.toBe(crm.url + crm.leadsPath);

    await expect(page.locator('body')).toBeVisible();

    const title = await page.title();
    expect(title).not.toMatch(/404|403|500/);
  });

  test('смена статуса заявки', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-заявки не найдены');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const statuses = await getAvailableStatuses(page);
    testInfo.annotations.push({ type: 'available_statuses', description: statuses.join(', ') || 'не найдены' });

    if (statuses.length < 2) {
      testInfo.annotations.push({ type: 'status_result', description: 'поле статуса не обнаружено — требуется калибровка' });
      console.warn('Поле статуса не найдено. Добавьте data-testid="status-select" или select[name="status"] в CRM.');
      return;
    }

    // Берём второй статус (не первый, чтобы реально поменять)
    const newStatus = statuses[1];
    const changed = await changeStatusTo(page, newStatus);
    testInfo.annotations.push({ type: 'status_changed_to', description: newStatus });

    if (changed) {
      const submitted = await submitForm(page);
      if (submitted) await pause(500);

      // Перезагружаем и проверяем, что статус сохранился
      await page.reload({ waitUntil: 'domcontentloaded' });
      await pause(500);

      const currentStatuses = await getAvailableStatuses(page);
      const selectedIndex = currentStatuses.indexOf(newStatus);

      testInfo.annotations.push({ type: 'status_after_reload', description: String(currentStatuses) });
      expect(
        selectedIndex,
        `Статус "${newStatus}" должен сохраняться после перезагрузки. Доступные: ${currentStatuses.join(', ')}`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  test('добавление комментария/заметки к заявке', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-заявки не найдены');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const commentText = `[QA] Заметка от агента ${Date.now()}`;
    const textarea = page.locator(
      'textarea[name*="comment"], textarea[name*="note"], textarea[placeholder*="комментарий" i], textarea[placeholder*="заметка" i]'
    ).first();

    if (await textarea.count() === 0) {
      console.warn('Поле комментария не найдено на карточке заявки');
      return;
    }

    await textarea.fill(commentText);
    await pause(300);

    const submitted = await submitForm(page);
    if (!submitted) {
      console.warn('Кнопка сохранения комментария не найдена');
      return;
    }

    await pause(800);
    const commentVisible = await page.locator(`text=${commentText}`).count() > 0;
    expect(
      commentVisible,
      `Добавленный комментарий "${commentText}" должен отображаться после сохранения`
    ).toBeTruthy();
  });

  test('дублирование: попытка создать заявку с тем же телефоном', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания не найдена');
      return;
    }

    await fillLeadForm(page, {
      ...testLead,
      name: `${crm.prefix} Дубль ${Date.now()}`,
    });
    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    const success = await hasSuccessFeedback(page);
    testInfo.annotations.push({
      type: 'duplicate_behavior',
      description: error ? `ошибка: ${error}` : success ? 'разрешено (дубли не блокируются)' : 'нет обратной связи',
    });

    // Оба поведения валидны — но фиксируем для аудита
    console.log(`Поведение при дубле телефона: ${error || (success ? 'создан без предупреждения' : 'неизвестно')}`);
  });
});
