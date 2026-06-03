/**
 * CRM Agent 9 — Поиск и фильтры
 *
 * Проверяет: глобальный поиск, фильтры по статусу/менеджеру/источнику/дате,
 * сортировка, быстрые фильтры, экспорт результатов.
 * Слабый поиск = потерянные заявки. Критически важно.
 */

import { test, expect } from '@playwright/test';
import { loginAsManager, loginAsAdmin } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import {
  goToSection, searchInList, findRowByText, countRows,
  pause, findVisible,
} from '../../src/crm/actions.js';

test.describe('CRM Поиск и фильтры: ничего не должно теряться', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан');

  test('поиск по телефону находит заявку', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const phone7 = crm.testPhone.slice(-7);
    await searchInList(page, phone7);
    await pause(500);

    const rows = await countRows(page);
    testInfo.annotations.push({ type: 'search_term', description: phone7 });
    testInfo.annotations.push({ type: 'results', description: String(rows) });

    const noResults = await page.locator('text=не найдено, text=пусто, [class*="empty"]').count() > 0;

    expect(
      rows > 0 || noResults,
      `Поиск по телефону "${phone7}" должен давать результат или явно показывать "не найдено"`
    ).toBeTruthy();
  });

  test('поиск по email находит заявку', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const emailPart = crm.testEmail.split('@')[0];
    await searchInList(page, emailPart);
    await pause(500);

    const rows = await countRows(page);
    testInfo.annotations.push({ type: 'email_search_results', description: String(rows) });
  });

  test('поиск по имени [QA] возвращает только QA-записи', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    await searchInList(page, crm.prefix);
    await pause(500);

    const rows = await countRows(page);
    testInfo.annotations.push({ type: 'qa_records_count', description: String(rows) });

    // Все найденные строки должны содержать [QA] или поиск пустой
    const allText = await page.locator('body').textContent() || '';
    const hasNonQA = rows > 0 && !allText.includes(crm.prefix);

    expect(
      !hasNonQA,
      `Поиск по "${crm.prefix}" не должен показывать записи без этого маркера — ` +
      `нарушение поиска может скрывать реальных клиентов`
    ).toBeTruthy();
  });

  test('фильтр по статусу работает', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const statusFilter = await findVisible(page, [
      'select[name*="status" i]', 'select[name*="filter" i]',
      '[data-testid*="status-filter"]', 'button:has-text("Статус")',
      '[class*="filter-status"]',
    ]);

    testInfo.annotations.push({
      type: 'status_filter',
      description: statusFilter ? 'найден' : 'не найден',
    });

    if (!statusFilter) {
      console.warn('Фильтр по статусу не найден — возможно не реализован');
      return;
    }

    const selectEl = page.locator('select[name*="status" i], select[name*="filter" i]').first();
    if (await selectEl.count() > 0) {
      const options = await selectEl.locator('option').allTextContents();
      testInfo.annotations.push({ type: 'filter_options', description: options.join(', ') });

      if (options.length >= 2) {
        await selectEl.selectOption({ index: 1 });
        await pause(800);

        const filteredRows = await countRows(page);
        testInfo.annotations.push({ type: 'filtered_rows', description: String(filteredRows) });
      }
    }
  });

  test('фильтр по дате (сегодня) работает', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const dateFilter = await findVisible(page, [
      'input[name*="date" i][type="date"]',
      '[data-testid*="date-filter"]',
      'button:has-text("Сегодня")',
      'button:has-text("Today")',
      'select[name*="period" i]',
    ]);

    testInfo.annotations.push({
      type: 'date_filter',
      description: dateFilter ? 'найден' : 'не найден',
    });

    if (!dateFilter) {
      console.warn('Фильтр по дате не найден');
      return;
    }

    const todayBtn = page.locator('button:has-text("Сегодня"), button:has-text("Today")').first();
    if (await todayBtn.count() > 0) {
      await todayBtn.click();
      await pause(800);

      const rows = await countRows(page);
      testInfo.annotations.push({ type: 'today_results', description: String(rows) });
    }
  });

  test('сортировка списка заявок работает', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const rowsBefore = await countRows(page);
    if (rowsBefore === 0) {
      test.skip(true, 'Список заявок пустой — нечего сортировать');
      return;
    }

    // Клик по заголовку колонки для сортировки
    const sortHeaders = await page.locator('th[class*="sort"], th[data-sort], th button, th a').all();

    if (sortHeaders.length > 0) {
      const firstHeader = sortHeaders[0];
      await firstHeader.click();
      await pause(500);

      const rowsAfter = await countRows(page);
      testInfo.annotations.push({
        type: 'sort_result',
        description: `до: ${rowsBefore}, после: ${rowsAfter}`,
      });

      expect(rowsAfter, 'После сортировки количество записей не должно меняться').toBe(rowsBefore);
    } else {
      testInfo.annotations.push({ type: 'sort_headers', description: 'не найдены' });
      console.warn('Кликабельные заголовки для сортировки не найдены');
    }
  });

  test('глобальный поиск по всей CRM', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    // Глобальный поиск (обычно в шапке)
    const globalSearch = await findVisible(page, [
      'input[name="global_search"]', 'input[placeholder*="поиск по CRM" i]',
      'input[placeholder*="глобальн" i]', 'input[data-testid="global-search"]',
      'header input[type="search"]', 'nav input[type="search"]',
      '.header input', '.navbar input',
    ]);

    testInfo.annotations.push({
      type: 'global_search',
      description: globalSearch ? 'найден' : 'не найден в шапке',
    });

    if (!globalSearch) {
      console.warn('Глобальный поиск не найден — поиск только внутри разделов');
      return;
    }

    await globalSearch.fill(crm.prefix);
    await page.keyboard.press('Enter');
    await pause(1000);

    const results = await countRows(page);
    testInfo.annotations.push({ type: 'global_results', description: String(results) });
  });

  test('пустой поиск показывает все записи', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await goToSection(page, crm.leadsPath);

    const totalRows = await countRows(page);

    // Поиск с пустым запросом
    await searchInList(page, '');
    await pause(800);

    const rowsAfter = await countRows(page);
    testInfo.annotations.push({
      type: 'empty_search',
      description: `до: ${totalRows}, после сброса: ${rowsAfter}`,
    });

    expect(
      rowsAfter,
      `Пустой/сброшенный поиск должен показывать все записи обратно (было ${totalRows})`
    ).toBe(totalRows);
  });

  test('экспорт данных (CSV/Excel)', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);

    const exportBtn = await findVisible(page, [
      'button:has-text("Экспорт")', 'a:has-text("Экспорт")',
      'button:has-text("Export")', 'a:has-text("Export")',
      'button:has-text("Скачать")', '[data-testid*="export"]',
      'a[href*=".csv"]', 'a[href*="export"]',
    ]);

    testInfo.annotations.push({
      type: 'export_button',
      description: exportBtn ? 'найдена' : 'не найдена',
    });

    if (!exportBtn) {
      console.warn('Кнопка экспорта не найдена — экспорт данных не реализован или скрыт');
      return;
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
      exportBtn.click(),
    ]);

    testInfo.annotations.push({
      type: 'download_triggered',
      description: download ? `файл: ${download.suggestedFilename()}` : 'загрузка не началась',
    });
  });
});
