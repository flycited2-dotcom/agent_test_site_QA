import { test, expect } from '@playwright/test';
import { clickConsentIfPresent, fillLikelyForm, findProductLinks, safeClick, waitHuman } from '../src/utils/qa-actions';
import { config } from '../src/utils/config';

test.describe('Critical path: каталог → карточка → корзина → оформление', () => {
  test.skip(['landing', 'content'].includes(config.siteProfile), 'Коммерческий путь запускается только для auto/catalog/shop профилей');

  test('агент находит товар и пытается пройти путь клиента до безопасного финального шага', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const catalogEntry = page.locator('a:has-text("Каталог"), a[href*="catalog"], a[href*="katalog"], a[href*="shop"]').first();
    if (await catalogEntry.count()) {
      const href = await catalogEntry.getAttribute('href');
      if (href) {
        const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), `Каталог должен открываться без HTTP-ошибки: ${href}`).toBeLessThan(400);
      } else {
        await safeClick(catalogEntry, 'переход в каталог');
      }
      await page.waitForLoadState('domcontentloaded');
    }

    let productLinks = await findProductLinks(page);
    if (productLinks.length === 0) {
      const links = await page.locator('a[href]').evaluateAll(nodes => Array.from(new Set(nodes.map(a => (a as HTMLAnchorElement).href))));
      productLinks = links.filter(u => /product|tovar|catalog|shop|goods|item/i.test(u)).slice(0, config.maxProductsSmoke);
    }
    expect(productLinks.length, 'Должна быть найдена хотя бы одна потенциальная карточка товара').toBeGreaterThan(0);

    await page.goto(productLinks[0], { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();

    const addToCart = page.locator([
      'button:has-text("В корзину")', 'a:has-text("В корзину")',
      'button:has-text("Купить")', 'a:has-text("Купить")',
      '[data-testid="add-to-cart"]'
    ].join(','));
    const clicked = await safeClick(addToCart, 'добавить товар в корзину');
    testInfo.annotations.push({ type: 'add_to_cart_clicked', description: String(clicked) });
    expect(clicked, 'На карточке товара должна быть рабочая кнопка добавления/покупки').toBeTruthy();

    const cart = page.locator('a:has-text("Корзина"), a[href*="cart"], a[href*="basket"], [data-testid="cart-button"]').first();
    if (await cart.count()) await cart.click();
    await waitHuman();

    const checkout = page.locator('button:has-text("Оформ"), a:has-text("Оформ"), button:has-text("Заказ"), a:has-text("checkout"), [data-testid="checkout-button"]').first();
    if (await checkout.count()) await checkout.click();
    await waitHuman();

    await fillLikelyForm(page);
    await clickConsentIfPresent(page);

    const submit = page.locator('button[type=submit], input[type=submit], button:has-text("Отправ"), button:has-text("Оформ")').first();
    expect(await submit.count(), 'На финальном шаге должна быть кнопка отправки/оформления').toBeGreaterThan(0);
  });
});
