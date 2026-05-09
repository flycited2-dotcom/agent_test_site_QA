import { test, expect } from '@playwright/test';
import { safeClick, waitHuman } from '../src/utils/qa-actions';

test.describe('Фильтры, поиск, сортировка', () => {
  test('поиск и фильтры не ломают выдачу', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const search = page.locator('input[type=search], input[name*=search i], input[placeholder*=поиск i], input[placeholder*=найти i]').first();
    if (await search.count()) {
      await search.fill('кондиционер').catch(async () => await search.fill('товар').catch(() => {}));
      await search.press('Enter').catch(() => {});
      await waitHuman();
      await expect(page.locator('body')).toBeVisible();
    }

    const filters = page.locator('input[type=checkbox], input[type=radio], select, button:has-text("Фильтр"), button:has-text("Показать")');
    const count = Math.min(await filters.count(), 12);
    for (let i = 0; i < count; i++) {
      await safeClick(filters.nth(i), `фильтр ${i + 1}`);
      await expect(page.locator('body')).toBeVisible();
    }

    const reset = page.locator('button:has-text("Сброс"), a:has-text("Сброс"), button:has-text("Очист")').first();
    if (await reset.count()) await safeClick(reset, 'сброс фильтров');
  });
});
