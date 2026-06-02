import { PrismaClient, StoreChain } from '@prisma/client';

const prisma = new PrismaClient();

const POSTAL_CODE = 'H2X1Y6';

interface FlippItem {
  id: number;
  name: string;
  current_price: number | null;
  pre_price: number | null;
  category: string | null;
  merchant_name: string;
  unit_price: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

interface FlippResponse {
  items: FlippItem[];
}

// Merchant name → StoreChain
const MERCHANT_MAP: Record<string, StoreChain> = {
  'maxi':    'Maxi',
  'iga':     'IGA',
  'metro':   'Metro',
  'super c': 'Maxi', // Super C owned by Metro, closest match
  'walmart': 'Walmart',
};

interface ProductQuery {
  dbName: string;
  mustInclude: string[];
  mustExclude: string[];
}

const PRODUCT_QUERIES: Record<string, ProductQuery> = {
  'farine':             { dbName: 'Farine tout-usage',           mustInclude: ['farine', 'flour'],       mustExclude: ['blé entier', 'whole wheat', 'sarrasin', 'amande', 'avoine', 'riz'] },
  'sucre':              { dbName: 'Sucre blanc',                 mustInclude: ['sucre', 'sugar'],        mustExclude: ['cassonade', 'glace', 'roux', 'brown', 'icing', 'coconut', 'coco', 'érable', 'maple'] },
  'beurre':             { dbName: 'Beurre non salé',             mustInclude: ['beurre', 'butter'],      mustExclude: ['arachide', 'peanut', 'amande', 'almond', 'margarine', 'ghee'] },
  'lait':               { dbName: 'Lait 3,25%',                  mustInclude: ['lait', 'milk'],          mustExclude: ['chocolat', 'chocolate', 'amande', 'almond', 'avoine', 'oat', 'soya', 'coconut', 'coco', 'condensé', '1%', '2%', 'skim', 'écrémé', 'frappé', 'sans lactose'] },
  'crème':              { dbName: 'Crème 35%',                   mustInclude: ['crème', 'cream'],        mustExclude: ['glacée', 'ice', 'sure', 'sour', 'fraîche', 'café', 'coffee', '10%', '15%', 'coco', 'coconut'] },
  'oeufs':              { dbName: 'Oeufs gros',                  mustInclude: ['oeuf', 'egg'],           mustExclude: ['chocolat', 'pâques', 'easter', 'substitute'] },
  'huile canola':       { dbName: 'Huile canola',                mustInclude: ['canola'],                mustExclude: [] },
  'huile olive':        { dbName: "Huile d'olive extra vierge",  mustInclude: ['olive'],                 mustExclude: ['tapenade', 'antipasto'] },
  'riz blanc':          { dbName: 'Riz blanc long grain',        mustInclude: ['riz', 'rice'],           mustExclude: ['brun', 'brown', 'sauvage', 'wild', 'instantané', 'instant', 'arborio'] },
  'spaghetti':          { dbName: 'Pâtes spaghetti',             mustInclude: ['spaghetti', 'pâtes', 'pasta', 'barilla'], mustExclude: ['sauce', 'repas', 'meal', 'soup'] },
  'poulet':             { dbName: 'Poitrine de poulet',          mustInclude: ['poulet', 'chicken'],     mustExclude: ['haché', 'ground', 'aile', 'wing', 'cuisse', 'thigh', 'entier', 'whole', 'porc', 'pork', 'nugget', 'bouillon', 'broth'] },
  'boeuf haché':        { dbName: 'Boeuf haché maigre',          mustInclude: ['boeuf', 'beef'],         mustExclude: ['bouillon', 'broth', 'sauce', 'porc', 'pork', 'veau', 'veal'] },
  'tomates conserve':   { dbName: 'Tomates en dés',              mustInclude: ['tomate', 'tomato'],      mustExclude: ['vigne', 'vine', 'cerise', 'cherry', 'fraîche', 'fresh', 'séché', 'dried', 'sauce', 'pâte', 'paste', 'ketchup'] },
  'pois chiches':       { dbName: 'Pois chiches en conserve',    mustInclude: ['pois chiche', 'chickpea', 'chick pea'], mustExclude: [] },
  'poudre à pâte':      { dbName: 'Levure chimique',             mustInclude: ['poudre à pâte', 'baking powder'], mustExclude: [] },
};

async function searchFlipp(query: string): Promise<FlippItem[]> {
  const url = `https://backflipp.wishabi.com/flipp/items/search?locale=fr-ca&q=${encodeURIComponent(query)}&postal_code=${POSTAL_CODE}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Flipp ${res.status}`);
  const data = await res.json() as FlippResponse;
  return data.items ?? [];
}

function matchesMerchant(merchantName: string): StoreChain | null {
  const lower = merchantName.toLowerCase();
  for (const [key, chain] of Object.entries(MERCHANT_MAP)) {
    if (lower.includes(key)) return chain;
  }
  return null;
}

function filterItems(items: FlippItem[], pq: ProductQuery): FlippItem[] {
  return items.filter(item => {
    if (item.current_price == null) return false;
    const name = (item.name ?? '').toLowerCase();
    if (pq.mustInclude.length > 0 && !pq.mustInclude.some(k => name.includes(k.toLowerCase()))) return false;
    if (pq.mustExclude.some(k => name.includes(k.toLowerCase()))) return false;
    return true;
  });
}

function parsePackageSize(raw: string): { size: number; unit: string } {
  const m = raw.match(/([\d.,]+)\s*(g|kg|ml|L|l|lb|oz)/i);
  if (!m) return { size: 1, unit: 'unit' };
  return { size: parseFloat(m[1].replace(',', '.')), unit: m[2].toLowerCase() === 'l' ? 'L' : m[2] };
}

function getWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function scrapeFlyer(): Promise<void> {
  const weekOf = getWeekMonday();
  console.log(`Scraping flyers for week of ${weekOf.toISOString().split('T')[0]}...\n`);

  // Load stores
  const stores = await prisma.store.findMany();
  const storeByChain = new Map(stores.map(s => [s.chain, s]));

  let totalMatched = 0;

  for (const [query, pq] of Object.entries(PRODUCT_QUERIES)) {
    console.log(`🔍 "${query}" → ${pq.dbName}`);
    try {
      const allItems = await searchFlipp(query);
      const filtered = filterItems(allItems, pq);

      // Group by chain, keep cheapest
      const byChain = new Map<StoreChain, FlippItem>();
      for (const item of filtered) {
        const chain = matchesMerchant(item.merchant_name);
        if (!chain) continue;
        const existing = byChain.get(chain);
        if (!existing || (item.current_price ?? 999) < (existing.current_price ?? 999)) {
          byChain.set(chain, item);
        }
      }

      const product = await prisma.product.findFirst({ where: { name: pq.dbName } });
      if (!product) { console.log(`  ⚠ Product "${pq.dbName}" not in DB\n`); continue; }

      for (const [chain, item] of byChain) {
        const store = storeByChain.get(chain);
        if (!store) continue;

        const promoCents = Math.round((item.current_price ?? 0) * 100);
        const regularCents = item.pre_price ? Math.round(item.pre_price * 100) : null;
        const isPromo = regularCents != null && promoCents < regularCents;

        // Upsert FlyerItem
        await prisma.flyerItem.create({
          data: {
            storeId: store.id,
            productId: product.id,
            rawText: item.name,
            promoPriceCents: promoCents,
            regularPriceCents: regularCents,
            weekOf,
          },
        });

        // Also update StoreProduct price
        const { size, unit } = parsePackageSize(item.unit_price ?? item.description ?? item.name);
        const sp = await prisma.storeProduct.upsert({
          where: { productId_storeId_sku: { productId: product.id, storeId: store.id, sku: `flyer-${item.id}` } },
          create: { productId: product.id, storeId: store.id, sku: `flyer-${item.id}`, packageSize: size, packageUnit: unit },
          update: { lastSeenAt: new Date() },
        });
        await prisma.price.create({
          data: { storeProductId: sp.id, priceCents: promoCents, source: 'flyer' },
        });

        totalMatched++;
        console.log(`  ✓ ${chain}: $${(promoCents / 100).toFixed(2)}${isPromo ? ` 🔥 (régulier $${(regularCents! / 100).toFixed(2)})` : ''} — ${item.name}`);
      }

      console.log('');
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`  ✗ Error: ${e instanceof Error ? e.message : e}\n`);
    }
  }

  console.log(`\n✅ Done. ${totalMatched} flyer prices saved.`);
  await prisma.$disconnect();
}

scrapeFlyer().catch(console.error);
