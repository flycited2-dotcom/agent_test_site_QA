import { expect, Locator, Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

export async function safeClick(locator: Locator, label: string): Promise<boolean> {
  try {
    if (await locator.count() === 0) return false;
    const first = locator.first();
    await first.scrollIntoViewIfNeeded({ timeout: 5000 });
    await first.click({ timeout: 8000 });
    await waitHuman();
    return true;
  } catch (error) {
    console.warn(`Не удалось кликнуть: ${label}: ${(error as Error).message}`);
    return false;
  }
}

export async function waitHuman(): Promise<void> {
  const delay = Math.max(0, config.actionDelayMs);
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
}

export async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => {
    const failure = req.failure();
    if (failure) errors.push(`[requestfailed] ${req.method()} ${req.url()} — ${failure.errorText}`);
  });
  return errors;
}

export async function assertNoCriticalErrors(errors: string[]) {
  const critical = errors.filter(e => !/favicon|metrics|metrika|analytics|ym\(/i.test(e));
  expect(critical, `Критические ошибки консоли/запросов: ${critical.join('\n')}`).toHaveLength(0);
}

export async function saveArtifact(testInfo: TestInfo, name: string, content: string) {
  const dir = testInfo.outputDir;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  await testInfo.attach(name, { path: file, contentType: 'text/plain' });
}

export async function getVisibleLinks(page: Page): Promise<string[]> {
  const links = await page.locator('a[href]').evaluateAll(nodes => Array.from(new Set(nodes.map(a => (a as HTMLAnchorElement).href))));
  return links.filter(href => href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:'));
}

export async function findProductLinks(page: Page): Promise<string[]> {
  const all = await getVisibleLinks(page);
  const baseHost = new URL(page.url()).host;
  return Array.from(new Set(all.filter(url => {
    try {
      const u = new URL(url);
      if (u.host !== baseHost) return false;
      return /product|tovar|catalog|shop|item|goods|\/[a-z0-9-]+\/[a-z0-9-]+/i.test(u.pathname) && !/cart|checkout|login|register|compare|favorite/i.test(u.pathname);
    } catch { return false; }
  })));
}

export async function fillLikelyForm(page: Page) {
  const name = page.locator('input[name*=name i], input[placeholder*=имя i], input[placeholder*=фио i]').first();
  const phone = page.locator('input[type=tel], input[name*=phone i], input[placeholder*=тел i]').first();
  const email = page.locator('input[type=email], input[name*=email i], input[placeholder*=mail i], input[placeholder*=почт i]').first();
  const comment = page.locator('textarea, input[name*=comment i], input[placeholder*=комментар i]').first();
  if (await name.count()) await name.fill(config.testUser.name).catch(() => {});
  if (await phone.count()) await phone.fill(config.testUser.phone).catch(() => {});
  if (await email.count()) await email.fill(config.testUser.email).catch(() => {});
  if (await comment.count()) await comment.fill(config.testUser.comment).catch(() => {});
}

export async function clickConsentIfPresent(page: Page) {
  const consent = page.locator('input[type=checkbox], label:has-text("соглас"), label:has-text("политик")').first();
  if (await consent.count()) {
    try { await consent.click({ timeout: 3000 }); } catch {}
  }
}
