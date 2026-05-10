import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { config } from '../src/utils/config';
import { getVisibleLinks } from '../src/utils/qa-actions';

test.describe('Full catalog: обход категорий и карточек', () => {
  test.skip(['landing', 'content'].includes(config.siteProfile), 'Полный обход каталога запускается только для auto/catalog/shop профилей');

  test('полный обход найденных карточек товаров', async ({ page }, testInfo) => {
    test.setTimeout(20 * 60 * 1000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    let candidateUrls: string[] = [];
    if (fs.existsSync('storage/discovered-urls.json')) {
      candidateUrls = JSON.parse(fs.readFileSync('storage/discovered-urls.json', 'utf8'));
    } else {
      candidateUrls = await getVisibleLinks(page);
    }
    const baseHost = new URL(config.baseUrl).host;
    const productUrls = Array.from(new Set(candidateUrls.filter(url => {
      try {
        const u = new URL(url);
        return u.host === baseHost && /catalog|katalog|product|tovar|shop|goods|item/i.test(u.pathname) && !/cart|checkout|login|admin/i.test(u.pathname);
      } catch { return false; }
    }))).slice(0, config.maxProductsFull);

    const checked: string[] = [];
    const failures: string[] = [];
    for (const url of productUrls) {
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        if (!res || res.status() >= 400) failures.push(`${url} — HTTP ${res?.status()}`);
        await expect(page.locator('body')).toBeVisible();
        const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
        if (bodyText.length < 100) failures.push(`${url} — подозрительно мало текста на странице`);
        checked.push(url);
      } catch (e: any) {
        failures.push(`${url} — ${e.message}`);
      }
    }

    expect(productUrls.length, 'Должна быть найдена хотя бы одна потенциальная страница каталога/товара').toBeGreaterThan(0);
    await testInfo.attach('checked-urls.txt', { body: checked.join('\n'), contentType: 'text/plain' });
    await testInfo.attach('failures.txt', { body: failures.join('\n'), contentType: 'text/plain' });
    expect(failures, `Ошибки обхода:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
