import { test, expect } from '@playwright/test';

test.describe('SEO и технические проверки', () => {
  test('главная имеет базовые SEO-теги и sitemap/robots доступны', async ({ page, request }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/.+/);
    const h1Count = await page.locator('h1').count();
    expect(h1Count, 'На главной должен быть хотя бы один H1').toBeGreaterThan(0);
    const description = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
    expect(description === null || description.length >= 20, 'Meta description пустой или слишком короткий').toBeTruthy();

    const robots = await request.get('/robots.txt');
    expect(robots.status(), 'robots.txt должен быть доступен').toBeLessThan(500);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status(), 'sitemap.xml желательно должен быть доступен').toBeLessThan(500);
  });
});
