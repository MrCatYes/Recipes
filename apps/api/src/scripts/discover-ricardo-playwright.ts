/**
 * Discovers Ricardo recipe URLs using Playwright (handles SPA category pages).
 * Paginates each category to get all recipe URLs.
 * Outputs to /tmp/ricardo-urls.txt for use with import-sitemap-recipes.ts --from-file.
 *
 *   npx tsx src/scripts/discover-ricardo-playwright.ts
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, existsSync } from 'fs';
import type { Page } from 'playwright';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(chromium as any).use(stealth());

const BASE = 'https://www.ricardocuisine.com';
const CATEGORIES = [
  // Plats principaux — all leaf subcategories
  '/recettes/plats-principaux/poulet',
  '/recettes/plats-principaux/boeuf',
  '/recettes/plats-principaux/porc',
  '/recettes/plats-principaux/poissons',
  '/recettes/plats-principaux/fruits-de-mer',
  '/recettes/plats-principaux/pates-alimentaires',
  '/recettes/plats-principaux/riz',
  '/recettes/plats-principaux/risotto',
  '/recettes/plats-principaux/oeufs',
  '/recettes/plats-principaux/legumineuses',
  '/recettes/plats-principaux/agneau',
  '/recettes/plats-principaux/canard',
  '/recettes/plats-principaux/veau',
  '/recettes/plats-principaux/fondues',
  '/recettes/plats-principaux/dinde',
  '/recettes/plats-principaux/gibier',
  '/recettes/plats-principaux/quiches-et-tartes-salees',
  '/recettes/plats-principaux/orge-et-quinoa',
  '/recettes/plats-principaux/tofu-soya-et-cie',
  '/recettes/plats-principaux/vegetarien',
  '/recettes/plats-principaux/sandwichs',
  '/recettes/plats-principaux/oies-pintades-et-autres-volailles',
  '/recettes/plats-principaux/dejeuners-brunch',
  // Desserts — leaf subcategories (discovered via Playwright)
  '/recettes/desserts/barres-et-carres',
  '/recettes/desserts/biscuits',
  '/recettes/desserts/bonbons-chocolats-et-friandises',
  '/recettes/desserts/brownies',
  '/recettes/desserts/confitures-et-tartinades-sucrees',
  '/recettes/desserts/croustades-et-croustillants',
  '/recettes/desserts/cremes-desserts-mousse-et-meringues',
  '/recettes/desserts/crepes-et-pancakes',
  '/recettes/desserts/cupcakes',
  '/recettes/desserts/desserts-glaces',
  '/recettes/desserts/fruits',
  '/recettes/desserts/gateaux',
  '/recettes/desserts/muffins-et-pains-desserts',
  '/recettes/desserts/poudings-et-tapiocas',
  '/recettes/desserts/patisseries',
  '/recettes/desserts/tartes',
  '/recettes/desserts/yogourts-et-fromages',
  // Entrées — correct subcategory paths (from site nav)
  '/recettes/entrees/bouchees',
  '/recettes/entrees/conserves-et-ketchups',
  '/recettes/entrees/entree',
  '/recettes/entrees/legumes-et-gratins',
  '/recettes/entrees/marinades-pour-bbq',
  '/recettes/entrees/mayonnaises-et-vinaigrettes',
  '/recettes/entrees/pains-sales',
  '/recettes/entrees/salades',
  '/recettes/entrees/sauces-beurres-et-pestos',
  '/recettes/entrees/soupes-et-potages',
  '/recettes/entrees/trempettes-et-tartinades-salees',
  '/recettes/entrees/boissons-et-cocktails-alcoolises',
  '/recettes/entrees/boissons-et-cocktails-sans-alcool',
  // Ingredients pages (ingredient-centric recipe listings)
  '/recettes/ingredients/poulet',
  '/recettes/ingredients/boeuf',
  '/recettes/ingredients/porc',
  '/recettes/ingredients/poisson',
  '/recettes/ingredients/saumon',
  '/recettes/ingredients/crevettes',
  '/recettes/ingredients/homard',
  '/recettes/ingredients/agneau',
  '/recettes/ingredients/canard',
  '/recettes/ingredients/dinde',
  '/recettes/ingredients/veau',
  '/recettes/ingredients/gibier',
  '/recettes/ingredients/legumes',
  '/recettes/ingredients/legumineuses',
  '/recettes/ingredients/pates',
  '/recettes/ingredients/oeufs',
  '/recettes/ingredients/fromages',
  '/recettes/ingredients/tofu',
  '/recettes/ingredients/fruits',
  '/recettes/ingredients/canneberges',
  '/recettes/ingredients/chocolat',
  '/recettes/ingredients/creme',
  '/recettes/ingredients/miel',
];

async function extractUrls(page: Page): Promise<string[]> {
  return page.evaluate((base) => {
    const found = new Set<string>();
    document.querySelectorAll('a[href]').forEach(el => {
      const href = (el as HTMLAnchorElement).href;
      if (/\/recettes\/\d+/.test(href)) found.add(href);
    });
    return [...found];
  }, BASE);
}

async function crawlCategory(page: Page, catPath: string, allUrls: Set<string>): Promise<number> {
  let added = 0;
  for (let p = 1; p <= 10; p++) {
    const url = BASE + catPath + (p > 1 ? `?page=${p}` : '');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);

      // Scroll to trigger lazy-loaded recipe cards
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);

      const urls = await extractUrls(page);
      const prevSize = allUrls.size;
      for (const u of urls) allUrls.add(u);
      const newUrls = allUrls.size - prevSize;
      added += newUrls;

      // If no new URLs on this page, we've reached the end
      if (newUrls === 0 && p > 1) break;
      if (urls.length === 0) break;
    } catch (e) {
      console.warn(`  FAILED ${catPath} p${p}: ${e instanceof Error ? e.message.slice(0, 70) : e}`);
      break;
    }
  }
  return added;
}

async function main() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? (existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' : undefined);

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-CA',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const allUrls = new Set<string>();

  for (const cat of CATEGORIES) {
    const added = await crawlCategory(page, cat, allUrls);
    console.log(`${cat}: +${added} (total ${allUrls.size})`);
  }

  await browser.close();

  const list = [...allUrls].join('\n');
  const outFile = '/tmp/ricardo-urls.txt';
  writeFileSync(outFile, list);
  console.log(`\nTotal: ${allUrls.size} unique URLs written to ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
