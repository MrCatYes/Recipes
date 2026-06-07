/**
 * Full Metro catalog crawler (stealth — Metro is behind Cloudflare).
 * Metro renders products server-side into the DOM with rich data-* attributes.
 * Discover aisle categories, scroll each to load all tiles, extract & upsert.
 *
 *   pnpm exec tsx --env-file=.env src/services/crawl/metro-catalog.crawler.ts
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from '@prisma/client';
import type { Page } from 'playwright';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(chromium as any).use(stealth());
const prisma = new PrismaClient();
const BASE = 'https://www.metro.ca';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function abs(href: string): string { return href.startsWith('http') ? href : `${BASE}${href}`; }
function depth(u: string): number { return u.split('/allees/')[1]?.split('?')[0].split('/').filter(Boolean).length ?? 0; }

async function getAisleLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).getAttribute('href') || '')
      .filter(h => h.includes('/allees/')))),
  );
}

/** BFS the aisle tree to collect leaf category URLs (depth >= 2). */
async function discoverCategories(page: Page): Promise<string[]> {
  await page.goto(`${BASE}/epicerie-en-ligne/allees`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(4000);
  const depts = (await getAisleLinks(page)).filter(l => depth(l) === 1).map(abs);
  console.log(`[discover] ${depts.length} departments`);

  const leaves = new Set<string>();
  for (const dep of depts) {
    try {
      await page.goto(dep, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(2500);
      const links = (await getAisleLinks(page)).map(abs);
      const subs = links.filter(l => depth(l) >= 2);
      // department itself also lists products; keep it as a fallback category
      if (subs.length === 0) leaves.add(dep);
      for (const s of subs) leaves.add(s);
      console.log(`[discover] ${dep.split('/allees/')[1]}: +${subs.length}`);
    } catch (e) {
      console.warn(`[discover] fail ${dep}:`, e instanceof Error ? e.message : e);
    }
  }
  return [...leaves];
}

interface MetroTile { code: string; name: string; brand: string | null; category: string | null; priceCents: number; regularCents: number | null; size: number; unit: string; url: string | null; }

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

async function crawlCategory(page: Page, url: string): Promise<number> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2500);

  // Infinite scroll / load-more until product count stabilises
  let prev = 0;
  for (let i = 0; i < 25; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('[data-product-code]').length);
    if (n === prev) {
      // try a "voir plus" button
      const more = page.locator('button:has-text("Voir plus"), button:has-text("plus de produits"), a:has-text("Voir plus")').first();
      if (await more.isVisible({ timeout: 800 }).catch(() => false)) { await more.click().catch(() => {}); await page.waitForTimeout(1500); continue; }
      break;
    }
    prev = n;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
  }

  const raw = await extractTiles(page);
  let saved = 0;
  for (const t of raw) {
    if (!t.code || !t.name) continue;
    // price: "X,XX $" ; promo: "Prix régulier A $ ... B $" → regular A, current B
    const prices = Array.from(t.text.matchAll(/(\d+,\d{2})\s*\$/g)).map(m => Math.round(parseFloat(m[1].replace(',', '.')) * 100));
    if (!prices.length) continue;
    const isPromo = /r[ée]gulier/i.test(t.text) && prices.length >= 2;
    const priceCents = isPromo ? Math.min(prices[0], prices[1]) : prices[0];
    const regularCents = isPromo ? Math.max(prices[0], prices[1]) : null;
    if (!priceCents || priceCents <= 0) continue;
    const { size, unit } = parsePkg(t.text);

    await prisma.catalogItem.upsert({
      where: { chain_sourceSku: { chain: 'Metro', sourceSku: t.code } },
      create: { chain: 'Metro', sourceSku: t.code, name: t.name, brand: t.brand, category: t.category, priceCents, packageSize: size, packageUnit: unit, url: t.href ? abs(t.href) : null },
      update: { name: t.name, brand: t.brand, category: t.category, priceCents, packageSize: size, packageUnit: unit, updatedAt: new Date() },
    });
    saved++;
  }
  return saved;
}

export async function crawlMetro(): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'fr-CA', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log('Discovering Metro categories...');
  const cats = await discoverCategories(page);
  console.log(`\n${cats.length} categories to crawl.\n`);

  let total = 0;
  for (let i = 0; i < cats.length; i++) {
    try {
      const n = await crawlCategory(page, cats[i]);
      total += n;
      console.log(`[${i + 1}/${cats.length}] ${cats[i].split('/allees/')[1]}: ${n} (total ${total})`);
    } catch (e) {
      console.warn(`[${i + 1}/${cats.length}] FAILED ${cats[i]}:`, e instanceof Error ? e.message : e);
    }
  }

  await browser.close();
  const count = await prisma.catalogItem.count({ where: { chain: 'Metro' } });
  console.log(`\n✅ Metro crawl done. ${total} upserts, ${count} Metro catalog items.`);
}

if (process.argv[1]?.includes('metro-catalog')) {
  crawlMetro().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });
}
