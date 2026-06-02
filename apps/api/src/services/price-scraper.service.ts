/**
 * Price Scraper Service
 * - Fetches weekly flyer prices from Flipp API (Maxi, IGA, Metro, Super C, Walmart)
 * - Stores prices in DB with source=flyer
 * - Designed to run daily via cron
 */

import { PrismaClient, type StoreChain } from '@prisma/client';
import { matchesProduct } from './product-matcher';

const prisma = new PrismaClient();

const POSTAL_CODE = 'H2X1Y6'; // Montréal

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlippItem {
  id: number;
  name: string;
  current_price: number | null;
  pre_price: number | null;
  merchant_name: string;
  unit_price: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

interface FlippResponse {
  items: FlippItem[];
}

// ─── Merchant → StoreChain mapping ───────────────────────────────────────────

const MERCHANT_CHAIN: Array<{ keyword: string; chain: StoreChain }> = [
  { keyword: 'maxi',    chain: 'Maxi' },
  { keyword: 'iga',     chain: 'IGA' },
  { keyword: 'metro',   chain: 'Metro' },
  { keyword: 'super c', chain: 'Maxi' }, // Super C = Metro discount banner
  { keyword: 'walmart', chain: 'Walmart' },
];

function resolveChain(merchantName: string): StoreChain | null {
  const lower = merchantName.toLowerCase();
  return MERCHANT_CHAIN.find(m => lower.includes(m.keyword))?.chain ?? null;
}

// ─── Product query definitions ────────────────────────────────────────────────

interface ProductQuery {
  dbName: string;
  queries: string[];         // multiple search terms to try
  mustInclude: string[];     // at least one must be in item name
  mustExclude: string[];     // none must be in item name
}

const PRODUCT_QUERIES: ProductQuery[] = [
  {
    dbName: 'Farine tout-usage',
    queries: ['farine', 'farine tout usage', 'flour'],
    mustInclude: ['farine', 'flour'],
    mustExclude: ['blé entier', 'whole wheat', 'sarrasin', 'amande', 'avoine', 'riz', 'sans gluten'],
  },
  {
    dbName: 'Sucre blanc',
    queries: ['sucre granulé', 'sucre blanc'],
    mustInclude: ['sucre', 'sugar'],
    mustExclude: ['cassonade', 'glace', 'roux', 'brown', 'icing', 'coconut', 'coco', 'érable', 'maple', 'vanille'],
  },
  {
    dbName: 'Beurre non salé',
    queries: ['beurre', 'butter'],
    mustInclude: ['beurre', 'butter'],
    mustExclude: ['arachide', 'peanut', 'amande', 'almond', 'margarine', 'ghee', 'cacao'],
  },
  {
    dbName: 'Lait 3,25%',
    queries: ['lait 3.25', 'lait homogénéisé', 'milk 3.25'],
    mustInclude: ['lait', 'milk'],
    mustExclude: ['chocolat', 'chocolate', 'amande', 'almond', 'avoine', 'oat', 'soya', 'coconut', 'coco', 'condensé', '1%', '2%', 'skim', 'écrémé', 'frappé', 'sans lactose', 'lactose'],
  },
  {
    dbName: 'Crème 35%',
    queries: ['crème 35', 'cream 35', 'whipping cream'],
    mustInclude: ['crème', 'cream'],
    mustExclude: ['glacée', 'ice', 'sure', 'sour', 'fraîche', 'café', 'coffee', '10%', '15%', 'coco', 'coconut'],
  },
  {
    dbName: 'Oeufs gros',
    queries: ['oeufs gros', 'large eggs', 'oeufs blancs'],
    mustInclude: ['oeuf', 'egg'],
    mustExclude: ['chocolat', 'pâques', 'easter', 'substitute', 'liquide'],
  },
  {
    dbName: 'Huile canola',
    queries: ['huile canola', 'canola oil'],
    mustInclude: ['canola'],
    mustExclude: [],
  },
  {
    dbName: "Huile d'olive extra vierge",
    queries: ['huile olive', 'olive oil'],
    mustInclude: ['olive'],
    mustExclude: ['tapenade', 'antipasto', 'marinade'],
  },
  {
    dbName: 'Riz blanc long grain',
    queries: ['riz blanc', 'white rice', 'long grain rice'],
    mustInclude: ['riz', 'rice'],
    mustExclude: ['brun', 'brown', 'sauvage', 'wild', 'instantané', 'instant', 'arborio', 'jasmin'],
  },
  {
    dbName: 'Pâtes spaghetti',
    queries: ['spaghetti', 'pâtes barilla', 'pasta'],
    mustInclude: ['spaghetti', 'pâtes', 'pasta', 'barilla'],
    mustExclude: ['sauce', 'repas', 'meal', 'soupe', 'soup'],
  },
  {
    dbName: 'Poitrine de poulet',
    queries: ['poitrine poulet', 'chicken breast'],
    mustInclude: ['poulet', 'chicken'],
    mustExclude: ['haché', 'ground', 'aile', 'wing', 'cuisse', 'thigh', 'entier', 'whole', 'nugget', 'bouillon', 'broth', 'porc', 'pork'],
  },
  {
    dbName: 'Boeuf haché maigre',
    queries: ['boeuf haché', 'ground beef', 'boeuf haché maigre'],
    mustInclude: ['boeuf', 'beef'],
    mustExclude: ['bouillon', 'broth', 'sauce', 'veau', 'veal'],
  },
  {
    dbName: 'Tomates en dés',
    queries: ['tomates dés', 'diced tomatoes', 'tomates conserve'],
    mustInclude: ['tomate', 'tomato'],
    mustExclude: ['vigne', 'vine', 'cerise', 'cherry', 'fraîche', 'fresh', 'séché', 'dried', 'sauce', 'pâte', 'paste', 'ketchup'],
  },
  {
    dbName: 'Pois chiches en conserve',
    queries: ['pois chiches', 'chickpeas'],
    mustInclude: ['pois chiche', 'chickpea', 'chick pea'],
    mustExclude: [],
  },
  {
    dbName: 'Levure chimique',
    queries: ['poudre à pâte', 'baking powder'],
    mustInclude: ['poudre à pâte', 'baking powder'],
    mustExclude: [],
  },
];

// ─── Flipp API ────────────────────────────────────────────────────────────────

async function fetchFlipp(query: string): Promise<FlippItem[]> {
  const url = `https://backflipp.wishabi.com/flipp/items/search?locale=fr-ca&q=${encodeURIComponent(query)}&postal_code=${POSTAL_CODE}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Flipp ${res.status} for "${query}"`);
  const data = await res.json() as FlippResponse;
  return data.items ?? [];
}

// Strict validation via shared keyword matcher (rejects wrong-category items)
function filterItems(items: FlippItem[], pq: ProductQuery): FlippItem[] {
  return items.filter(item => {
    if (item.current_price == null || item.current_price <= 0) return false;
    return matchesProduct(item.name ?? '', pq.dbName);
  });
}

// ─── Package size parser ──────────────────────────────────────────────────────

function parsePackageSize(raw: string): { size: number; unit: string } {
  const m = raw.match(/([\d.,]+)\s*(g|kg|ml|L|l|lb|oz)/i);
  if (!m) return { size: 1, unit: 'unit' };
  return {
    size: parseFloat(m[1].replace(',', '.')),
    unit: m[2].toLowerCase() === 'l' ? 'L' : m[2],
  };
}

function getWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

export async function scrapeAllPrices(): Promise<{ matched: number; total: number }> {
  const weekOf = getWeekMonday();
  const stores = await prisma.store.findMany();
  const storeByChain = new Map(stores.map(s => [s.chain as string, s]));

  let matched = 0;
  let total = 0;

  for (const pq of PRODUCT_QUERIES) {
    const product = await prisma.product.findFirst({ where: { name: pq.dbName } });
    if (!product) {
      console.warn(`[scraper] Product "${pq.dbName}" not in DB`);
      continue;
    }

    // Try each query term, merge results
    const allItems: FlippItem[] = [];
    const seenIds = new Set<number>();

    for (const query of pq.queries) {
      try {
        const items = await fetchFlipp(query);
        for (const item of items) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            allItems.push(item);
          }
        }
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        console.warn(`[scraper] Flipp error for "${query}":`, e instanceof Error ? e.message : e);
      }
    }

    const filtered = filterItems(allItems, pq);
    total += filtered.length;

    // Group by chain, keep cheapest
    const bestByChain = new Map<string, FlippItem>();
    for (const item of filtered) {
      const chain = resolveChain(item.merchant_name);
      if (!chain) continue;
      const existing = bestByChain.get(chain);
      if (!existing || (item.current_price ?? 999) < (existing.current_price ?? 999)) {
        bestByChain.set(chain, item);
      }
    }

    for (const [chain, item] of bestByChain) {
      const store = storeByChain.get(chain);
      if (!store) continue;

      const priceCents = Math.round((item.current_price ?? 0) * 100);
      if (priceCents <= 0) continue;

      const isPromo = item.pre_price != null && item.pre_price > item.current_price!;
      const regularCents = item.pre_price ? Math.round(item.pre_price * 100) : null;
      const { size, unit } = parsePackageSize(
        item.unit_price ?? item.description ?? item.name
      );

      // Upsert StoreProduct
      const sp = await prisma.storeProduct.upsert({
        where: {
          productId_storeId_sku: {
            productId: product.id,
            storeId: store.id,
            sku: `flipp-${product.id}-${chain}`,
          },
        },
        create: {
          productId: product.id,
          storeId: store.id,
          sku: `flipp-${product.id}-${chain}`,
          packageSize: size,
          packageUnit: unit,
        },
        update: { packageSize: size, packageUnit: unit, lastSeenAt: new Date() },
      });

      // Insert new price record
      await prisma.price.create({
        data: {
          storeProductId: sp.id,
          priceCents,
          source: 'flyer',
          validFrom: weekOf,
          validTo: new Date(weekOf.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Upsert FlyerItem — delete old for this product/store/week, then insert fresh
      await prisma.flyerItem.deleteMany({
        where: { storeId: store.id, productId: product.id, weekOf },
      });
      await prisma.flyerItem.create({
        data: {
          storeId: store.id,
          productId: product.id,
          rawText: item.name,
          promoPriceCents: priceCents,
          regularPriceCents: isPromo ? regularCents : null,
          weekOf,
        },
      });

      matched++;
      console.log(
        `[scraper] ${chain} ${pq.dbName}: $${(priceCents / 100).toFixed(2)}` +
        (isPromo ? ` 🔥 (reg $${((regularCents ?? 0) / 100).toFixed(2)})` : '') +
        ` — ${item.name}`
      );
    }
  }

  console.log(`[scraper] Done. ${matched} prices saved (${total} raw items).`);
  return { matched, total };
}
