import { test, expect } from '@playwright/test';
import { assertNoCriticalErrors, collectPageErrors, getVisibleLinks } from '../src/utils/qa-actions';

test.describe('Smoke: доступность сайта и базовая навигация', () => {
  test('главная страница открывается без критических ошибок', async ({ page }) => {
    const errors = await collectPageErrors(page);
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status(), 'Главная должна отвечать 2xx/3xx').toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/.+/);
    await assertNoCriticalErrors(errors);
  });

  test('на главной есть рабочие внутренние ссылки', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const links = await getVisibleLinks(page);
    expect(links.length, 'На главной должны быть ссылки').toBeGreaterThan(5);
    const internal = links.filter(l => new URL(l).host === new URL(page.url()).host).slice(0, 10);
    const failures: string[] = [];
    for (const url of internal) {
      try {
        const res = await page.request.get(url, { timeout: 15000 });
        if (res.status() >= 400) failures.push(`${url} — HTTP ${res.status()}`);
      } catch (error) {
        failures.push(`${url} — ${(error as Error).message}`);
      }
    }
    expect(failures, `Проблемные внутренние ссылки:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
