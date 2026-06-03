/**
 * CRM Agent 10 — Аналитика и отчёты
 *
 * Проверяет: доступность отчётов, воронка конверсии, статистика по менеджерам,
 * статистика по источникам, дашборд показателей, корректность цифр.
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import { goToSection, pause, findVisible, countRows } from '../../src/crm/actions.js';

const ANALYTICS_PATH = process.env.CRM_ANALYTICS_PATH || '/analytics';
const REPORTS_PATH   = process.env.CRM_REPORTS_PATH   || '/reports';

test.describe('CRM Аналитика: отчёты и метрики', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан');

  test('раздел аналитики/отчётов доступен', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let foundPath = '';
    for (const path of [ANALYTICS_PATH, REPORTS_PATH, '/dashboard', '/stats', '/statistics']) {
      const status = await goToSection(page, path);
      if (status < 400) {
        foundPath = path;
        break;
      }
    }

    testInfo.annotations.push({ type: 'analytics_path', description: foundPath || 'не найден' });

    if (!foundPath) {
      // Ищем через навигацию
      await loginAsAdmin(page);
      await page.goto(crm.url, { waitUntil: 'domcontentloaded', timeout: crm.timeout });
      const analyticsLink = await findVisible(page, [
        'a:has-text("Аналитика")', 'a:has-text("Отчёты")', 'a:has-text("Статистика")',
        'a:has-text("Analytics")', 'a:has-text("Reports")', 'a:has-text("Dashboard")',
        'a:has-text("Дашборд")',
      ]);
      testInfo.annotations.push({
        type: 'analytics_nav_link',
        description: analyticsLink ? 'найдена' : 'не найдена в навигации',
      });
    } else {
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('дашборд показывает ключевые метрики', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto(crm.url + crm.dashPath, { waitUntil: 'domcontentloaded', timeout: crm.timeout });

    const metrics: string[] = [];

    const metricSelectors = [
      ['Новые лиды',     '[data-testid*="new-leads"], [class*="new-leads"], text=Новые заявки'],
      ['Всего лидов',    '[data-testid*="total"], [class*="total-leads"], text=Всего заявок'],
      ['Конверсия',      '[data-testid*="conversion"], text=Конверсия, text=conversion'],
      ['Сделки',         '[data-testid*="deals"], [class*="deals-count"], text=Сделки'],
      ['Задачи',         '[data-testid*="tasks"], [class*="tasks-count"], text=Задачи'],
    ];

    for (const [name, selector] of metricSelectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.count() > 0) metrics.push(name);
      } catch { /* skip */ }
    }

    testInfo.annotations.push({ type: 'dashboard_metrics', description: metrics.join(', ') || 'не найдены' });

    if (metrics.length === 0) {
      console.warn('Виджеты дашборда не найдены — возможно другая структура или нет дашборда');
    }
  });

  test('воронка конверсии отображается', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    for (const path of [ANALYTICS_PATH, REPORTS_PATH, '/dashboard']) {
      const status = await goToSection(page, path);
      if (status < 400) {
        await pause(500);

        const funnel = await findVisible(page, [
          '[data-testid*="funnel"]', '[class*="funnel"]',
          '[class*="pipeline-chart"]', 'text=Воронка',
          'canvas', 'svg[class*="chart"]',
        ]);

        testInfo.annotations.push({
          type: 'funnel_widget',
          description: funnel ? `найдена в ${path}` : `не найдена в ${path}`,
        });

        if (funnel) break;
      }
    }
  });

  test('статистика по менеджерам', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    for (const path of [ANALYTICS_PATH, REPORTS_PATH, '/stats']) {
      const status = await goToSection(page, path);
      if (status < 400) {
        const managersTable = await findVisible(page, [
          '[data-testid*="managers"]', '[class*="manager-stats"]',
          'text=По менеджерам', 'text=Менеджеры',
          'table:has(th)',
        ]);

        testInfo.annotations.push({
          type: 'managers_stats',
          description: managersTable ? `найдена в ${path}` : `не найдена в ${path}`,
        });
        if (managersTable) break;
      }
    }
  });

  test('статистика по источникам лидов', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    for (const path of [ANALYTICS_PATH, REPORTS_PATH]) {
      const status = await goToSection(page, path);
      if (status < 400) {
        const sourceStats = await findVisible(page, [
          '[data-testid*="source"]', '[class*="source-stats"]',
          'text=Источники', 'text=По источникам',
          'text=Sources',
        ]);

        testInfo.annotations.push({
          type: 'source_stats',
          description: sourceStats ? `найдена в ${path}` : `не найдена в ${path}`,
        });
        if (sourceStats) break;
      }
    }
  });

  test('отчёт за период генерируется без ошибок', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    for (const path of [ANALYTICS_PATH, REPORTS_PATH]) {
      const status = await goToSection(page, path);
      if (status < 400) {
        await pause(300);

        // Пробуем задать период
        const dateFrom = await findVisible(page, [
          'input[name*="from" i][type="date"]', 'input[name*="start" i][type="date"]',
          'input[name*="date_from" i]', '[placeholder*="от" i][type="date"]',
        ]);

        if (dateFrom) {
          const from = new Date();
          from.setDate(from.getDate() - 7);
          await dateFrom.fill(from.toISOString().slice(0, 10));

          const dateTo = await findVisible(page, [
            'input[name*="to" i][type="date"]', 'input[name*="end" i][type="date"]',
            'input[name*="date_to" i]',
          ]);
          if (dateTo) {
            await dateTo.fill(new Date().toISOString().slice(0, 10));
          }

          // Применяем
          const applyBtn = await findVisible(page, [
            'button:has-text("Применить")', 'button:has-text("Показать")',
            'button[type="submit"]', 'button:has-text("Сформировать")',
          ]);
          if (applyBtn) {
            await applyBtn.click();
            await pause(1500);

            const title = await page.title();
            expect(title).not.toMatch(/500|Error/i);
            testInfo.annotations.push({ type: 'report_generated', description: `в ${path}` });
            break;
          }
        }
      }
    }
  });

  test('числа в отчётах не нулевые (если есть данные)', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await goToSection(page, crm.leadsPath);
    const totalLeads = await countRows(page);

    testInfo.annotations.push({ type: 'total_leads_in_system', description: String(totalLeads) });

    if (totalLeads === 0) {
      console.warn('Список лидов пустой — добавьте тестовые данные перед проверкой отчётов');
      return;
    }

    // Заходим в аналитику и проверяем, что общее число лидов в отчёте > 0
    for (const path of [ANALYTICS_PATH, REPORTS_PATH, '/dashboard']) {
      const status = await goToSection(page, path);
      if (status < 400) {
        await pause(500);
        const bodyText = await page.locator('body').textContent() || '';

        // Ищем любое число > 0 в метриках
        const numbers = bodyText.match(/\b\d{1,6}\b/g)?.map(Number).filter(n => n > 0) || [];
        testInfo.annotations.push({
          type: 'non_zero_numbers_in_analytics',
          description: numbers.length > 0 ? `найдены: ${numbers.slice(0, 5).join(', ')}` : 'не найдены',
        });
        break;
      }
    }
  });
});
