import { test, expect } from '@playwright/test';
import { normalizeProfile, normalizeDepth, mergeRuntimeConfig } from '../src/utils/runtime-config';

test('runtime config validates profile and depth with env fallback', () => {
  const config = mergeRuntimeConfig({
    site: { url: 'https://example.com', profile: 'shop', depth: 'critical', safeMode: false }
  }, 'https://fallback.test/');

  expect(config.site.url).toBe('https://example.com/');
  expect(config.site.profile).toBe('shop');
  expect(config.site.depth).toBe('critical');
  expect(config.site.safeMode).toBe(false);
});

test('runtime config falls back to safe defaults', () => {
  expect(normalizeProfile('bad')).toBe('auto');
  expect(normalizeDepth('bad')).toBe('smoke');
  expect(mergeRuntimeConfig({}, 'https://fallback.test').site.url).toBe('https://fallback.test/');
});

test('runtime config supports enterprise depth for maximum audit runs', () => {
  expect(normalizeDepth('enterprise')).toBe('enterprise');
  expect(mergeRuntimeConfig({
    site: { url: 'https://example.com', profile: 'shop', depth: 'enterprise', safeMode: true }
  }, 'https://fallback.test/').site.depth).toBe('enterprise');
});
