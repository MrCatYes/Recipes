import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FlippItem {
  id: number;
  name: string;
  current_price: number | null;
  pre_price: number | null;
  category: string | null;
  merchant_name: string;
  unit_price: string | null;
  description: string | null;
}

interface FlippResponse {
  items: FlippItem[];
}

const POSTAL_CODE = 'H2X1Y6'; // Montréal

interface ProductQuery {
  dbName: string;
  mustInclude: string[];   // item name must include at least one
  mustExclude: string[];   // item name must NOT include any
}

const PRODUCT_QUERIES: Record<string, ProductQuery> = {
  'farine tout usage': { dbName: 'Farine tout-usage',           mustInclude: ['farine'],          mustExclude: ['blé entier', 'whole wheat', 'sarrasin', 'amande', 'avoine'] },
  'sucre granulé':     { dbName: 'Sucre blanc',                 mustInclude: ['sucre'],           mustExclude: ['cassonade', 'glace', 'roux', 'brown', 'icing', 'coconut', 'coco'] },
  'beurre':            { dbName: 'Beurre non salé',             mustInclude: ['beurre', 'butter'],mustExclude: ['arachide', 'peanut', 'amande', 'almond', 'margarine'] },
  'lait 3':            { dbName: 'Lait 3,25%',                  mustInclude: ['lait', 'milk'],    mustExclude: ['chocolat', 'chocolate', 'amande', 'almond', 'avoine', 'oat', 'soya', 'coconut', 'coco', 'condensé', '1%', '2%', 'skim', 'écrémé'] },
  'crème 35':          { dbName: 'Crème 35%',                   mustInclude: ['crème', 'cream'],  mustExclude: ['glacée', 'ice', 'sure', 'sour', 'fraîche', 'café', 'coffee', '10%', '15%'] },
  'oeufs gros':        { dbName: 'Oeufs gros',                  mustInclude: ['oeuf', 'egg'],     mustExclude: ['chocolat', 'pâques', 'easter'] },
  'huile canola':      { dbName: 'Huile canola',                mustInclude: ['canola'],          mustExclude: [] },
  'huile olive':       { dbName: "Huile d'olive extra vierge",  mustInclude: ['olive'],           mustExclude: [] },
  'riz blanc':         { dbName: 'Riz blanc long grain',        mustInclude: ['riz', 'rice'],     mustExclude: ['brun', 'brown', 'sauvage', 'wild', 'instantané'] },
  'pâtes barilla':     { dbName: 'Pâtes spaghetti',             mustInclude: ['spaghetti', 'pâtes', 'pasta'], mustExclude: ['sauce', 'repas', 'meal'] },
  'poitrine poulet':   { dbName: 'Poitrine de poulet',          mustInclude: ['poulet', 'chicken'],mustExclude: ['haché', 'ground', 'aile', 'wing', 'cuisse', 'thigh', 'entier', 'whole', 'porc', 'pork'] },
  'boeuf haché maigre':{ dbName: 'Boeuf haché maigre',         mustInclude: ['boeuf', 'beef'],   mustExclude: ['bouillon', 'broth', 'sauce', 'porc', 'pork'] },
  'tomates dés boîte': { dbName: 'Tomates en dés',              mustInclude: ['tomate', 'tomato'],mustExclude: ['vigne', 'vine', 'cerise', 'cherry', 'fraîche', 'fresh', 'séché', 'dried'] },
  'pois chiches':      { dbName: 'Pois chiches en conserve',    mustInclude: ['pois chiche', 'chickpea', 'chick pea'], mustExclude: [] },
  'poudre à pâte':     { dbName: 'Levure chimique',             mustInclude: ['poudre à pâte', 'baking powder'], mustExclude: [] },
};

function parsePackageSize(raw: string): { size: number; unit: string } {
  const m = raw.match(/([\d.,]+)\s*(g|kg|ml|L|l|lb|oz)/i);
  if (!m) return { size: 1, unit: 'unit' };
  return {
    size: parseFloat(m[1].replace(',', '.')),
    unit: m[2].toLowerCase() === 'l' ? 'L' : m[2],
  };
}

async function searchFlipp(query: string, filter: ProductQuery): Promise<FlippItem[]> {
  const url = `https://backflipp.wishabi.com/flipp/items/search?locale=fr-ca&q=${encodeURIComponent(query)}&postal_code=${POSTAL_CODE}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Flipp API ${res.status}`);

  const data = await res.json() as FlippResponse;
  return (data.items ?? []).filter(item => {
    if (!item.merchant_name?.toLowerCase().includes('maxi')) return false;
    if (item.current_price == null) return false;
    const name = (item.name ?? '').toLowerCase();
    if (filter.mustInclude.length > 0 && !filter.mustInclude.some(k => name.includes(k.toLowerCase()))) return false;
    if (filter.mustExclude.some(k => name.includes(k.toLowerCase()))) return false;
    return true;
  });
}

export async function scrapeMaxiPrices(): Promise<void> {
  const store = await prisma.store.findFirst({ where: { chain: 'Maxi' } });
  if (!store) throw new Error('Maxi store not found in DB');

  let matched = 0;

  for (const [query, pq] of Object.entries(PRODUCT_QUERIES)) {
    const { dbName: productName } = pq;
    console.log(`Searching Flipp: "${query}" → ${productName}...`);
    try {
      const items = await searchFlipp(query, pq);
      console.log(`  ${items.length} Maxi items found`);

      if (items.length === 0) continue;

      // Pick cheapest Maxi result
      const best = items.sort((a, b) => (a.current_price ?? 999) - (b.current_price ?? 999))[0];
      const priceCents = Math.round((best.current_price ?? 0) * 100);
      if (priceCents <= 0) continue;

      const product = await prisma.product.findFirst({ where: { name: productName } });
      if (!product) { console.log(`  Product "${productName}" not in DB`); continue; }

      // Parse package size from unit_price or description
      const { size, unit } = parsePackageSize(best.unit_price ?? best.description ?? best.name);

      const storeProduct = await prisma.storeProduct.upsert({
        where: {
          productId_storeId_sku: {
            productId: product.id,
            storeId: store.id,
            sku: String(best.id),
          },
        },
        create: {
          productId: product.id,
          storeId: store.id,
          sku: String(best.id),
          packageSize: size,
          packageUnit: unit,
        },
        update: { lastSeenAt: new Date() },
      });

      await prisma.price.create({
        data: {
          storeProductId: storeProduct.id,
          priceCents,
          source: 'flyer',
        },
      });

      matched++;
      console.log(`  ✓ ${productName}: $${(priceCents / 100).toFixed(2)} (${best.name})`);

      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`  Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nDone. Matched ${matched}/${Object.keys(PRODUCT_QUERIES).length} products.`);
  await prisma.$disconnect();
}

scrapeMaxiPrices().catch(console.error);
