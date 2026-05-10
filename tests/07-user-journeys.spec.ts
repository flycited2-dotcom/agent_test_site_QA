import { test, expect } from '@playwright/test';
import { config } from '../src/utils/config';
import {
  assertUsablePage,
  attachJourney,
  collectContactSignals,
  findCatalogCandidates,
  inspectCandidatePages,
  isCommerceProfile,
  isContentProfile,
  openCatalogLikeEntry,
  runSearchIntent,
  tryPrimaryConversion,
  type JourneyEvent
} from '../src/utils/journey-actions';

test.describe('Пользовательские сценарии по профилям сайта', () => {
  test('покупательский путь: поиск, каталог, карточка, целевое действие', async ({ page }, testInfo) => {
    test.skip(!isCommerceProfile(), `Профиль ${config.siteProfile} не требует покупательского пути`);
    test.setTimeout(4 * 60 * 1000);

    const events: JourneyEvent[] = [];
    const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    events.push({ step: 'Открыть главную', result: `HTTP ${response?.status() ?? 'unknown'}` });
    expect(response?.status(), 'Главная должна открываться без HTTP-ошибки').toBeLessThan(400);
    await assertUsablePage(page, 'Главная');

    await openCatalogLikeEntry(page, events);
    await runSearchIntent(page, events);

    const candidates = await findCatalogCandidates(page);
    events.push({ step: 'Найти кандидатные страницы товара/каталога', result: `${candidates.length}` });
    expect(candidates.length, `Покупатель должен найти хотя бы одну страницу товара/категории.\n\nШаги:\n${events.map(e => `${e.step}: ${e.result}`).join('\n')}`).toBeGreaterThan(0);

    await inspectCandidatePages(page, candidates, events);
    const converted = await tryPrimaryConversion(page, events);
    if (config.siteProfile === 'shop') {
      expect(converted, `Для профиля shop нужна кнопка покупки/корзины/заказа.\n\nШаги:\n${events.map(e => `${e.step}: ${e.result}`).join('\n')}`).toBeTruthy();
    }

    await attachJourney(testInfo, events);
  });

  test('лендинг/контент: CTA, форма, контакты и якорная навигация', async ({ page }, testInfo) => {
    test.skip(!isContentProfile(), `Профиль ${config.siteProfile} не требует контентного сценария`);
    const events: JourneyEvent[] = [];

    const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    events.push({ step: 'Открыть главную', result: `HTTP ${response?.status() ?? 'unknown'}` });
    expect(response?.status(), 'Главная должна открываться без HTTP-ошибки').toBeLessThan(400);
    await assertUsablePage(page, 'Главная');

    const cta = page.locator([
      'a:has-text("Заказать")',
      'button:has-text("Заказать")',
      'a:has-text("Заяв")',
      'button:has-text("Заяв")',
      'a:has-text("Консультац")',
      'button:has-text("Консультац")',
      'a:has-text("Связ")',
      'button:has-text("Связ")',
      'a[href^="#"]'
    ].join(','));
    const ctaCount = await cta.count();
    events.push({ step: 'Найти CTA/якоря', result: `${ctaCount}` });
    expect(ctaCount, `На лендинге/контентном сайте должны быть CTA, контакты или якорная навигация.\n\nШаги:\n${events.map(e => `${e.step}: ${e.result}`).join('\n')}`).toBeGreaterThan(0);

    const clickCount = Math.min(ctaCount, 3);
    for (let index = 0; index < clickCount; index++) {
      await cta.nth(index).click({ timeout: 8000 }).catch(() => {});
      await assertUsablePage(page, `После CTA ${index + 1}`);
      events.push({ step: `Нажать CTA ${index + 1}`, result: page.url() });
    }

    const converted = await tryPrimaryConversion(page, events);
    const contacts = await collectContactSignals(page);
    events.push({ step: 'Найти контакты', result: contacts.join(', ') || 'не найдены' });

    expect(converted || contacts.length > 0, `Должна быть рабочая форма/CTA или явные контакты.\n\nШаги:\n${events.map(e => `${e.step}: ${e.result}`).join('\n')}`).toBeTruthy();
    await attachJourney(testInfo, events);
  });
});
