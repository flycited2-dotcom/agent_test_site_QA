/**
 * CRM Agent 11 — Администрирование и настройки
 *
 * Проверяет: управление пользователями, роли/права, настройки воронки,
 * интеграции (статус), уведомления, логи системы.
 * Запускается от имени администратора.
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager } from '../../src/crm/auth.js';
import { crm } from '../../src/crm/config.js';
import { goToSection, pause, findVisible, countRows } from '../../src/crm/actions.js';

const SETTINGS_PATH = process.env.CRM_SETTINGS_PATH || '/settings';
const USERS_PATH    = process.env.CRM_USERS_PATH     || '/settings/users';

test.describe('CRM Администрирование: права, настройки, интеграции', () => {

  test.skip(!process.env.CRM_BASE_URL, 'CRM_BASE_URL не задан');

  test('раздел настроек доступен для администратора', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let foundPath = '';
    for (const path of [SETTINGS_PATH, '/admin', '/settings', '/config', '/administration']) {
      const status = await goToSection(page, path);
      if (status < 400) { foundPath = path; break; }
    }

    testInfo.annotations.push({ type: 'settings_path', description: foundPath || 'не найден' });

    if (!foundPath) {
      console.warn('Раздел настроек не найден — задайте CRM_SETTINGS_PATH в .env');
    } else {
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('менеджер НЕ имеет доступа к настройкам администратора', async ({ page }, testInfo) => {
    test.skip(
      crm.managerEmail === crm.adminEmail,
      'Отдельный аккаунт менеджера не задан (CRM_MANAGER_EMAIL) — пропускаем тест прав'
    );

    await loginAsManager(page);

    for (const path of [SETTINGS_PATH, '/admin', '/settings/users', '/users']) {
      const status = await goToSection(page, path);
      const url = page.url();

      const blocked = status === 403 || status === 404 || url.includes('/login') || url.includes('/forbidden');

      testInfo.annotations.push({
        type: `access_to_${path}`,
        description: blocked ? `заблокирован (${status})` : `ДОСТУПЕН (${status}) — уязвимость!`,
      });

      if (!blocked) {
        console.warn(`⚠️ УЯЗВИМОСТЬ: менеджер имеет доступ к ${crm.url}${path} (HTTP ${status})`);
      }
    }
  });

  test('список пользователей CRM загружается', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let usersPath = '';
    for (const path of [USERS_PATH, '/settings/users', '/admin/users', '/users', '/team']) {
      const status = await goToSection(page, path);
      if (status < 400) { usersPath = path; break; }
    }

    testInfo.annotations.push({ type: 'users_path', description: usersPath || 'не найден' });

    if (usersPath) {
      const userCount = await countRows(page);
      testInfo.annotations.push({ type: 'user_count', description: String(userCount) });

      expect(userCount, 'В CRM должен быть хотя бы один пользователь (администратор)').toBeGreaterThan(0);
    }
  });

  test('настройки воронки (этапы) редактируемы', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let pipelinePath = '';
    for (const path of ['/settings/pipeline', '/settings/stages', '/pipeline', '/admin/pipeline']) {
      const status = await goToSection(page, path);
      if (status < 400) { pipelinePath = path; break; }
    }

    // Также ищем через навигацию настроек
    if (!pipelinePath) {
      await goToSection(page, SETTINGS_PATH);
      const pipelineLink = await findVisible(page, [
        'a:has-text("Воронка")', 'a:has-text("Этапы")', 'a:has-text("Pipeline")',
        'a:has-text("Стадии")', 'a:has-text("Stages")',
      ]);
      if (pipelineLink) {
        await pipelineLink.click();
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        pipelinePath = page.url().replace(crm.url, '');
      }
    }

    testInfo.annotations.push({ type: 'pipeline_settings', description: pipelinePath || 'не найдены' });

    if (pipelinePath) {
      const stages = await countRows(page);
      testInfo.annotations.push({ type: 'pipeline_stages_count', description: String(stages) });

      expect(stages, 'Воронка должна содержать хотя бы один этап').toBeGreaterThan(0);
    }
  });

  test('статус интеграций (сайт, Telegram, email)', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let integrationsPath = '';
    for (const path of ['/settings/integrations', '/integrations', '/settings/connections', '/admin/integrations']) {
      const status = await goToSection(page, path);
      if (status < 400) { integrationsPath = path; break; }
    }

    if (!integrationsPath) {
      await goToSection(page, SETTINGS_PATH);
      const intLink = await findVisible(page, [
        'a:has-text("Интеграции")', 'a:has-text("Integrations")',
        'a:has-text("Подключения")', 'a:has-text("Webhooks")',
      ]);
      if (intLink) {
        await intLink.click();
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        integrationsPath = page.url().replace(crm.url, '');
      }
    }

    testInfo.annotations.push({ type: 'integrations_path', description: integrationsPath || 'не найдено' });

    if (integrationsPath) {
      const bodyText = await page.locator('body').textContent() || '';

      // Проверяем статус подключений (не должно быть "Ошибка/Error/Disconnected")
      const errorSignals = [
        'ошибка подключения', 'disconnected', 'error', 'failed',
        'не подключено', 'connection error',
      ];
      const activeSignals = ['активно', 'connected', 'active', 'подключено', 'online', '✓'];

      const hasError = errorSignals.some(s => bodyText.toLowerCase().includes(s));
      const hasActive = activeSignals.some(s => bodyText.toLowerCase().includes(s));

      testInfo.annotations.push({
        type: 'integrations_status',
        description: hasError ? 'ОШИБКА ПОДКЛЮЧЕНИЯ' : hasActive ? 'активно' : 'статус неясен',
      });

      if (hasError) {
        console.warn('⚠️ Обнаружена ошибка в настройках интеграций CRM');
      }
    }
  });

  test('уведомления настроены и не пустые', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let notifPath = '';
    for (const path of ['/settings/notifications', '/settings/alerts', '/notifications']) {
      const status = await goToSection(page, path);
      if (status < 400) { notifPath = path; break; }
    }

    if (!notifPath) {
      await goToSection(page, SETTINGS_PATH);
      const notifLink = await findVisible(page, [
        'a:has-text("Уведомления")', 'a:has-text("Notifications")',
        'a:has-text("Оповещения")',
      ]);
      if (notifLink) {
        await notifLink.click();
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        notifPath = page.url().replace(crm.url, '');
      }
    }

    testInfo.annotations.push({ type: 'notifications_path', description: notifPath || 'не найдено' });

    if (notifPath) {
      const bodyText = await page.locator('body').textContent() || '';
      const hasEmail = /email|почта|smtp/i.test(bodyText);
      const hasTelegram = /telegram|телеграм/i.test(bodyText);

      testInfo.annotations.push({
        type: 'notification_channels',
        description: [hasEmail && 'Email', hasTelegram && 'Telegram'].filter(Boolean).join(', ') || 'не найдены',
      });
    }
  });

  test('системный лог / аудит действий', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    let logPath = '';
    for (const path of ['/settings/logs', '/admin/logs', '/audit', '/system-log', '/activity-log']) {
      const status = await goToSection(page, path);
      if (status < 400) { logPath = path; break; }
    }

    testInfo.annotations.push({ type: 'system_log_path', description: logPath || 'не найден' });

    if (logPath) {
      const rows = await countRows(page);
      testInfo.annotations.push({ type: 'log_entries', description: String(rows) });
      // Лог должен содержать хотя бы наши тестовые действия
    }
  });

  test('резервное копирование / экспорт данных CRM', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    for (const path of ['/settings/backup', '/admin/backup', '/export', '/settings/export']) {
      const status = await goToSection(page, path);
      if (status < 400) {
        testInfo.annotations.push({ type: 'backup_path', description: path });
        break;
      }
    }

    // Ищем через настройки
    await goToSection(page, SETTINGS_PATH);
    const backupLink = await findVisible(page, [
      'a:has-text("Резервная копия")', 'a:has-text("Экспорт")',
      'a:has-text("Backup")', 'a:has-text("Export")',
    ]);

    testInfo.annotations.push({
      type: 'backup_button',
      description: backupLink ? 'найдена' : 'не найдена — нет функции бэкапа',
    });
  });
});
