/**
 * Playwright-based grocery scraper
 * Scrapes Maxi, IGA, Metro for real catalog prices
 * Uses fuzzy matching to map scraped products → DB products
 */

import { chromium, type Page } from 'playwright';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScrapedProduct {
  name: string;
  brand: string | null;
  priceCents: number;
  packageSize: number;
  packageUnit: string;
  isPromo: boolean;
  regularPriceCents: number | null;
}

// ─── Package size parser ──────────────────────────────────────────────────────

function parsePackageSize(raw: string): { size: number; unit: string } {
  const m = raw.match(/([\d.,\s]+)\s*(g|kg|ml|L|l|lb|oz)\b/i);
  if (!m) return { size: 1, unit: 'unit' };
  const size = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(size) || size <= 0) return { size: 1, unit: 'unit' };
  return {
    size,
    unit: m[2].toLowerCase() === 'l' ? 'L' : m[2],
  };
}

function parsePriceCents(raw: string): number {
  const m = raw.replace(/\s/g, '').match(/[\d.,]+/);
  if (!m) return 0;
  return Math.round(parseFloat(m[0].replace(',', '.')) * 100);
}

// ─── Maxi scraper ─────────────────────────────────────────────────────────────

const MAXI_CATEGORIES = [
  // Laitiers
  'https://www.maxi.ca/fr/alimentation/produits-laitiers-et-ufs/lait-et-cr-me/lait-ordinaire/c/29789',
  'https://www.maxi.ca/fr/alimentation/produits-laitiers-et-ufs/lait-et-cr-me/cr-me-et-colorants-caf/c/29788',
  'https://www.maxi.ca/fr/alimentation/produits-laitiers-et-ufs/beurre-et-tartinades/beurre/c/29776',
  'https://www.maxi.ca/fr/alimentation/produits-laitiers-et-ufs/ufs-et-succ-dan-s-d-ufs/ufs-entiers/c/29781',
  // Épicerie
  'https://www.maxi.ca/fr/alimentation/garde-manger/essentiels-de-cuisson/farines/c/29695',
  'https://www.maxi.ca/fr/alimentation/garde-manger/essentiels-de-cuisson/sucre-et-dulcorants/c/29878',
  'https://www.maxi.ca/fr/alimentation/garde-manger/essentiels-de-cuisson/bicarbonate-de-soude-poudre-et-levure/c/29696',
  'https://www.maxi.ca/fr/alimentation/garde-manger/huile-et-vinaigre/huiles-v-g-tales/c/29906',
  'https://www.maxi.ca/fr/alimentation/garde-manger/huile-et-vinaigre/huiles-d-olive/c/29907',
  'https://www.maxi.ca/fr/alimentation/garde-manger/riz/grains-longs/c/29682',
  'https://www.maxi.ca/fr/alimentation/garde-manger/p-tes-et-sauce-pour-p-tes/p-tes-s-ches/c/29680',
  'https://www.maxi.ca/fr/alimentation/garde-manger/produits-en-conserve-et-marin-s/tomates-et-l-gumes-en-conserve/c/29887',
  'https://www.maxi.ca/fr/alimentation/garde-manger/produits-en-conserve-et-marin-s/haricots-en-conserve/c/29882',
  'https://www.maxi.ca/fr/alimentation/garde-manger/pices-et-assaisonnements/sels/c/29707',
  // Viande
  'https://www.maxi.ca/fr/alimentation/viande/b-uf/boeuf-hach-et-galettes/c/29766',
  'https://www.maxi.ca/fr/alimentation/viande/poulet-et-dinde/poitrines-de-poulet/c/29768',
];

async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("OK")',
    'button:has-text("Tout Accepter")',
    'button:has-text("Tout accepter")',
    'button:has-text("Accept")',
    'button:has-text("Accepter")',
    '#onetrust-accept-btn-handler',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(800);
      return;
    }
  }
}

async function scrapeMaxi(page: Page): Promise<ScrapedProduct[]> {
  const results: ScrapedProduct[] = [];

  // First visit homepage to set cookie
  await page.goto('https://www.maxi.ca/fr/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);
  await dismissCookieBanner(page);

  for (const url of MAXI_CATEGORIES) {
    console.log(`[Maxi] Scraping: ${url.split('/').slice(-3, -1).join('/')}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);
      await dismissCookieBanner(page);

      // Wait for products to appear
      await page.waitForSelector('[data-testid="product-title"]', { timeout: 8000 }).catch(() => {});

      // Scroll to trigger lazy load of all products
      for (let i = 1; i <= 5; i++) {
        await page.evaluate((pct) => window.scrollTo(0, document.body.scrollHeight * pct), i * 0.2);
        await page.waitForTimeout(700);
      }

      const products = await page.evaluate(() => {
        const items: Array<{ name: string; brand: string | null; price: string; salePrice: string | null; wasPrice: string | null; size: string }> = [];

        // Collect ALL product titles across the whole page (sponsored + category)
        const titles = document.querySelectorAll('[data-testid="product-title"]');
        titles.forEach(titleEl => {
          // The <li> ancestor is the full tile (contains price)
          const tile = titleEl.closest('li') ?? titleEl.closest('[class*="linkbox"]');
          if (!tile) return;

          const name = titleEl.textContent?.trim() ?? '';
          const brand = tile.querySelector('[data-testid="product-brand"]')?.textContent?.trim() ?? null;

          // Price variants: regular-price (clean) | sale-price + was-price (promo)
          const regularPrice = tile.querySelector('[data-testid="regular-price"]')?.textContent?.trim() ?? '';
          const salePrice = tile.querySelector('[data-testid="sale-price"]')?.textContent?.trim() ?? null;
          const wasPrice = tile.querySelector('[data-testid="was-price"]')?.textContent?.trim() ?? null;

          const size = tile.querySelector('[data-testid="product-package-size"]')?.textContent?.trim() ?? '';

          // Use sale price if present, else regular
          const price = salePrice ?? regularPrice;
          if (name && price) items.push({ name, brand, price, salePrice, wasPrice, size });
        });

        return items;
      });

      for (const p of products) {
        const priceCents = parsePriceCents(p.price);
        if (priceCents <= 0) continue;
        const regularCents = p.wasPrice ? parsePriceCents(p.wasPrice) : null;
        const { size, unit } = parsePackageSize(p.size || p.name);
        results.push({
          name: p.name,
          brand: p.brand,
          priceCents,
          packageSize: size,
          packageUnit: unit,
          isPromo: p.salePrice != null,
          regularPriceCents: regularCents,
        });
      }

      console.log(`  → ${products.length} products found`);
      await page.waitForTimeout(800);
    } catch (e) {
      console.warn(`  → Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  return results;
}

// ─── IGA scraper ──────────────────────────────────────────────────────────────

const IGA_SEARCH_QUERIES = [
  'lait 3.25%', 'oeufs', 'beurre', 'crème 35%',
  'farine', 'sucre', 'huile canola', 'huile olive',
  'riz blanc', 'spaghetti', 'poitrine poulet', 'boeuf haché',
  'tomates dés', 'pois chiches', 'sel', 'poudre à pâte',
];

async function dismissIgaModals(page: Page): Promise<void> {
  // Cookie banner
  await dismissCookieBanner(page);
  // "Comment voulez-vous magasiner" modal — close via X or pick "Parcourir et planifier"
  const closeBtn = page.locator('button[aria-label*="ermer"], button[aria-label*="lose"], button:has-text("Parcourir et planifier")').first();
  if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function scrapeIGA(page: Page): Promise<ScrapedProduct[]> {
  const results: ScrapedProduct[] = [];

  // New IGA site is iga.ca (redirected from iga.net)
  await page.goto('https://www.iga.ca/fr', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2500);
  await dismissIgaModals(page);

  for (const query of IGA_SEARCH_QUERIES) {
    const url = `https://www.iga.ca/fr/search?q=${encodeURIComponent(query)}`;
    console.log(`[IGA] Searching: "${query}"`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3500);
      await dismissIgaModals(page);
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForTimeout(1500);

      const products = await page.evaluate(() => {
        const items: Array<{ name: string; brand: string | null; price: string; salePrice: string | null; wasPrice: string | null; size: string }> = [];

        // iga.ca uses Tailwind. Product cards are links containing a name + price spans.
        // Find product cards: anchors/divs that contain a price span
        const cards = document.querySelectorAll('a[href*="/produit"], a[href*="/product"], [class*="product"], li');

        cards.forEach(card => {
          // Name: usually the longest text node or a heading-like element
          const nameEl = card.querySelector('[class*="name"], h2, h3, h4, p[class*="title"]')
            ?? [...card.querySelectorAll('span, p')].find(e => (e.textContent?.trim().length ?? 0) > 10 && !/\$/.test(e.textContent ?? ''));
          const name = nameEl?.textContent?.trim() ?? '';
          if (!name || name.length < 4) return;

          // Promo price = text-brandRed; was = line-through; normal = font-bold text-body
          const promoEl = card.querySelector('[class*="brandRed"]');
          const wasEl = card.querySelector('[class*="line-through"]');
          const normalEls = [...card.querySelectorAll('span')].filter(e =>
            /^\$?\s*\d+[.,]\d{2}\s*\$?$/.test(e.textContent?.trim() ?? '')
          );

          const salePrice = promoEl?.textContent?.trim() ?? null;
          const wasPrice = wasEl?.textContent?.trim() ?? null;
          const normalPrice = normalEls[0]?.textContent?.trim() ?? '';

          const price = salePrice ?? normalPrice;
          if (!price) return;

          const size = [...card.querySelectorAll('span, p')]
            .map(e => e.textContent?.trim() ?? '')
            .find(t => /\d+\s*(g|kg|ml|l|lb|oz)\b/i.test(t)) ?? '';

          items.push({ name, brand: null, price, salePrice, wasPrice, size });
        });

        // Dedup by name
        const seen = new Set<string>();
        return items.filter(i => {
          const k = i.name.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      });

      for (const p of products.slice(0, 12)) {
        const priceCents = parsePriceCents(p.price);
        if (priceCents <= 0) continue;
        const regularCents = p.wasPrice ? parsePriceCents(p.wasPrice) : null;
        const { size, unit } = parsePackageSize(p.size || p.name);
        results.push({
          name: p.name,
          brand: p.brand,
          priceCents,
          packageSize: size,
          packageUnit: unit,
          isPromo: p.salePrice != null,
          regularPriceCents: regularCents,
        });
      }

      console.log(`  → ${products.length} products found`);
      await page.waitForTimeout(1000);
    } catch (e) {
      console.warn(`  → Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  return results;
}

// ─── Metro scraper ────────────────────────────────────────────────────────────

async function scrapeMetro(page: Page): Promise<ScrapedProduct[]> {
  const results: ScrapedProduct[] = [];

  // First visit to accept cookies
  await page.goto('https://www.metro.ca/fr/epicerie-en-ligne', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);
  await dismissCookieBanner(page);
  await page.waitForTimeout(1000);

  for (const query of IGA_SEARCH_QUERIES) {
    const url = `https://www.metro.ca/fr/epicerie-en-ligne/recherche?filter=${encodeURIComponent(query)}`;
    console.log(`[Metro] Searching: "${query}"`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);
      await dismissCookieBanner(page);

      // Scroll to load products
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(1500);

      const products = await page.evaluate(() => {
        const items: Array<{ name: string; brand: string | null; price: string; wasPrice: string | null; size: string }> = [];

        // Metro uses .default-product-tile or similar
        const tiles = document.querySelectorAll(
          '.default-product-tile, [class*="product-tile"], [class*="ProductTile"], [class*="product-card"]'
        );

        tiles.forEach(el => {
          const name = el.querySelector('[class*="product-name"], [class*="title"], h3, h4, .title-product')?.textContent?.trim() ?? '';
          const brand = el.querySelector('[class*="brand"], .brand')?.textContent?.trim() ?? null;
          // Metro price: look for $ pattern
          const allText = [...el.querySelectorAll('*')]
            .map(e => e.childNodes)
            .reduce((a, b) => [...a, ...b], [])
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent?.trim() ?? '')
            .filter(t => /^\$?\d+[.,]\d{2}$/.test(t));

          const price = allText[0] ?? el.querySelector('[class*="price"]:not([class*="was"]):not(s)')?.textContent?.trim() ?? '';
          const wasPrice = el.querySelector('[class*="was"], s, [class*="regular"]')?.textContent?.trim() ?? null;
          const size = el.querySelector('[class*="size"], [class*="format"], [class*="weight"], [class*="package"]')?.textContent?.trim() ?? '';

          if (name && price) items.push({ name, brand, price, wasPrice, size });
        });

        return items;
      });

      for (const p of products.slice(0, 6)) {
        const priceCents = parsePriceCents(p.price);
        if (priceCents <= 0) continue;
        const regularCents = p.wasPrice ? parsePriceCents(p.wasPrice) : null;
        const { size, unit } = parsePackageSize(p.size || p.name);
        results.push({
          name: p.name,
          brand: p.brand,
          priceCents,
          packageSize: size,
          packageUnit: unit,
          isPromo: regularCents != null && priceCents < regularCents,
          regularPriceCents: regularCents,
        });
      }

      console.log(`  → ${products.length} products found`);
      await page.waitForTimeout(1000);
    } catch (e) {
      console.warn(`  → Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  return results;
}

// ─── Keyword-rule matcher ─────────────────────────────────────────────────────

interface DBProduct { id: string; name: string; category: string }

// Per-DB-product matching rules: scraped name must contain ≥1 mustInclude, 0 mustExclude
const MATCH_RULES: Record<string, { mustInclude: string[]; mustExclude: string[] }> = {
  'Farine tout-usage':          { mustInclude: ['farine tout usage', 'farine tout-usage', 'all purpose flour', 'all-purpose flour'], mustExclude: ['blé entier', 'whole wheat', 'sarrasin', 'amande', 'avoine', 'gâteau', 'cake', 'sans gluten', 'gluten free', 'épeautre'] },
  'Sucre blanc':                { mustInclude: ['sucre granulé', 'sucre blanc', 'granulated sugar', 'white sugar', 'sucre à fruits'], mustExclude: ['cassonade', 'glace', 'icing', 'brown', 'roux', 'érable', 'maple', 'coco', 'vanille', 'substitut'] },
  'Beurre non salé':            { mustInclude: ['beurre non salé', 'unsalted butter', 'beurre doux'], mustExclude: ['arachide', 'peanut', 'amande', 'almond', 'margarine', 'cacao', 'salé', 'salted', 'ail', 'garlic'] },
  'Lait 3,25%':                 { mustInclude: ['lait 3,25', 'lait 3.25', 'milk 3.25', 'lait homogénéisé', 'lait entier', 'whole milk'], mustExclude: ['chocolat', 'chocolate', 'amande', 'almond', 'avoine', 'oat', 'soya', 'soy', 'coco', 'condensé', '1 %', '2 %', '1%', '2%', 'écrémé', 'skim', 'frappé', 'lactose', 'cacao'] },
  'Crème 35%':                  { mustInclude: ['crème 35', 'cream 35', 'crème à fouetter', 'whipping cream', 'crème épaisse'], mustExclude: ['10 %', '15 %', '10%', '15%', 'sure', 'sour', 'café', 'coffee', 'glacée', 'ice', 'coco', 'fouettée'] },
  'Oeufs gros':                 { mustInclude: ['oeufs gros', 'œufs gros', 'gros oeufs', 'large eggs', 'oeufs blancs gros', 'oeufs calibre gros', 'lot de 12 ufs', 'lot de 12 œufs'], mustExclude: ['liquide', 'liquid', 'blancs d', 'chocolat', 'caille', 'substitut'] },
  'Huile canola':               { mustInclude: ['huile de canola', 'huile canola', 'canola oil'], mustExclude: ['mélange', 'blend', 'spray', 'enduit'] },
  "Huile d'olive extra vierge": { mustInclude: ["huile d'olive", 'olive oil'], mustExclude: ['tapenade', 'antipasto', 'marinade', 'spray', 'enduit', 'pomace'] },
  'Riz blanc long grain':       { mustInclude: ['riz blanc', 'riz à grain long', 'riz grain long', 'long grain rice', 'white rice', 'riz long'], mustExclude: ['brun', 'brown', 'sauvage', 'wild', 'instantané', 'instant', 'arborio', 'basmati', 'jasmin', 'jasmine', 'assaisonné'] },
  'Pâtes spaghetti':            { mustInclude: ['spaghetti', 'spaghettini'], mustExclude: ['sauce', 'repas', 'meal', 'soupe', 'soup', 'courge', 'squash', 'sans gluten', 'gluten free'] },
  'Poitrine de poulet':         { mustInclude: ['poitrine de poulet', 'poitrines de poulet', 'chicken breast', 'haut de poitrine'], mustExclude: ['haché', 'ground', 'aile', 'wing', 'cuisse', 'thigh', 'entier', 'whole', 'nugget', 'pané', 'breaded', 'bouillon', 'broth', 'porc', 'pork', 'tofu'] },
  'Boeuf haché maigre':         { mustInclude: ['boeuf haché', 'bœuf haché', 'ground beef', 'boeuf hach', 'bœuf hach'], mustExclude: ['porc', 'pork', 'poulet', 'chicken', 'dinde', 'turkey', 'veau', 'veal', 'végé', 'plant', 'bouillon', 'sauce'] },
  'Tomates en dés':             { mustInclude: ['tomates en dés', 'diced tomatoes', 'tomates en conserve', 'canned tomatoes', 'tomates étuvées'], mustExclude: ['vigne', 'vine', 'cerise', 'cherry', 'fraîche', 'fresh', 'séché', 'dried', 'pâte', 'paste', 'ketchup', 'jus', 'juice', 'soupe', 'soup', 'sauce'] },
  'Pois chiches en conserve':   { mustInclude: ['pois chiches', 'chickpea', 'chick pea', 'garbanzo'], mustExclude: ['rôtis', 'roasted', 'collation', 'snack', 'farine', 'flour', 'houmous', 'hummus'] },
  'Levure chimique':            { mustInclude: ['poudre à pâte', 'baking powder', 'poudre à lever'], mustExclude: ['bicarbonate', 'baking soda', 'levure de bière', 'yeast'] },
};

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
}

function ruleMatch(scrapedName: string, dbProducts: DBProduct[]): DBProduct | null {
  const name = normalize(scrapedName);

  for (const db of dbProducts) {
    const rule = MATCH_RULES[db.name];
    if (!rule) continue;

    const inc = rule.mustInclude.some(k => name.includes(normalize(k)));
    if (!inc) continue;

    const exc = rule.mustExclude.some(k => name.includes(normalize(k)));
    if (exc) continue;

    return db;
  }
  return null;
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

async function savePrice(
  product: DBProduct,
  storeId: string,
  chain: string,
  scraped: ScrapedProduct,
): Promise<void> {
  const sku = `playwright-${product.id}-${chain}`;

  const sp = await prisma.storeProduct.upsert({
    where: { productId_storeId_sku: { productId: product.id, storeId, sku } },
    create: {
      productId: product.id,
      storeId,
      sku,
      packageSize: scraped.packageSize,
      packageUnit: scraped.packageUnit,
    },
    update: {
      packageSize: scraped.packageSize,
      packageUnit: scraped.packageUnit,
      lastSeenAt: new Date(),
    },
  });

  await prisma.price.create({
    data: {
      storeProductId: sp.id,
      priceCents: scraped.priceCents,
      source: 'scrape',
    },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function scrapeWithPlaywright(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  // Hide automation signals
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const dbProducts = await prisma.product.findMany({
    select: { id: true, name: true, category: true },
  });

  const stores = await prisma.store.findMany();
  const storeByChain = new Map(stores.map(s => [s.chain, s]));

  let totalSaved = 0;

  // Metro only — Maxi/IGA promos handled by Flipp API (more reliable)
  const scrapers: Array<{ chain: string; fn: (p: Page) => Promise<ScrapedProduct[]> }> = [
    { chain: 'Metro', fn: scrapeMetro },
  ];

  for (const { chain, fn } of scrapers) {
    const store = storeByChain.get(chain as never);
    if (!store) continue;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Scraping ${chain}...`);
    console.log('='.repeat(50));

    const scraped = await fn(page);
    console.log(`\n[${chain}] ${scraped.length} products scraped`);

    // Group by DB product, keep cheapest per product
    const cheapestByProduct = new Map<string, { product: DBProduct; scraped: ScrapedProduct }>();

    for (const s of scraped) {
      const match = ruleMatch(s.name, dbProducts);
      if (!match) continue;

      const existing = cheapestByProduct.get(match.id);
      if (!existing || s.priceCents < existing.scraped.priceCents) {
        cheapestByProduct.set(match.id, { product: match, scraped: s });
      }
    }

    for (const { product, scraped: s } of cheapestByProduct.values()) {
      await savePrice(product, store.id, chain, s);
      totalSaved++;
      console.log(`  ✓ ${product.name}: $${(s.priceCents / 100).toFixed(2)}${s.isPromo ? ' 🔥' : ''} — "${s.name}"`);
    }
  }

  await browser.close();

  console.log(`\n✅ Metro Playwright scrape done. ${totalSaved} prices saved.`);
}

// Allow direct execution
if (process.argv[1]?.includes('playwright-scraper')) {
  scrapeWithPlaywright()
    .then(() => prisma.$disconnect())
    .catch(console.error);
}
