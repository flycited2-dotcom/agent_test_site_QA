import { test, expect } from '@playwright/test';
import {
  attachDeepAudit,
  auditCatalogNavigation,
  auditContactActions,
  auditFiltersAndSorting,
  auditProductCards,
  discoverCommerceUrls,
  formatFindings,
  isDeepCommerceProfile,
  type DeepFinding,
  type DeepStep
} from '../src/utils/deep-catalog-actions';
import { config } from '../src/utils/config';

test.describe('Deep commerce audit: каталог, фильтры, сортировки, карточки, заявки', () => {
  test.skip(!isDeepCommerceProfile(), `Профиль ${config.siteProfile} не требует глубокого commerce-аудита`);

  test('дотошно обходит ассортимент и ключевые действия покупателя', async ({ page }, testInfo) => {
    test.setTimeout(Number(process.env.DEEP_AUDIT_BUDGET_MS || 30 * 60 * 1000) + 2 * 60 * 1000);

    const steps: DeepStep[] = [];
    const findings: DeepFinding[] = [];
    const { catalogUrls, productUrls } = await discoverCommerceUrls(page, steps);

    expect(catalogUrls.length + productUrls.length, 'Агент должен найти каталог, категории или карточки товаров для глубокого обхода').toBeGreaterThan(0);

    await auditCatalogNavigation(page, catalogUrls, steps, findings);
    await auditFiltersAndSorting(page, catalogUrls, steps, findings);
    await auditProductCards(page, productUrls, steps, findings);
    await auditContactActions(page, steps, findings);
    await attachDeepAudit(testInfo, steps, findings);

    expect(findings, `Найдены проблемы глубокого commerce-аудита:\n\n${formatFindings(findings)}`).toHaveLength(0);
  });
});
