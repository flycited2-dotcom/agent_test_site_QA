import fs from 'node:fs';
import path from 'node:path';

export type SiteProfile = 'auto' | 'landing' | 'content' | 'catalog' | 'shop';
export type TestDepth = 'smoke' | 'critical' | 'full';

export type RuntimeConfig = {
  site: {
    url: string;
    profile: SiteProfile;
    depth: TestDepth;
    safeMode: boolean;
  };
  notifications: {
    telegram: boolean;
    googleDrive: boolean;
    email: boolean;
  };
};

const runtimePath = path.resolve('storage/runtime-config.json');

export function normalizeProfile(value: unknown): SiteProfile {
  return ['auto', 'landing', 'content', 'catalog', 'shop'].includes(String(value))
    ? String(value) as SiteProfile
    : 'auto';
}

export function normalizeDepth(value: unknown): TestDepth {
  return ['smoke', 'critical', 'full'].includes(String(value))
    ? String(value) as TestDepth
    : 'smoke';
}

export function normalizeUrl(value: string): string {
  return new URL(value).toString();
}

export function mergeRuntimeConfig(raw: Partial<RuntimeConfig>, fallbackUrl: string): RuntimeConfig {
  const url = normalizeUrl(raw.site?.url || fallbackUrl);

  return {
    site: {
      url,
      profile: normalizeProfile(raw.site?.profile),
      depth: normalizeDepth(raw.site?.depth),
      safeMode: raw.site?.safeMode !== false
    },
    notifications: {
      telegram: raw.notifications?.telegram !== false,
      googleDrive: raw.notifications?.googleDrive !== false,
      email: raw.notifications?.email === true
    }
  };
}

export function readRuntimeConfig(fallbackUrl = process.env.BASE_URL || 'https://climat-simf.ru/'): RuntimeConfig {
  if (!fs.existsSync(runtimePath)) return mergeRuntimeConfig({}, fallbackUrl);
  try {
    return mergeRuntimeConfig(JSON.parse(fs.readFileSync(runtimePath, 'utf8')), fallbackUrl);
  } catch {
    return mergeRuntimeConfig({}, fallbackUrl);
  }
}

export function writeRuntimeConfig(config: RuntimeConfig): void {
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, JSON.stringify(config, null, 2), 'utf8');
}

export function updateRuntimeSite(url: string, profile?: SiteProfile, depth?: TestDepth): RuntimeConfig {
  const current = readRuntimeConfig();
  const next = mergeRuntimeConfig({
    ...current,
    site: {
      ...current.site,
      url: normalizeUrl(url),
      profile: profile || current.site.profile,
      depth: depth || current.site.depth
    }
  }, current.site.url);
  writeRuntimeConfig(next);
  return next;
}
