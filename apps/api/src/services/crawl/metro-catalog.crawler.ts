/**
 * Metro Inc. platform catalog crawler (Metro + Super C — same e-commerce tech).
 * Both render products server-side into the DOM with rich data-* attributes.
 * Discover aisle categories, scroll each to load all tiles, extract & upsert.
 * Metro is behind Cloudflare → stealth plugin.
 *
 *   pnpm exec tsx --env-file=.env src/services/crawl/metro-catalog.crawler.ts        # Metro
 *   pnpm exec tsx --env-file=.env src/services/crawl/metro-catalog.crawler.ts superc # Super C
 *
 * ⚠️ Super C config assumes the same DOM as Metro (same parent platform).
 *    Validate selectors against superc.ca on first run; adjust ALLEES path if needed.
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { PrismaClient, type StoreChain } from '@prisma/client';
import type { Page } from 'playwright';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(chromium as any).use(stealth());
const prisma = new PrismaClient();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface PlatformConfig {
  chain: StoreChain;
  base: string;
  /** Aisle index path appended to base (where departments are listed). */
  alleesPath: string;
}

const CONFIGS: Record<'metro' | 'superc', PlatformConfig> = {
  metro:  { chain: 'Metro',  base: 'https://www.metro.ca',  alleesPath: '/epicerie-en-ligne/allees' },
  superc: { chain: 'SuperC', base: 'https://www.superc.ca', alleesPath: '/epicerie-en-ligne/allees' },
};

/** Retry an async page op a few times — guards against Cloudflare/network hiccups. */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      console.warn(`[retry ${i}/${tries}] ${label}: ${e instanceof Error ? e.message : e}`);
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
  throw lastErr;
}

function abs(base: string, href: string): string { return href.startsWith('http') ? href : `${base}${href}`; }
function depth(u: string): number { return u.split('/allees/')[1]?.split('?')[0].split('/').filter(Boolean).length ?? 0; }

async function getAisleLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).getAttribute('href') || '')
      .filter(h => h.includes('/allees/') && !h.includes('/p/')))), // exclude product detail pages
  );
}

/** Recursive BFS to collect all leaf category URLs in the aisle tree. */
async function discoverCategories(page: Page, cfg: PlatformConfig): Promise<string[]> {
  await withRetry('discover root', () =>
    page.goto(`${cfg.base}${cfg.alleesPath}`, { waitUntil: 'networkidle', timeout: 50000 }));
  await page.waitForTimeout(4000);
  const rootLinks = (await getAisleLinks(page)).filter(l => depth(l) === 1).map(l => abs(cfg.base, l));
  console.log(`[discover] ${rootLinks.length} top-level departments`);

  const visited = new Set<string>();
  const leaves = new Set<string>();
  const queue: string[] = [...rootLinks];

  while (queue.length > 0) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      await withRetry(`discover ${url}`, () =>
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }));
      await page.waitForTimeout(2000);

      // Try to read __NEXT_DATA__ for Metro (Next.js) pages
      const hasNextData = await page.evaluate(() => !!document.getElementById('__NEXT_DATA__'));

      const rawLinks = await getAisleLinks(page);
      const d = depth(url);
      const children = rawLinks
        .map(l => abs(cfg.base, l))
        .filter(l => depth(l) > d && !visited.has(l)); // only deeper links

      if (children.length === 0 || hasNextData) {
        // Leaf page: has products or can extract via __NEXT_DATA__
        leaves.add(url);
      } else {
        // Branch: queue children for exploration
        for (const c of children) queue.push(c);
        // Also add current as leaf in case it itself has products
        leaves.add(url);
      }
      console.log(`[discover] d=${d} ${url.split('/allees/')[1] ?? url}: +${children.length} children, leaves=${leaves.size}`);
    } catch (e) {
      console.warn(`[discover] fail ${url}:`, e instanceof Error ? e.message : e);
    }
  }
  return [...leaves];
}

function parsePkg(text: string): { size: number; unit: string } {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
  if (!m) return { size: 1, unit: 'unit' };
  const size = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(size) || size <= 0) return { size: 1, unit: 'unit' };
  return { size, unit: m[2].toLowerCase() === 'l' ? 'L' : m[2].toLowerCase() };
}

async function extractTiles(page: Page): Promise<Array<{ code:string;name:string;brand:string|null;category:string|null;text:string;href:string|null }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-product-code]')).map(el => ({
      code: el.getAttribute('data-product-code') || '',
      name: el.getAttribute('data-product-name') || '',
      brand: el.getAttribute('data-product-brand'),
      category: el.getAttribute('data-product-category'),
      text: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      href: el.querySelector('a[href*="/p/"]')?.getAttribute('href') ?? null,
    })),
  );
}

type RawTile = { code:string; name:string; brand:string|null; category:string|null; text:string; href:string|null };

/** Try to extract products from Next.js SSR data blob. Returns null if not present or empty. */
async function extractFromNextData(page: Page): Promise<RawTile[] | null> {
  return page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;
    try {
      const d = JSON.parse(el.textContent || '{}');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grid: any[] =
        d?.props?.pageProps?.initialData?.layout?.sections?.productListingSection?.components?.[0]?.data?.productGrid
        ?? d?.props?.pageProps?.products
        ?? d?.props?.pageProps?.initialData?.products
        ?? [];
      if (!Array.isArray(grid) || grid.length === 0) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return grid.map((t: any) => ({
        code: String(t.productId ?? t.articleNumber ?? ''),
        name: String(t.title ?? t.name ?? ''),
        brand: t.brand ? String(t.brand) : null,
        category: t.category ? String(t.category) : null,
        text: `${t.pricing?.price ?? ''} ${t.packageSizing ?? ''}`.trim(),
        href: t.link ? String(t.link) : null,
      }));
    } catch { return null; }
  });
}

async function saveTiles(tiles: RawTile[], cfg: PlatformConfig): Promise<number> {
  let saved = 0;
  for (const t of tiles) {
    if (!t.code || !t.name) continue;
    const prices = Array.from(t.text.matchAll(/(\d+[,.]?\d*)\s*\$/g)).map(
      m => Math.round(parseFloat(m[1].replace(',', '.')) * 100));
    const isPromo = /r[ée]gulier/i.test(t.text) && prices.length >= 2;
    const priceCents = isPromo ? Math.min(prices[0], prices[1]) : (prices[0] ?? 0);
    if (!priceCents || priceCents <= 0 || priceCents > 100000) continue; // skip >$1000 (parse errors)
    const { size, unit } = parsePkg(t.text);
    await prisma.catalogItem.upsert({
      where: { chain_sourceSku: { chain: cfg.chain, sourceSku: t.code } },
      create: { chain: cfg.chain, sourceSku: t.code, name: t.name, brand: t.brand, category: t.category, priceCents, packageSize: size, packageUnit: unit, url: t.href ? abs(cfg.base, t.href) : null },
      update: { name: t.name, brand: t.brand, category: t.category, priceCents, packageSize: size, packageUnit: unit, updatedAt: new Date() },
    });
    saved++;
  }
  return saved;
}

async function crawlCategory(page: Page, cfg: PlatformConfig, url: string): Promise<number> {
  await withRetry(`goto ${url}`, () =>
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }));
  await page.waitForTimeout(2500);

  // Fast path: try Next.js SSR data with pagination
  const firstPage = await extractFromNextData(page);
  if (firstPage !== null) {
    let allTiles: RawTile[] = [...firstPage];
    // Try additional pages (Metro may paginate like Maxi)
    for (let pageNum = 2; pageNum <= 30; pageNum++) {
      const pageUrl = `${url}${url.includes('?') ? '&' : '?'}page=${pageNum}`;
      try {
        await withRetry(`goto page ${pageNum}`, () =>
          page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }));
        await page.waitForTimeout(1500);
        const more = await extractFromNextData(page);
        if (!more || more.length === 0) break;
        allTiles = allTiles.concat(more);
      } catch { break; }
    }
    return saveTiles(allTiles, cfg);
  }

  // DOM fallback: Infinite scroll / load-more until product count stabilises
  let prev = 0;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('[data-product-code]').length);
    if (n === prev) {
      const more = page.locator('button:has-text("Voir plus"), button:has-text("plus de produits"), a:has-text("Voir plus")').first();
      if (await more.isVisible({ timeout: 800 }).catch(() => false)) { await more.click().catch(() => {}); await page.waitForTimeout(1500); continue; }
      break;
    }
    prev = n;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
  }

  const raw = await extractTiles(page);
  return saveTiles(raw, cfg);
}

export async function crawlMetroPlatform(cfg: PlatformConfig): Promise<void> {
  // Use system chromium on Alpine Linux (playwright's bundled binaries are glibc and won't run on musl)
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? (require('fs').existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' : undefined);
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'fr-CA', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log(`Discovering ${cfg.chain} categories...`);
  const cats = await discoverCategories(page, cfg);
  console.log(`\n${cats.length} categories to crawl.\n`);

  let total = 0;
  for (let i = 0; i < cats.length; i++) {
    try {
      const n = await crawlCategory(page, cfg, cats[i]);
      total += n;
      console.log(`[${i + 1}/${cats.length}] ${cats[i].split('/allees/')[1]}: ${n} (total ${total})`);
    } catch (e) {
      console.warn(`[${i + 1}/${cats.length}] FAILED ${cats[i]}:`, e instanceof Error ? e.message : e);
    }
  }

  await browser.close();
  const count = await prisma.catalogItem.count({ where: { chain: cfg.chain } });
  console.log(`\n✅ ${cfg.chain} crawl done. ${total} upserts, ${count} ${cfg.chain} catalog items.`);
}

export const crawlMetro  = () => crawlMetroPlatform(CONFIGS.metro);
export const crawlSuperC = () => crawlMetroPlatform(CONFIGS.superc);

if (process.argv[1]?.includes('metro-catalog')) {
  const which = process.argv[2] === 'superc' ? CONFIGS.superc : CONFIGS.metro;
  crawlMetroPlatform(which).then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });
}
