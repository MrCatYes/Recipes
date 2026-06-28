/**
 * Full flyer crawler — pulls every item from every active flyer via Flipp API.
 *
 * Unlike the old price-scraper (searched ~15 specific products), this grabs the
 * ENTIRE weekly circular for each chain: IGA, Maxi, Metro, Super C, Walmart, Costco.
 *
 * Flow:
 *   1. GET /flyers?locale=fr-ca&postal_code=H2X1Y6  → list of active flyers
 *   2. Filter to our 6 chains
 *   3. For each flyer: GET /flyer_items?flyer_id=X   → all items
 *   4. Upsert into FlyerItem (raw promo data, optionally matched to Product)
 *
 * Run:  pnpm exec tsx --env-file=.env src/services/crawl/flipp-flyers.crawler.ts
 */

import { PrismaClient, type StoreChain } from '@prisma/client';
import Fuse from 'fuse.js';

const prisma = new PrismaClient();
const POSTAL_CODE = process.env.FLIPP_POSTAL_CODE ?? 'H2X1Y6';
const BASE = 'https://backflipp.wishabi.com/flipp';

// ─── Flipp types ─────────────────────────────────────────────────────────────

interface FlippFlyer {
  id: number;
  merchant: string;
  merchant_name: string;
  name: string;
  valid_from: string;
  valid_to: string;
  categories_csv: string;
}

interface FlippFlyerItem {
  id: number;
  name: string;
  description: string | null;
  current_price: number | null;
  current_price_range: string | null;
  pre_price_text: string | null;
  pre_price: number | null;
  price_text: string | null;
  category: string | null;
  brand: string | null;
  cutout_image_url: string | null;
  sale_story: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

/** Fetch all items for a flyer, handling pagination (150 items/page). */
async function fetchAllFlyerItems(flyerId: number): Promise<FlippFlyerItem[]> {
  const all: FlippFlyerItem[] = [];
  const seenIds = new Set<number>();
  let from = 0;
  const pageSize = 150;

  while (true) {
    const url = `/items/search?locale=fr-ca&postal_code=${POSTAL_CODE}&flyer_id=${flyerId}&from=${from}&size=${pageSize}`;
    const data = await flippFetch<{ items: FlippFlyerItem[] }>(url);
    const items = data.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        all.push(item);
      }
    }

    if (items.length < pageSize) break;
    from += pageSize;
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

// ─── Chain resolution ────────────────────────────────────────────────────────

const MERCHANT_PATTERNS: Array<{ pattern: RegExp; chain: StoreChain }> = [
  { pattern: /\bmaxi\b/i,             chain: 'Maxi' },
  { pattern: /\biga\b/i,              chain: 'IGA' },
  { pattern: /\bsuper\s*c\b/i,        chain: 'SuperC' },
  { pattern: /\bmetro\b/i,            chain: 'Metro' },
  { pattern: /\bwalmart|great value/i, chain: 'Walmart' },
  { pattern: /\bcostco\b/i,           chain: 'Costco' },
];

function resolveChain(merchantName: string): StoreChain | null {
  for (const { pattern, chain } of MERCHANT_PATTERNS) {
    if (pattern.test(merchantName)) return chain;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

async function flippFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EpicerieBot/1.0)', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Flipp ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

function parsePriceCents(item: FlippFlyerItem): number | null {
  if (item.current_price != null && item.current_price > 0) {
    return Math.round(item.current_price * 100);
  }
  // Try parsing price_text: "2,99 $", "2/$5", "3.49"
  const raw = item.price_text ?? item.current_price_range ?? '';
  const m = raw.match(/(\d+[.,]\d{2})/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 100);
  return null;
}

function parseRegularCents(item: FlippFlyerItem): number | null {
  if (item.pre_price != null && item.pre_price > 0) {
    return Math.round(item.pre_price * 100);
  }
  const raw = item.pre_price_text ?? '';
  const m = raw.match(/(\d+[.,]\d{2})/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 100);
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function crawlFlippFlyers(): Promise<{
  flyersProcessed: number;
  totalItems: number;
  matched: number;
}> {
  const weekOf = getWeekMonday();
  console.log(`\n📰 Crawling full Flipp flyers for week of ${weekOf.toISOString().split('T')[0]}...`);
  console.log(`   Postal code: ${POSTAL_CODE}\n`);

  // 1. Get active flyers
  const flyersRes = await flippFetch<{ flyers: FlippFlyer[] }>(
    `/flyers?locale=fr-ca&postal_code=${POSTAL_CODE}`
  );

  // 2. Group by chain, pick the main grocery flyer per chain
  const flyersByChain = new Map<StoreChain, FlippFlyer[]>();
  for (const f of flyersRes.flyers) {
    const chain = resolveChain(f.merchant_name ?? f.merchant);
    if (!chain) continue;
    const arr = flyersByChain.get(chain) ?? [];
    arr.push(f);
    flyersByChain.set(chain, arr);
  }

  console.log(`Found ${flyersByChain.size} chains with active flyers:`);
  for (const [chain, flyers] of flyersByChain) {
    console.log(`  ${chain}: ${flyers.length} flyer(s) — ${flyers.map(f => f.name).join(', ')}`);
  }
  console.log('');

  // 3. Load stores + products for matching
  const stores = await prisma.store.findMany();
  const storeByChain = new Map<StoreChain, typeof stores[0]>();
  for (const s of stores) {
    if (!storeByChain.has(s.chain as StoreChain)) storeByChain.set(s.chain as StoreChain, s);
  }

  // Auto-create placeholder stores for chains found in Flipp but missing from DB
  for (const chain of flyersByChain.keys()) {
    if (!storeByChain.has(chain)) {
      const s = await prisma.store.create({
        data: { chain, name: `${chain} (Flipp)`, city: 'Montréal' },
      });
      storeByChain.set(chain, s);
      console.log(`  + Created placeholder store for ${chain}`);
    }
  }

  const products = await prisma.product.findMany();
  const fuse = new Fuse(products, {
    keys: ['name'],
    threshold: 0.35,
    includeScore: true,
  });

  let flyersProcessed = 0;
  let totalItems = 0;
  let matched = 0;

  for (const [chain, flyers] of flyersByChain) {
    const store = storeByChain.get(chain);
    if (!store) {
      console.log(`  ⚠ No store in DB for ${chain}, skipping`);
      continue;
    }

    // Delete old flyer items for this store+week before inserting fresh
    await prisma.flyerItem.deleteMany({ where: { storeId: store.id, weekOf } });

    for (const flyer of flyers) {
      console.log(`  📄 ${chain} — "${flyer.name}" (id=${flyer.id})`);

      try {
        const items = await fetchAllFlyerItems(flyer.id);
        console.log(`     ${items.length} items`);

        const batch: Parameters<typeof prisma.flyerItem.create>[0]['data'][] = [];

        for (const item of items) {
          const priceCents = parsePriceCents(item);
          if (!priceCents || priceCents <= 0) continue;

          const regularCents = parseRegularCents(item);
          const rawText = [item.name, item.description].filter(Boolean).join(' | ').substring(0, 500);

          // Fuzzy match to a product
          let productId: string | null = null;
          const searchName = item.name ?? '';
          if (searchName.length > 2) {
            const results = fuse.search(searchName);
            if (results.length > 0 && (results[0].score ?? 1) < 0.35) {
              productId = results[0].item.id;
            }
          }

          batch.push({
            storeId: store.id,
            productId,
            rawText,
            promoPriceCents: priceCents,
            regularPriceCents: regularCents,
            weekOf,
          });

          if (productId) matched++;
          totalItems++;
        }

        // Batch insert
        if (batch.length > 0) {
          await prisma.flyerItem.createMany({ data: batch });
        }

        flyersProcessed++;
        console.log(`     → ${batch.length} items saved (${batch.filter(b => b.productId).length} matched to products)`);
      } catch (e) {
        console.error(`     ✗ Error: ${e instanceof Error ? e.message : e}`);
      }

      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Flipp flyers done: ${flyersProcessed} flyers, ${totalItems} items, ${matched} matched to products.`);
  return { flyersProcessed, totalItems, matched };
}

// Direct execution
if (process.argv[1]?.includes('flipp-flyers')) {
  crawlFlippFlyers()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect(); });
}
