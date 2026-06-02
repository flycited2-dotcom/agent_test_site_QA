import * as dotenv from 'dotenv';
dotenv.config();

function env(key: string, fallback = ''): string {
  return process.env[key] || fallback;
}

export const crm = {
  // CRM server
  url:           env('CRM_BASE_URL').replace(/\/$/, ''),
  loginPath:     env('CRM_LOGIN_PATH', '/login'),
  dashPath:      env('CRM_DASHBOARD_PATH', '/'),
  leadsPath:     env('CRM_LEADS_PATH', '/leads'),
  clientsPath:   env('CRM_CLIENTS_PATH', '/clients'),
  tasksPath:     env('CRM_TASKS_PATH', '/tasks'),

  // Credentials
  adminEmail:    env('CRM_ADMIN_EMAIL'),
  adminPass:     env('CRM_ADMIN_PASSWORD'),
  managerEmail:  env('CRM_MANAGER_EMAIL') || env('CRM_ADMIN_EMAIL'),
  managerPass:   env('CRM_MANAGER_PASSWORD') || env('CRM_ADMIN_PASSWORD'),

  // Test data — all QA entries start with this prefix for easy cleanup
  prefix:        '[QA]',
  testName:      `[QA] ${env('QA_TEST_NAME', 'Тест Тестовый')}`,
  testPhone:     env('QA_TEST_PHONE', '+79990000000'),
  testEmail:     env('QA_TEST_EMAIL', 'qa@example.com'),
  testComment:   env('QA_TEST_COMMENT', 'Автоматический тест QA Agent. Не обрабатывать.'),
  testCompany:   '[QA] Тестовая компания',

  // Timing
  timeout:       +(env('CRM_TIMEOUT_MS', '20000')),
  delay:         +(env('ACTION_DELAY_MS', '600')),

  // Website URL for integration tests (form → CRM)
  siteUrl:       env('BASE_URL', ''),
};
