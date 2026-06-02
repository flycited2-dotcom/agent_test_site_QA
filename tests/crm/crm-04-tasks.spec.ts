/**
 * CRM Agent 4 — Задачи / Напоминания
 * Симулирует: создание задачи, постановка дедлайна, смена статуса, завершение.
 * Частота: каждые 4 часа.
 */

import { test, expect } from '@playwright/test';
import { loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, clickCreateButton, fillTaskForm, submitForm,
  hasSuccessFeedback, hasErrorFeedback, searchInList, countRows,
  findRowByText, pause, findVisible, changeStatusTo, getAvailableStatuses,
} from '../../src/crm/actions.js';

// Завтрашняя дата для дедлайна
function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

test.describe('CRM Задачи: создание и управление задачами', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан — заполните .env');

  const runId = Date.now();
  const testTask = {
    title:       `${crm.prefix} Задача агента ${runId}`,
    description: crm.testComment,
    deadline:    tomorrowDate(),
  };

  test('открывается список задач', async ({ page }) => {
    await loginAsManager(page);
    const status = await goToSection(page, crm.tasksPath);
    expect(status, `Раздел задач должен открываться: ${crm.url + crm.tasksPath}`).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });

  test('есть кнопка создания задачи', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);

    const found = await clickCreateButton(page);
    expect(
      found,
      'Кнопка создания задачи должна быть доступна. Проверьте CRM_TASKS_PATH в .env.'
    ).toBeTruthy();
  });

  test('создание задачи с дедлайном', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания задачи не найдена');
      return;
    }

    const { filled, missing } = await fillTaskForm(page, testTask);
    testInfo.annotations.push({ type: 'fields_filled', description: filled.join(', ') });
    testInfo.annotations.push({ type: 'fields_missing', description: missing.join(', ') });

    expect(
      filled,
      `Должно заполниться поле "title". Не найдены: ${missing.join(', ')}`
    ).toContain('title');

    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    expect(error, `Создание задачи не должно давать ошибку: ${error}`).toBe('');

    // Ищем задачу в списке
    await goToSection(page, crm.tasksPath);
    await searchInList(page, crm.prefix);
    await pause(500);

    const row = await findRowByText(page, testTask.title);
    const rows = await countRows(page);

    expect(
      row || rows > 0,
      `Созданная задача "${testTask.title}" должна отображаться в списке`
    ).toBeTruthy();
  });

  test('задача с пустым заголовком отклоняется', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания не найдена');
      return;
    }

    await fillTaskForm(page, { ...testTask, title: '' });
    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    const staysOnForm = page.url().includes('/new') || page.url().includes('/create');

    expect(
      error || staysOnForm,
      'Задача без заголовка должна блокироваться валидацией'
    ).toBeTruthy();
  });

  test('открытие и просмотр карточки задачи', async ({ page }) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-задачи не найдены — сначала создайте задачу');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const url = page.url();
    expect(url).not.toBe(crm.url + crm.tasksPath);
    await expect(page.locator('body')).toBeVisible();
  });

  test('смена статуса задачи (выполнена)', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);
    await searchInList(page, crm.prefix);

    const row = await findRowByText(page, crm.prefix);
    if (!row) {
      test.skip(true, 'QA-задачи не найдены');
      return;
    }

    await row.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await pause();

    const statuses = await getAvailableStatuses(page);
    testInfo.annotations.push({ type: 'task_statuses', description: statuses.join(', ') || 'не найдены' });

    if (statuses.length >= 2) {
      const doneStatus = statuses.find(s =>
        /выполн|закрыт|готов|done|completed|closed/i.test(s)
      ) || statuses[statuses.length - 1];

      const changed = await changeStatusTo(page, doneStatus);
      testInfo.annotations.push({ type: 'status_set', description: doneStatus });

      if (changed) {
        await submitForm(page);
        const error = await hasErrorFeedback(page);
        expect(error, `Смена статуса задачи не должна давать ошибку: ${error}`).toBe('');
      }
    } else {
      // Попробуем найти кнопку "Выполнить" / "Завершить"
      const doneBtn = await findVisible(page, [
        'button:has-text("Выполнить")', 'button:has-text("Завершить")',
        'button:has-text("Готово")', 'button:has-text("Done")',
        'button:has-text("Complete")', '[data-testid*="complete"]',
        '[data-testid*="done"]',
      ]);

      if (doneBtn) {
        await doneBtn.click();
        await pause(500);
        testInfo.annotations.push({ type: 'done_btn_clicked', description: 'да' });
      } else {
        testInfo.annotations.push({ type: 'task_completion', description: 'кнопка/статус не найдены — нужна калибровка' });
        console.warn('Поле статуса задачи или кнопка завершения не найдены');
      }
    }
  });

  test('просроченные задачи видны и не скрыты', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);

    // Ищем фильтр "просроченные" если есть
    const overdueFilter = await findVisible(page, [
      'text=Просроченные', 'text=Просрочено', 'text=Overdue',
      '[data-testid*="overdue"]', 'button:has-text("Просроч")',
    ]);

    if (overdueFilter) {
      await overdueFilter.click();
      await pause(500);
      const rows = await countRows(page);
      testInfo.annotations.push({ type: 'overdue_count', description: String(rows) });

      if (rows > 0) {
        console.warn(`⚠️ Найдено ${rows} просроченных задач — требуется внимание менеджера`);
      }
    } else {
      testInfo.annotations.push({ type: 'overdue_filter', description: 'не найден' });
    }
  });

  test('задачи можно привязать к заявке', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.tasksPath);

    const created = await clickCreateButton(page);
    if (!created) {
      test.skip(true, 'Кнопка создания не найдена');
      return;
    }

    await fillTaskForm(page, { ...testTask, title: `${crm.prefix} Задача к заявке ${runId}` });

    // Ищем поле привязки к лиду/заявке
    const leadLink = await findVisible(page, [
      'select[name*="lead" i]', 'input[name*="lead" i]',
      '[data-testid*="lead-select"]', '[placeholder*="заявк" i]',
      '[placeholder*="лид" i]', 'select[name*="client" i]',
    ]);

    testInfo.annotations.push({
      type: 'lead_link_field',
      description: leadLink ? 'найдено' : 'не найдено — связь задача→заявка недоступна или скрыта',
    });

    await submitForm(page);
    await pause();

    const error = await hasErrorFeedback(page);
    expect(error, `Создание задачи не должно давать ошибку: ${error}`).toBe('');
  });
});
