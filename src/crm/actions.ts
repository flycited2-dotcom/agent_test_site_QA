import { type Page, type Locator } from '@playwright/test';
import { crm } from './config.js';

export interface LeadData {
  name: string;
  phone: string;
  email: string;
  comment: string;
  source?: string;
}

export interface ClientData {
  name: string;
  company: string;
  phone: string;
  email: string;
}

export interface TaskData {
  title: string;
  description?: string;
  deadline?: string;
}

export interface CrmIssue {
  section: string;
  test: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  url: string;
}

export async function pause(ms = crm.delay): Promise<void> {
  await new Promise(r => setTimeout(r, ms));
}

export async function findVisible(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 1500 })) return el;
    } catch { /* skip */ }
  }
  return null;
}

// Navigate to a CRM section and return HTTP status
export async function goToSection(page: Page, path: string): Promise<number> {
  const url = crm.url + path;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: crm.timeout });
  return res?.status() ?? 0;
}

// Find and click the "create/add" button in the current section
export async function clickCreateButton(page: Page): Promise<boolean> {
  const btn = await findVisible(page, [
    '[data-testid="create-btn"]', '[data-testid="add-btn"]',
    'a:has-text("Добавить")', 'button:has-text("Добавить")',
    'a:has-text("Создать")', 'button:has-text("Создать")',
    'a:has-text("Новый")', 'button:has-text("Новый")',
    'a:has-text("Новая")', 'button:has-text("Новая")',
    'button:has-text("+ ")', 'a:has-text("+ ")',
    'a[href*="/new"]', 'a[href*="/create"]', 'a[href*="/add"]',
  ]);
  if (!btn) return false;
  await btn.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await pause();
  return true;
}

// Try to fill a form field by multiple selector strategies
async function tryFillField(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 1000 })) {
        await el.clear();
        await el.fill(value);
        await pause(200);
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}

export async function fillLeadForm(page: Page, data: LeadData): Promise<{ filled: string[]; missing: string[] }> {
  const results = { filled: [] as string[], missing: [] as string[] };

  const fields: [string, string[], string][] = [
    ['name', [
      'input[name="name"]', 'input[name="full_name"]', 'input[name="fio"]',
      'input[placeholder*="имя" i]', 'input[placeholder*="ФИО" i]',
      'input[placeholder*="name" i]', 'input[placeholder*="контакт" i]',
    ], data.name],
    ['phone', [
      'input[name="phone"]', 'input[type="tel"]',
      'input[placeholder*="телефон" i]', 'input[placeholder*="phone" i]',
      'input[placeholder*="+7" i]',
    ], data.phone],
    ['email', [
      'input[name="email"]', 'input[type="email"]',
      'input[placeholder*="email" i]', 'input[placeholder*="почта" i]',
    ], data.email],
    ['comment', [
      'textarea[name="comment"]', 'textarea[name="note"]', 'textarea[name="description"]',
      'textarea[placeholder*="комментарий" i]', 'textarea[placeholder*="заметка" i]',
      'textarea[placeholder*="описание" i]', 'textarea',
    ], data.comment],
  ];

  for (const [fieldName, selectors, value] of fields) {
    if (await tryFillField(page, selectors, value)) {
      results.filled.push(fieldName);
    } else {
      results.missing.push(fieldName);
    }
  }

  return results;
}

export async function fillClientForm(page: Page, data: ClientData): Promise<{ filled: string[]; missing: string[] }> {
  const results = { filled: [] as string[], missing: [] as string[] };

  const fields: [string, string[], string][] = [
    ['name', [
      'input[name="name"]', 'input[name="contact_name"]',
      'input[placeholder*="контакт" i]', 'input[placeholder*="имя" i]',
    ], data.name],
    ['company', [
      'input[name="company"]', 'input[name="company_name"]', 'input[name="organization"]',
      'input[placeholder*="компани" i]', 'input[placeholder*="организаци" i]',
    ], data.company],
    ['phone', [
      'input[name="phone"]', 'input[type="tel"]',
      'input[placeholder*="телефон" i]',
    ], data.phone],
    ['email', [
      'input[name="email"]', 'input[type="email"]',
      'input[placeholder*="email" i]',
    ], data.email],
  ];

  for (const [fieldName, selectors, value] of fields) {
    if (await tryFillField(page, selectors, value)) {
      results.filled.push(fieldName);
    } else {
      results.missing.push(fieldName);
    }
  }

  return results;
}

export async function fillTaskForm(page: Page, data: TaskData): Promise<{ filled: string[]; missing: string[] }> {
  const results = { filled: [] as string[], missing: [] as string[] };

  const fields: [string, string[], string][] = [
    ['title', [
      'input[name="title"]', 'input[name="name"]', 'input[name="subject"]',
      'input[placeholder*="задача" i]', 'input[placeholder*="тема" i]',
      'input[placeholder*="название" i]',
    ], data.title],
    ['description', [
      'textarea[name="description"]', 'textarea[name="comment"]', 'textarea[name="note"]',
      'textarea[placeholder*="описание" i]', 'textarea[placeholder*="комментарий" i]',
    ], data.description || crm.testComment],
  ];

  for (const [fieldName, selectors, value] of fields) {
    if (await tryFillField(page, selectors, value)) {
      results.filled.push(fieldName);
    } else {
      results.missing.push(fieldName);
    }
  }

  // Deadline field (date input)
  if (data.deadline) {
    const dateField = page.locator('input[type="date"], input[name*="deadline" i], input[name*="due" i]').first();
    if (await dateField.count() > 0) {
      await dateField.fill(data.deadline);
      results.filled.push('deadline');
    } else {
      results.missing.push('deadline');
    }
  }

  return results;
}

export async function submitForm(page: Page): Promise<boolean> {
  const btn = await findVisible(page, [
    'button[type="submit"]', 'input[type="submit"]',
    'button:has-text("Сохранить")', 'button:has-text("Создать")',
    'button:has-text("Добавить")', 'button:has-text("Отправить")',
    'button:has-text("Save")', 'button:has-text("Submit")',
    'button:has-text("Готово")', 'button:has-text("Применить")',
  ]);
  if (!btn) return false;
  await btn.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await pause();
  return true;
}

export async function hasSuccessFeedback(page: Page): Promise<boolean> {
  const signals = [
    '.alert-success', '.flash-success', '.toast-success',
    '[class*="success"]', '[class*="Success"]',
    'text=успешно', 'text=создан', 'text=сохранён', 'text=сохранено',
    'text=создано', 'text=добавлен', 'text=добавлено',
  ];
  for (const sel of signals) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) return true;
    } catch { /* skip */ }
  }
  return false;
}

export async function hasErrorFeedback(page: Page): Promise<string> {
  const selectors = [
    '.alert-danger', '.alert-error', '.flash-error',
    '[class*="error"]', '[class*="Error"]', '[class*="invalid"]',
    '.field-error', '.form-error',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        const text = await el.textContent().catch(() => '');
        return text?.trim() || 'ошибка (текст не прочитан)';
      }
    } catch { /* skip */ }
  }
  return '';
}

export async function searchInList(page: Page, query: string): Promise<void> {
  const searchInput = await findVisible(page, [
    'input[type="search"]', 'input[name="search"]', 'input[name="q"]',
    'input[placeholder*="поиск" i]', 'input[placeholder*="search" i]',
    'input[placeholder*="найти" i]', 'input[placeholder*="фильтр" i]',
  ]);
  if (!searchInput) return;
  await searchInput.fill(query);
  await pause(800);
  await page.keyboard.press('Enter').catch(() => {});
  await pause(500);
}

export async function countRows(page: Page): Promise<number> {
  const candidates = [
    'table tbody tr:not(.hidden)',
    '[class*="list-item"]', '[class*="lead-row"]',
    '[class*="lead-item"]', '[class*="client-row"]',
    '[class*="record"]', '[data-testid*="row"]',
  ];
  for (const sel of candidates) {
    const n = await page.locator(sel).count();
    if (n > 0) return n;
  }
  return 0;
}

export async function findRowByText(page: Page, text: string): Promise<Locator | null> {
  try {
    const el = page.locator(`text=${text}`).first();
    if (await el.count() > 0) return el;
  } catch { /* skip */ }
  return null;
}

export async function getAvailableStatuses(page: Page): Promise<string[]> {
  const nativeSelect = page.locator('select[name*="status" i]').first();
  if (await nativeSelect.count() > 0) {
    return nativeSelect.locator('option').allTextContents();
  }
  return [];
}

export async function changeStatusTo(page: Page, value: string): Promise<boolean> {
  const nativeSelect = page.locator('select[name*="status" i]').first();
  if (await nativeSelect.count() > 0) {
    await nativeSelect.selectOption(value).catch(async () => {
      await nativeSelect.selectOption({ label: value });
    });
    return true;
  }

  // Try custom dropdown
  const dropdown = await findVisible(page, [
    '[data-testid*="status"]', '[class*="status-select"]',
    'button:has-text("Статус")', '[class*="status-dropdown"]',
  ]);
  if (!dropdown) return false;
  await dropdown.click();
  await pause(500);
  const option = page.locator(`text=${value}`).first();
  if (await option.count() > 0) {
    await option.click();
    return true;
  }
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}
