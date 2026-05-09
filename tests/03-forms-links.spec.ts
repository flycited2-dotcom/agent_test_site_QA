import { test, expect } from '@playwright/test';
import { clickConsentIfPresent, fillLikelyForm, safeClick } from '../src/utils/qa-actions';

test.describe('Коммуникации: телефон, Telegram, email, формы', () => {
  test('tel/mailto/telegram ссылки имеют корректный формат', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const hrefs = await page.locator('a[href]').evaluateAll(nodes => nodes.map(a => (a as HTMLAnchorElement).href));
    const tel = hrefs.filter(h => h.startsWith('tel:'));
    const mail = hrefs.filter(h => h.startsWith('mailto:'));
    const tg = hrefs.filter(h => /t\.me|telegram/i.test(h));
    for (const h of tel) expect(h, `Телефонная ссылка: ${h}`).toMatch(/^tel:\+?\d|^tel:[\d\s()+-]+/);
    for (const h of mail) expect(h, `Email ссылка: ${h}`).toMatch(/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/);
    for (const h of tg) expect(h, `Telegram ссылка: ${h}`).toMatch(/t\.me|telegram/i);
  });

  test('потенциальные формы заявки заполняются тестовыми данными без падения страницы', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const formTriggers = page.locator('button:has-text("Заяв"), a:has-text("Заяв"), button:has-text("КП"), a:has-text("КП"), button:has-text("Обрат"), a:has-text("Обрат"), button:has-text("Консультац"), a:has-text("Консультац")');
    const count = Math.min(await formTriggers.count(), 5);
    for (let i = 0; i < count; i++) {
      await safeClick(formTriggers.nth(i), `форма/заявка ${i + 1}`);
      await fillLikelyForm(page);
      await clickConsentIfPresent(page);
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
