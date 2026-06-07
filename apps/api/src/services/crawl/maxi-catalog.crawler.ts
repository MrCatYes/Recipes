/**
 * Full Maxi catalog crawler.
 * Reads products straight from each category page's __NEXT_DATA__ (SSR JSON),
 * paginates via ?page=N, and upserts every product into CatalogItem.
 *
 *   pnpm exec tsx src/services/crawl/maxi-catalog.crawler.ts
 */

import { chromium, type Page } from 'playwright';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Top food departments to discover leaf categories from.
const DEPARTMENTS = [
  'https://www.maxi.ca/fr/alimentation/fruits-et-l-gumes/c/28000',
  'https://www.maxi.ca/fr/alimentation/produits-laitiers-et-ufs/c/28003',
  'https://www.maxi.ca/fr/alimentation/viande/c/27998',
  'https://www.maxi.ca/fr/alimentation/garde-manger/c/28006',
  'https://www.maxi.ca/fr/alimentation/boulangerie/c/28002',
  'https://www.maxi.ca/fr/alimentation/surgel-s/c/28005',
  'https://www.maxi.ca/fr/alimentation/breuvages/c/28004',
  'https://www.maxi.ca/fr/alimentation/collations/c/28007',
  'https://www.maxi.ca/fr/alimentation/poissons-et-fruits-de-mer/c/27999',
  'https://www.maxi.ca/fr/alimentation/charcuterie-et-fromages/c/28001',
];

interface Tile {
  productId?: string; articleNumber?: string; brand?: string; title?: string;
  pricing?: { price?: string; wasPrice?: string };
  packageSizing?: string; link?: string;
}

async function readGrid(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;
    try {
      const d = JSON.parse(el.textContent || '{}');
      return d?.props?.pageProps?.initialData?.layout?.sections?.productListingSection?.components?.[0]?.data?.productGrid ?? null;
    } catch { return null; }
  });
}

async function discoverCategories(page: Page): Promise<string[]> {
  const found = new Set<string>();
  for (const dep of DEPARTMENTS) {
    try {
      await page.goto(dep, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/c/"]'))
          .map(a => (a as HTMLAnchorElement).getAttribute('href') || '')
          .filter(h => /\/alimentation\/.+\/c\/\d+$/.test(h))
      );
      for (const l of links) found.add(l.startsWith('http') ? l : `https://www.maxi.ca${l}`);
      found.add(dep); // department page itself also lists products
      console.log(`[discover] ${dep.split('/').slice(-2)[0]}: +${links.length}`);
    } catch (e) {
      console.warn(`[discover] fail ${dep}:`, e instanceof Error ? e.message : e);
    }
  }
  return [...found];
}

function parsePkg(raw: string | undefined): { size: number; unit: string } {
  if (!raw) return { size: 1, unit: 'unit' };
  const m = raw.match(/([\d.,\s]+)\s*(g|kg|ml|l|lb|oz)\b/i);
  if (!m) return { size: 1, unit: 'unit' };
  const size = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(size) || size <= 0) return { size: 1, unit: 'unit' };
  return { size, unit: m[2].toLowerCase() === 'l' ? 'L' : m[2].toLowerCase() };
}

async function crawlCategory(page: Page, url: string, category: string): Promise<number> {
  let saved = 0;
  for (let pageNum = 1; pageNum <= 25; pageNum++) {
    const grid = await readGrid(page, pageNum === 1 ? url : `${url}?page=${pageNum}`);
    const tiles: Tile[] = grid?.productTiles ?? [];
    if (!tiles.length) break;

    for (const t of tiles) {
      const sku = t.productId || t.articleNumber;
      const priceStr = t.pricing?.price;
      if (!sku || !priceStr) continue;
      const priceCents = Math.round(parseFloat(priceStr) * 100);
      if (!Number.isFinite(priceCents) || priceCents <= 0) continue;
      const { size, unit } = parsePkg(t.packageSizing);
      const name = [t.brand, t.title].filter(Boolean).join(' ').trim() || t.title || '';
      if (!name) continue;

      await prisma.catalogItem.upsert({
        where: { chain_sourceSku: { chain: 'Maxi', sourceSku: sku } },
        create: {
          chain: 'Maxi', sourceSku: sku, name, brand: t.brand ?? null, category,
          priceCents, packageSize: size, packageUnit: unit,
          url: t.link ? `https://www.maxi.ca${t.link}` : null,
        },
        update: { name, brand: t.brand ?? null, category, priceCents, packageSize: size, packageUnit: unit, updatedAt: new Date() },
      });
      saved++;
    }

    if (!grid?.pagination?.hasMore) break;
    await page.waitForTimeout(400);
  }
  return saved;
}

export async function crawlMaxi(): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'fr-CA', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log('Discovering categories...');
  const cats = await discoverCategories(page);
  console.log(`\n${cats.length} categories to crawl.\n`);

  let total = 0;
  for (let i = 0; i < cats.length; i++) {
    const url = cats[i];
    const label = decodeURIComponent(url.split('/').slice(-3, -2)[0] ?? url);
    try {
      const n = await crawlCategory(page, url, label);
      total += n;
      console.log(`[${i + 1}/${cats.length}] ${label}: ${n} (total ${total})`);
    } catch (e) {
      console.warn(`[${i + 1}/${cats.length}] ${label} FAILED:`, e instanceof Error ? e.message : e);
    }
  }

  await browser.close();
  const count = await prisma.catalogItem.count({ where: { chain: 'Maxi' } });
  console.log(`\n✅ Maxi crawl done. ${total} upserts, ${count} total Maxi catalog items.`);
}

if (process.argv[1]?.includes('maxi-catalog')) {
  crawlMaxi().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });
}
