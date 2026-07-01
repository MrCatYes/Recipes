/**
 * Discovers Ricardo recipe URLs by crawling category pages.
 * Outputs discovered URLs to a file for use with import-sitemap-recipes.ts.
 *
 *   npx tsx src/scripts/discover-ricardo-urls.ts
 */

import { writeFileSync } from 'fs';

const BASE = 'https://www.ricardocuisine.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'fr-CA,fr;q=0.9',
};

// Ricardo nested category paths (confirmed working)
const CATEGORIES = [
  '/recettes/plats-principaux/poulet',
  '/recettes/plats-principaux/boeuf',
  '/recettes/plats-principaux/porc',
  '/recettes/plats-principaux/poissons',
  '/recettes/plats-principaux/fruits-de-mer',
  '/recettes/plats-principaux/pates-alimentaires',
  '/recettes/plats-principaux/riz',
  '/recettes/plats-principaux/oeufs',
  '/recettes/plats-principaux/legumineuses',
  '/recettes/plats-principaux/quiches-et-tartes-salees',
  '/recettes/plats-principaux/fondues',
  '/recettes/entrees-et-hors-doeuvres',
  '/recettes/soupes',
  '/recettes/salades',
  '/recettes/desserts/gateaux-et-genoise',
  '/recettes/desserts/biscuits-et-gateaux-au-chocolat',
  '/recettes/desserts/tartes-et-tourtes-sucrees',
  '/recettes/desserts/mousses-et-cremeux',
  '/recettes/desserts/poudings-et-cremes',
  '/recettes/dejeuners-et-brunchs',
  '/recettes/patisseries',
  '/recettes/accompagnements',
  '/recettes/boissons',
  '/recettes/recettes-vegetariennes',
  '/recettes/recettes-de-saison/ete',
  '/recettes/recettes-de-saison/hiver',
  '/recettes/recettes-rapides-et-faciles',
  '/recettes/plats-principaux/agneau',
  '/recettes/plats-principaux/canard',
];

async function fetchCategoryUrls(path: string): Promise<string[]> {
  try {
    const res = await fetch(BASE + path, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { process.stderr.write(`  ${res.status} ${path}\n`); return []; }
    const html = await res.text();
    const found = new Set<string>();
    // Match recipe pages: /recettes/NNN-slug (with numeric ID)
    const rx = /href="(\/recettes\/\d+[^"]*?)"/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) !== null) {
      const href = m[1];
      if (/\/recettes\/\d+/.test(href)) found.add(BASE + href);
    }
    return [...found];
  } catch (e) {
    process.stderr.write(`  ERR ${path}: ${e instanceof Error ? e.message.slice(0,60) : e}\n`);
    return [];
  }
}

async function main() {
  process.stderr.write(`Discovering Ricardo recipe URLs from ${CATEGORIES.length} categories...\n\n`);
  const allUrls = new Set<string>();

  for (const cat of CATEGORIES) {
    process.stderr.write(`${cat}...`);
    const urls = await fetchCategoryUrls(cat);
    process.stderr.write(` ${urls.length} URLs\n`);
    for (const u of urls) allUrls.add(u);
    await new Promise(r => setTimeout(r, 700));
  }

  process.stderr.write(`\nTotal unique recipe URLs: ${allUrls.size}\n`);
  const list = [...allUrls].join('\n');
  writeFileSync('/tmp/ricardo-urls.txt', list);
  process.stderr.write(`Written to /tmp/ricardo-urls.txt\n`);
}
main().catch(e => { process.stderr.write(String(e)); process.exit(1); });
