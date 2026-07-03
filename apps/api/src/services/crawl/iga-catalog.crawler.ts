/**
 * Full IGA catalog crawler — via IGA's public Algolia product index.
 * No browser/DOM scraping: clean paginated JSON API.
 *
 * IGA fronts its catalog with Algolia (app L0APUSIH50, index dxp_product_fr).
 * The search key is referer-restricted to https://www.iga.ca/ — we send that
 * Referer header. Records are per-store (storeId), each carrying price, package
 * size, brand, categories. Algolia caps a query at 1000 hits, so we slice by
 * the most granular category facet (hierarchicalCategories.lvl2) to stay under.
 *
 *   pnpm exec tsx --env-file=.env src/services/crawl/iga-catalog.crawler.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APP_ID = 'L0APUSIH50';
const API_KEY = '022f6cbb0292d0e78f65897fd6dabad9';
const INDEX = 'dxp_product_fr';
const STORE = process.env.IGA_STORE_ID ?? '8253'; // IGA Atwater (Montréal)
const BASE_FILTER = `storeId:${STORE} AND isVisible:true`;
const FACET = 'hierarchicalCategories.lvl2';

interface IgaHit {
  articleNumber?: string;
  name?: string;
  brand?: string | null;
  price?: number;
  itemAmountValue?: string;
  itemAmountUnit?: string;
  categories?: string[];
  pageSlug?: string;
  inStock?: boolean;
}

interface AlgoliaResp {
  hits: IgaHit[];
  nbHits: number;
  facets?: Record<string, Record<string, number>>;
}

async function algolia(body: Record<string, unknown>): Promise<AlgoliaResp> {
  const url = `https://${APP_ID}-dsn.algolia.net/1/indexes/${INDEX}/query` +
    `?x-algolia-agent=Algolia%20for%20JavaScript%20(5.46.0)%3B%20Search%20(5.46.0)%3B%20Browser` +
    `&x-algolia-api-key=${API_KEY}&x-algolia-application-id=${APP_ID}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.iga.ca/', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Algolia ${res.status}: ${(await res.text()).slice(0, 150)}`);
      return res.json() as Promise<AlgoliaResp>;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('unreachable');
}

const UNIT_MAP: Record<string, string> = { ML: 'ml', L: 'L', G: 'g', KG: 'kg', EA: 'unit' };
function mapUnit(u: string | undefined): string {
  return UNIT_MAP[(u ?? '').toUpperCase()] ?? 'unit';
}

function parseSize(v: string | undefined): number {
  const n = parseFloat((v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function getCategorySlices(): Promise<Array<{ value: string; count: number }>> {
  const r = await algolia({ query: '', filters: BASE_FILTER, facets: [FACET], maxValuesPerFacet: 1000, hitsPerPage: 0 });
  const facet = r.facets?.[FACET] ?? {};
  return Object.entries(facet).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

async function crawlSlice(value: string): Promise<number> {
  // Escape embedded double quotes in the facet value for the filter string
  const safe = value.replace(/"/g, '\\"');
  const filter = `${BASE_FILTER} AND ${FACET}:"${safe}"`;

  let saved = 0;
  // Algolia paginationLimitedTo defaults to 1000 → page * hitsPerPage must stay < 1000
  const hitsPerPage = 1000;
  const r = await algolia({ query: '', filters: filter, hitsPerPage, page: 0 });
  if (r.nbHits > hitsPerPage) {
    console.warn(`  ⚠ "${value}" has ${r.nbHits} hits (>${hitsPerPage}); only first ${hitsPerPage} captured`);
  }

  for (const h of r.hits) {
    if (!h.articleNumber || !h.name || h.price == null || h.price <= 0 || h.price > 1000) continue; // skip >$1000 (parse errors)
    const priceCents = Math.round(h.price * 100);
    const category = h.categories?.[0] ?? value.split(' > ')[0] ?? null;
    await prisma.catalogItem.upsert({
      where: { chain_sourceSku: { chain: 'IGA', sourceSku: h.articleNumber } },
      create: {
        chain: 'IGA', sourceSku: h.articleNumber, name: h.name, brand: h.brand ?? null, category,
        priceCents, packageSize: parseSize(h.itemAmountValue), packageUnit: mapUnit(h.itemAmountUnit),
        inStock: h.inStock ?? true,
        url: h.pageSlug ? `https://www.iga.net/fr/product/${h.pageSlug}` : null,
      },
      update: {
        name: h.name, brand: h.brand ?? null, category, priceCents,
        packageSize: parseSize(h.itemAmountValue), packageUnit: mapUnit(h.itemAmountUnit),
        inStock: h.inStock ?? true, updatedAt: new Date(),
      },
    });
    saved++;
  }
  return saved;
}

export async function crawlIga(): Promise<void> {
  console.log(`IGA crawl (store ${STORE}) — discovering category slices...`);
  const slices = await getCategorySlices();
  const totalExpected = slices.reduce((s, x) => s + x.count, 0);
  console.log(`${slices.length} category slices, ~${totalExpected} products.\n`);

  let total = 0;
  for (let i = 0; i < slices.length; i++) {
    const { value, count } = slices[i];
    try {
      const n = await crawlSlice(value);
      total += n;
      console.log(`[${i + 1}/${slices.length}] ${value.split(' > ').slice(-1)[0]} (${count}): ${n} (total ${total})`);
    } catch (e) {
      console.warn(`[${i + 1}/${slices.length}] FAILED "${value}":`, e instanceof Error ? e.message : e);
    }
    await new Promise(r => setTimeout(r, 150)); // be polite
  }

  const dbCount = await prisma.catalogItem.count({ where: { chain: 'IGA' } });
  console.log(`\n✅ IGA crawl done. ${total} upserts, ${dbCount} total IGA catalog items.`);
}

if (process.argv[1]?.includes('iga-catalog')) {
  crawlIga().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });
}
