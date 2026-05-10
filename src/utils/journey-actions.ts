import { expect, Page, TestInfo } from '@playwright/test';
import { config } from './config';
import { clickConsentIfPresent, fillLikelyForm, getVisibleLinks, safeClick, saveArtifact, waitHuman } from './qa-actions';

export type JourneyEvent = {
  step: string;
  result: string;
};

const searchTerms = (process.env.QA_SEARCH_TERMS || 'кондиционер,товар,услуга')
  .split(',')
  .map(term => term.trim())
  .filter(Boolean);

export function isCommerceProfile(): boolean {
  return ['auto', 'catalog', 'shop'].includes(config.siteProfile);
}

export function isContentProfile(): boolean {
  return ['auto', 'landing', 'content'].includes(config.siteProfile);
}

export function stepLog(events: JourneyEvent[]): string {
  return events.map((event, index) => `${index + 1}. ${event.step}: ${event.result}`).join('\n');
}

export async function attachJourney(testInfo: TestInfo, events: JourneyEvent[]): Promise<void> {
  await saveArtifact(testInfo, 'journey-steps.txt', stepLog(events));
}

export async function assertUsablePage(page: Page, label: string): Promise<void> {
  await expect(page.locator('body'), `${label}: body должен быть видимым`).toBeVisible();
  const bodyText = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
  expect(bodyText.trim().length, `${label}: страница не должна быть пустой`).toBeGreaterThan(80);
  expect(bodyText, `${label}: страница не должна показывать явную серверную ошибку`).not.toMatch(/Internal Server Error|Application error|ошибка сервера|stack trace/i);
}

export async function openCatalogLikeEntry(page: Page, events: JourneyEvent[]): Promise<boolean> {
  const entry = page.locator([
    'a:has-text("Каталог")',
    'button:has-text("Каталог")',
    'a:has-text("Товары")',
    'button:has-text("Товары")',
    'a[href*="catalog"]',
    'a[href*="katalog"]',
    'a[href*="shop"]'
  ].join(',')).first();

  if (!(await entry.count())) {
    events.push({ step: 'Открыть каталог', result: 'вход в каталог не найден, продолжаем по ссылкам со страницы' });
    return false;
  }

  const href = await entry.getAttribute('href');
  if (href) {
    const response = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    events.push({ step: 'Открыть каталог', result: `${href} HTTP ${response?.status() ?? 'unknown'}` });
    expect(response?.status(), `Каталог должен открываться без HTTP-ошибки: ${href}`).toBeLessThan(400);
    await assertUsablePage(page, 'Каталог');
    return true;
  }

  const clicked = await safeClick(entry, 'вход в каталог');
  events.push({ step: 'Открыть каталог', result: clicked ? 'клик выполнен' : 'клик не выполнен' });
  if (clicked) await assertUsablePage(page, 'Каталог после клика');
  return clicked;
}

export async function runSearchIntent(page: Page, events: JourneyEvent[]): Promise<boolean> {
  const search = page.locator([
    'input[type=search]',
    'input[name*=search i]',
    'input[placeholder*=поиск i]',
    'input[placeholder*=найти i]',
    'input[aria-label*=поиск i]'
  ].join(',')).first();

  if (!(await search.count())) {
    events.push({ step: 'Поиск товара/услуги', result: 'поле поиска не найдено' });
    return false;
  }

  for (const term of searchTerms.slice(0, 2)) {
    await search.fill(term).catch(() => {});
    await search.press('Enter').catch(async () => {
      const button = page.locator('button[type=submit], button:has-text("Найти"), button:has-text("Поиск")').first();
      await safeClick(button, `поиск ${term}`);
    });
    await waitHuman();
    await assertUsablePage(page, `Результаты поиска: ${term}`);
    events.push({ step: `Поиск "${term}"`, result: page.url() });
    break;
  }

  return true;
}

export async function findCatalogCandidates(page: Page): Promise<string[]> {
  const baseHost = new URL(config.baseUrl).host;
  const links = await getVisibleLinks(page);
  return Array.from(new Set(links.filter(url => {
    try {
      const parsed = new URL(url);
      if (parsed.host !== baseHost) return false;
      if (/cart|checkout|login|register|admin|compare|favorite|privacy|policy/i.test(parsed.pathname)) return false;
      return /catalog|katalog|product|tovar|shop|goods|item|uslug|service|category/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }))).slice(0, Math.max(3, config.maxProductsSmoke));
}

export async function inspectCandidatePages(page: Page, urls: string[], events: JourneyEvent[]): Promise<void> {
  const failures: string[] = [];
  for (const url of urls.slice(0, 5)) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const status = response?.status() ?? 0;
      events.push({ step: 'Открыть кандидатную страницу', result: `${url} HTTP ${status}` });
      if (status >= 400) failures.push(`${url}: HTTP ${status}`);
      await assertUsablePage(page, url);
    } catch (error) {
      failures.push(`${url}: ${(error as Error).message}`);
    }
  }

  expect(failures, `Проблемы при обходе пользовательского пути:\n${failures.join('\n')}\n\nШаги:\n${stepLog(events)}`).toHaveLength(0);
}

export async function tryPrimaryConversion(page: Page, events: JourneyEvent[]): Promise<boolean> {
  const conversion = page.locator([
    'button:has-text("В корзину")',
    'a:has-text("В корзину")',
    'button:has-text("Купить")',
    'a:has-text("Купить")',
    'button:has-text("Заказать")',
    'a:has-text("Заказать")',
    'button:has-text("Заяв")',
    'a:has-text("Заяв")',
    'button:has-text("Консультац")',
    'a:has-text("Консультац")',
    'button:has-text("Оформ")',
    'a:has-text("Оформ")',
    '[data-testid*=cart i]',
    '[data-testid*=checkout i]'
  ].join(',')).first();

  const clicked = await safeClick(conversion, 'основное целевое действие');
  events.push({ step: 'Основное целевое действие', result: clicked ? 'кнопка найдена и нажата' : 'кнопка не найдена' });
  if (!clicked) return false;

  await fillLikelyForm(page);
  await clickConsentIfPresent(page);
  await assertUsablePage(page, 'После целевого действия');
  return true;
}

export async function collectContactSignals(page: Page): Promise<string[]> {
  const hrefs = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href));
  const text = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
  const signals: string[] = [];
  if (hrefs.some(href => href.startsWith('tel:'))) signals.push('tel');
  if (hrefs.some(href => href.startsWith('mailto:'))) signals.push('mailto');
  if (hrefs.some(href => /t\.me|telegram|wa\.me|whatsapp/i.test(href))) signals.push('messenger');
  if (/[+]\d[\d\s().-]{7,}/.test(text)) signals.push('phone-text');
  if (/[@][a-z0-9.-]+\.[a-z]{2,}/i.test(text)) signals.push('email-text');
  return signals;
}
