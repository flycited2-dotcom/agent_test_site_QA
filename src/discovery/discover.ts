import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { config, absoluteUrl } from '../utils/config';

const outDir = path.resolve('storage');
fs.mkdirSync(outDir, { recursive: true });

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function discoverFromSitemap(): Promise<string[]> {
  const sitemapUrl = absoluteUrl('/sitemap.xml');
  const xml = await fetchText(sitemapUrl);
  if (!xml) return [];
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const urls: string[] = [];
  const collect = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) node.forEach(collect);
    else if (typeof node === 'object') {
      if (typeof node.loc === 'string') urls.push(node.loc);
      Object.values(node).forEach(collect);
    }
  };
  collect(data);
  return Array.from(new Set(urls.filter(u => u.startsWith(config.baseUrl.replace(/\/$/, '')))));
}

async function discoverByCrawl(seedUrls: string[]): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const host = new URL(config.baseUrl).host;
  const seen = new Set<string>();
  const queue = [...seedUrls, config.baseUrl];
  while (queue.length && seen.size < config.maxCategoryPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(a => (a as HTMLAnchorElement).href));
      for (const link of links) {
        try {
          const u = new URL(link);
          if (u.host === host && !seen.has(u.toString()) && !/logout|admin|wp-admin|compare|favorite/i.test(u.pathname)) queue.push(u.toString());
        } catch {}
      }
    } catch {}
  }
  await browser.close();
  return Array.from(seen);
}

const sitemapUrls = await discoverFromSitemap();
const urls = await discoverByCrawl(sitemapUrls.slice(0, 50));
const finalUrls = Array.from(new Set([...sitemapUrls, ...urls]));
fs.writeFileSync(path.join(outDir, 'discovered-urls.json'), JSON.stringify(finalUrls, null, 2), 'utf8');
console.log(`Найдено URL: ${finalUrls.length}`);
