import { expect, Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import { config } from './config';
import { clickConsentIfPresent, fillLikelyForm, getVisibleLinks, safeClick, saveArtifact, waitHuman } from './qa-actions';

export type DeepFinding = {
  area: string;
  url: string;
  message: string;
};

export type DeepStep = {
  action: string;
  detail: string;
};

const enterpriseMode = config.qaMode === 'enterprise' || config.testDepth === 'enterprise';
const productLimit = Number(process.env.MAX_DEEP_PRODUCT_URLS || Math.min(config.maxProductsFull, enterpriseMode ? 1200 : 80));
const catalogLimit = Number(process.env.MAX_DEEP_CATALOG_URLS || Math.min(config.maxCategoryPages, enterpriseMode ? 350 : 40));
const auditBudgetMs = Number(process.env.DEEP_AUDIT_BUDGET_MS || (enterpriseMode ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000));
const auditStartedAt = Date.now();
const searchTerms = (process.env.QA_SEARCH_TERMS || 'кондиционер,товар,услуга')
  .split(',')
  .map(term => term.trim())
  .filter(Boolean);

export function isDeepCommerceProfile(): boolean {
  return ['auto', 'catalog', 'shop'].includes(config.siteProfile);
}

export function formatFindings(findings: DeepFinding[]): string {
  return findings.map((finding, index) => `${index + 1}. [${finding.area}] ${finding.url}\n${finding.message}`).join('\n\n');
}

export async function attachDeepAudit(testInfo: TestInfo, steps: DeepStep[], findings: DeepFinding[]): Promise<void> {
  await saveArtifact(testInfo, 'deep-catalog-steps.txt', steps.map((step, index) => `${index + 1}. ${step.action}: ${step.detail}`).join('\n'));
  await saveArtifact(testInfo, 'deep-catalog-findings.txt', findings.length ? formatFindings(findings) : 'Проблем не найдено.');
}

function hasBudget(): boolean {
  return Date.now() - auditStartedAt < auditBudgetMs;
}

function stopIfBudgetExceeded(steps: DeepStep[]): boolean {
  if (hasBudget()) return false;
  steps.push({ action: 'Остановить глубокий аудит', detail: `исчерпан лимит ${auditBudgetMs}ms` });
  return true;
}

function sameHost(url: string): boolean {
  try {
    return new URL(url).host === new URL(config.baseUrl).host;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url, config.baseUrl);
  parsed.hash = '';
  return parsed.toString();
}

function looksCatalog(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return /catalog|katalog|category|shop|goods|products|tovary|uslugi/i.test(path) && !looksUnsafe(url);
  } catch {
    return false;
  }
}

function looksProduct(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    if (looksUnsafe(url)) return false;
    return /product|tovar|item|goods|catalog\/.+-|shop\/.+-|\/[a-z0-9-]+-\d+/i.test(path);
  } catch {
    return false;
  }
}

function looksUnsafe(url: string): boolean {
  return /cart|checkout|login|register|admin|logout|compare|favorite|privacy|policy|agreement/i.test(new URL(url, config.baseUrl).pathname);
}

export async function discoverCommerceUrls(page: Page, steps: DeepStep[]): Promise<{ catalogUrls: string[]; productUrls: string[] }> {
  const discovered = new Set<string>();
  if (fs.existsSync('storage/discovered-urls.json')) {
    for (const url of JSON.parse(fs.readFileSync('storage/discovered-urls.json', 'utf8')) as string[]) {
      if (sameHost(url)) discovered.add(normalizeUrl(url));
    }
  }

  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (const url of await getVisibleLinks(page)) {
    if (sameHost(url)) discovered.add(normalizeUrl(url));
  }

  const catalogUrls = Array.from(discovered).filter(looksCatalog).slice(0, catalogLimit);
  const productUrls = Array.from(discovered).filter(looksProduct).slice(0, productLimit);
  steps.push({ action: 'Собрать URL каталога', detail: `категории=${catalogUrls.length}, карточки=${productUrls.length}` });
  return { catalogUrls, productUrls };
}

async function visibleText(page: Page): Promise<string> {
  return page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
}

async function assertPageHealth(page: Page, url: string, findings: DeepFinding[], area: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  const status = response?.status() ?? 0;
  if (!response || status >= 400) findings.push({ area, url, message: `HTTP ${status || 'unknown'}` });
  await expect(page.locator('body'), `${area}: body должен быть видимым`).toBeVisible();
  const text = await visibleText(page);
  if (text.trim().length < 100) findings.push({ area, url, message: 'Слишком мало контента на странице.' });
  if (/Internal Server Error|Application error|ошибка сервера|stack trace|not found|404/i.test(text)) {
    findings.push({ area, url, message: 'На странице виден текст серверной ошибки/404.' });
  }
}

export async function auditCatalogNavigation(page: Page, catalogUrls: string[], steps: DeepStep[], findings: DeepFinding[]): Promise<void> {
  for (const url of catalogUrls) {
    if (stopIfBudgetExceeded(steps)) break;
    try {
      await assertPageHealth(page, url, findings, 'catalog-navigation');
      steps.push({ action: 'Открыть категорию', detail: url });

      const nested = (await getVisibleLinks(page)).filter(link => sameHost(link) && looksCatalog(link)).slice(0, enterpriseMode ? 12 : 5);
      for (const nestedUrl of nested) {
        if (stopIfBudgetExceeded(steps)) break;
        await assertPageHealth(page, normalizeUrl(nestedUrl), findings, 'catalog-nested');
        steps.push({ action: 'Переход глубже/выше в каталоге', detail: normalizeUrl(nestedUrl) });
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      }
    } catch (error) {
      findings.push({ area: 'catalog-navigation', url, message: (error as Error).message });
    }
  }
}

export async function auditFiltersAndSorting(page: Page, catalogUrls: string[], steps: DeepStep[], findings: DeepFinding[]): Promise<void> {
  for (const url of catalogUrls.slice(0, enterpriseMode ? 60 : 8)) {
    if (stopIfBudgetExceeded(steps)) break;
    try {
      await assertPageHealth(page, url, findings, 'filters');
      const before = await visibleText(page);

      const search = page.locator('input[type=search], input[name*=search i], input[placeholder*=поиск i], input[placeholder*=найти i]').first();
      if (await search.count()) {
        for (const term of searchTerms.slice(0, enterpriseMode ? 8 : 3)) {
          if (stopIfBudgetExceeded(steps)) break;
          await search.fill(term).catch(() => {});
          await search.press('Enter').catch(() => {});
          await waitHuman();
          const after = await visibleText(page);
          steps.push({ action: 'Поиск по названию/модели', detail: `${url} :: ${term}` });
          if (after.trim().length < 80) findings.push({ area: 'search', url, message: `После поиска "${term}" выдача пустая или сломана.` });
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        }
      }

      const controls = page.locator('input[type=checkbox], input[type=radio], select, button:has-text("Фильтр"), button:has-text("Показать"), button:has-text("Цена"), button:has-text("Бренд")');
      const controlCount = Math.min(await controls.count(), enterpriseMode ? 30 : 10);
      for (let index = 0; index < controlCount; index++) {
        if (stopIfBudgetExceeded(steps)) break;
        await safeClick(controls.nth(index), `фильтр ${index + 1}`);
        const after = await visibleText(page);
        steps.push({ action: 'Применить фильтр', detail: `${url} :: control ${index + 1}` });
        if (after.trim().length < 80) findings.push({ area: 'filters', url, message: `После фильтра ${index + 1} страница выглядит пустой.` });
      }

      const sortControls = page.locator('select, button:has-text("Сорт"), a:has-text("дешев"), a:has-text("дорог"), a:has-text("цен"), a:has-text("назван")');
      const sortCount = Math.min(await sortControls.count(), enterpriseMode ? 18 : 6);
      for (let index = 0; index < sortCount; index++) {
        if (stopIfBudgetExceeded(steps)) break;
        await safeClick(sortControls.nth(index), `сортировка ${index + 1}`);
        await waitHuman();
        const after = await visibleText(page);
        steps.push({ action: 'Сортировка цены/названия', detail: `${url} :: sort ${index + 1}` });
        if (after === before) findings.push({ area: 'sorting', url, message: `Сортировка ${index + 1} визуально не изменила выдачу.` });
      }

      const reset = page.locator('button:has-text("Сброс"), a:has-text("Сброс"), button:has-text("Очист"), a:has-text("Очист")').first();
      if (await reset.count()) {
        await safeClick(reset, 'сброс фильтров');
        steps.push({ action: 'Сбросить фильтры', detail: url });
      }
    } catch (error) {
      findings.push({ area: 'filters-sorting', url, message: (error as Error).message });
    }
  }
}

export async function auditProductCards(page: Page, productUrls: string[], steps: DeepStep[], findings: DeepFinding[]): Promise<void> {
  for (const url of productUrls) {
    if (stopIfBudgetExceeded(steps)) break;
    try {
      await assertPageHealth(page, url, findings, 'product-card');
      const text = await visibleText(page);
      steps.push({ action: 'Открыть карточку товара', detail: url });

      if (!/₽|руб|цена|стоим|price/i.test(text)) findings.push({ area: 'product-card', url, message: 'Не найдена цена или явный текст стоимости.' });
      if (!/описан|характерист|налич|достав|артикул|модель|бренд|заказ|купить/i.test(text)) {
        findings.push({ area: 'product-card', url, message: 'Карточка выглядит неполной: нет описания/характеристик/наличия/доставки.' });
      }

      const qty = page.locator('input[type=number], input[name*=qty i], input[name*=quantity i], button:has-text("+")').first();
      if (await qty.count()) {
        if ((await qty.evaluate(node => node.tagName).catch(() => '')) === 'INPUT') {
          await qty.fill('2').catch(() => {});
        } else {
          await safeClick(qty, 'увеличить количество');
        }
        steps.push({ action: 'Изменить количество', detail: url });
      }

      const add = page.locator('button:has-text("В корзину"), a:has-text("В корзину"), button:has-text("Купить"), a:has-text("Купить"), button:has-text("Заказать"), a:has-text("Заказать")').first();
      if (await add.count()) {
        await safeClick(add, 'добавить/заказать товар');
        await fillLikelyForm(page);
        await clickConsentIfPresent(page);
        steps.push({ action: 'Добавить/заказать товар', detail: url });
        await expect(page.locator('body')).toBeVisible();
      } else {
        findings.push({ area: 'product-card', url, message: 'Не найдена кнопка покупки/заказа/добавления.' });
      }
    } catch (error) {
      findings.push({ area: 'product-card', url, message: (error as Error).message });
    }
  }
}

export async function auditContactActions(page: Page, steps: DeepStep[], findings: DeepFinding[]): Promise<void> {
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const hrefs = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href));
  const contactLinks = hrefs.filter(href => /^(tel|sms|mailto):|t\.me|telegram|wa\.me|whatsapp/i.test(href));
  steps.push({ action: 'Проверить звонок/SMS/email/мессенджер', detail: `${contactLinks.length} ссылок` });
  if (!contactLinks.length) findings.push({ area: 'contacts', url: config.baseUrl, message: 'Не найдены кликабельные tel/sms/mailto/мессенджер ссылки.' });

  for (const href of contactLinks) {
    if (href.startsWith('tel:') && !/^tel:\+?[\d\s()+-]{5,}/.test(href)) findings.push({ area: 'contacts', url: config.baseUrl, message: `Некорректная телефонная ссылка: ${href}` });
    if (href.startsWith('sms:') && !/^sms:\+?[\d\s()+-]{5,}/.test(href)) findings.push({ area: 'contacts', url: config.baseUrl, message: `Некорректная SMS ссылка: ${href}` });
    if (href.startsWith('mailto:') && !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/.test(href)) findings.push({ area: 'contacts', url: config.baseUrl, message: `Некорректная email ссылка: ${href}` });
  }
}
