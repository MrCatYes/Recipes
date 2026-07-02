/**
 * Batch recipe importer from sitemaps.
 * Fetches sitemap URLs, filters for recipe pages, imports via RecipeParserService.
 *
 * Usage:
 *   npx tsx src/scripts/import-sitemap-recipes.ts [--max 50] [--site ricardo|soscuisine|mordu|zeste|all]
 *
 * Rates limits itself to 2 req/s. Skips already-imported URLs.
 */

import { prisma } from '../db';
import { RecipeParserService } from '../services/recipe-parser.service';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';
import { computeRecipeCost } from '../services/recipe-cost.service';
import { refreshRecipeCostCache } from '../services/recipe-list.service';
import { classifyRecipe, classifyDifficulty } from '../services/recipe-classifier';

const MAX = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] ?? '50', 10);
const SITE = process.argv.find(a => a.startsWith('--site='))?.split('=')[1] ?? 'all';
const FROM_FILE = process.argv.find(a => a.startsWith('--from-file='))?.split('=')[1];
const DELAY_MS = 600; // ~1.5 req/s to be polite

interface SitemapSite {
  name: string;
  sitemaps: string[];
  /** URL pattern that identifies recipe pages */
  recipePattern: RegExp;
}

const SITES: SitemapSite[] = [
  {
    name: 'ricardo',
    sitemaps: ['https://www.ricardocuisine.com/sitemap.xml'],
    recipePattern: /ricardocuisine\.com\/recettes\//,
  },
  {
    name: 'soscuisine',
    sitemaps: ['https://www.soscuisine.com/sitemap.xml'],
    recipePattern: /soscuisine\.com\/recette\//,
  },
  {
    // Mordu (Radio-Canada) is a SPA — no XML sitemap, requires browser scraping
    // Disabled: fetch-based sitemap import cannot discover recipe URLs from SPA
    name: 'mordu',
    sitemaps: [],
    recipePattern: /radio-canada\.ca\/emissions\/mordu\/recettes?\//,
  },
  {
    name: 'coupdepouce',
    sitemaps: [
      'https://www.coupdepouce.com/sitemap/story-0.xml',
      'https://www.coupdepouce.com/sitemap/story-1.xml',
    ],
    recipePattern: /coupdepouce\.com\/recette\//,
  },
  {
    name: 'zeste',
    sitemaps: ['https://www.zeste.ca/sitemap.xml'],
    recipePattern: /zeste\.ca\/recettes\//,
  },
];

async function fetchSitemap(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 EpicerieBot/1.0', 'Accept': 'application/xml,text/xml' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) { console.warn(`  Sitemap ${res.status}: ${url}`); return []; }
    const text = await res.text();

    // If it's a sitemap index (contains <sitemapindex>), extract nested sitemaps
    if (text.includes('<sitemapindex')) {
      const nested = [...text.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map(m => m[1]);
      console.log(`  Sitemap index has ${nested.length} sub-sitemaps`);
      const all: string[] = [];
      for (const sub of nested) {
        const sub_urls = await fetchSitemap(sub);
        all.push(...sub_urls);
        if (all.length > 2000) break; // safety cap for huge sitemaps
      }
      return all;
    }

    // Regular sitemap — extract <loc> urls
    return [...text.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map(m => m[1]);
  } catch (e) {
    console.warn(`  Failed to fetch sitemap ${url}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

async function importRecipe(url: string, parser: RecipeParserService, products: Awaited<ReturnType<typeof prisma.product.findMany>>): Promise<'ok' | 'skip' | 'error'> {
  // Skip already imported
  const existing = await prisma.recipe.findUnique({ where: { sourceUrl: url } });
  if (existing) return 'skip';

  try {
    const rawRecipe = await parser.parseUrl(url);
    if (!rawRecipe.title || rawRecipe.ingredients.length < 2) return 'error';

    const category = rawRecipe.category ?? classifyRecipe(rawRecipe.title, rawRecipe.instructions.join(' '));
    const totalMinutes = (rawRecipe.prepTimeMinutes ?? 0) + (rawRecipe.cookTimeMinutes ?? 0) || null;
    const difficulty = classifyDifficulty(rawRecipe.ingredients.length, rawRecipe.instructions, totalMinutes);

    const recipe = await prisma.recipe.upsert({
      where: { sourceUrl: url },
      create: {
        sourceUrl: url,
        title: rawRecipe.title,
        category,
        difficulty,
        servings: rawRecipe.servings,
        imageUrl: rawRecipe.imageUrl,
        description: rawRecipe.description ?? null,
        dietaryTags: rawRecipe.dietaryTags ?? [],
        instructions: rawRecipe.instructions,
        prepTimeMinutes: rawRecipe.prepTimeMinutes,
        cookTimeMinutes: rawRecipe.cookTimeMinutes,
      },
      update: {},
    });

    await prisma.ingredient.deleteMany({ where: { recipeId: recipe.id } });

    const matcher = new IngredientMatcherService(products);
    const matchedIngredients = await matcher.matchAll(rawRecipe.ingredients);

    await prisma.ingredient.createMany({
      data: matchedIngredients.map((m, idx) => ({
        recipeId: recipe.id,
        rawText: m.rawText,
        parsedQuantity: m.parsedQuantity,
        parsedUnit: m.parsedUnit,
        productId: m.productId,
        notes: m.notes,
        sortOrder: idx,
      })),
    });

    await refreshRecipeCostCache(recipe.id).catch(() => {});

    const matched = matchedIngredients.filter(m => m.productId).length;
    console.log(`  ✓ ${rawRecipe.title} (${rawRecipe.ingredients.length} ing, ${matched} matched)`);
    return 'ok';
  } catch (e) {
    console.warn(`  ✗ ${url}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    return 'error';
  }
}

async function main() {
  // --from-file mode: import directly from a URL list file
  if (FROM_FILE) {
    const { readFileSync } = await import('fs');
    const fileUrls = readFileSync(FROM_FILE, 'utf8').split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    const recipeUrls = fileUrls.sort(() => Math.random() - 0.5).slice(0, MAX);
    console.log(`Importing ${recipeUrls.length} recipes from ${FROM_FILE} (of ${fileUrls.length} total)`);
    const parser = new RecipeParserService();
    const products = await prisma.product.findMany({
      select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true, createdAt: true, updatedAt: true },
    });
    let ok = 0, skip = 0, error = 0;
    for (let i = 0; i < recipeUrls.length; i++) {
      process.stdout.write(`[${i + 1}/${recipeUrls.length}] `);
      const result = await importRecipe(recipeUrls[i], parser, products);
      if (result === 'ok') ok++;
      else if (result === 'skip') { skip++; process.stdout.write(`skip\n`); }
      else error++;
      if (result !== 'skip') await new Promise(r => setTimeout(r, DELAY_MS));
    }
    const total = await prisma.recipe.count();
    console.log(`\nDone: ${ok} imported, ${skip} skipped, ${error} failed. Total in DB: ${total}`);
    await prisma.$disconnect();
    return;
  }

  const sites = SITE === 'all' ? SITES : SITES.filter(s => s.name === SITE);
  if (!sites.length) { console.error(`Unknown site: ${SITE}. Use: ${SITES.map(s => s.name).join(', ')}, all`); process.exit(1); }

  console.log(`Batch recipe import — max ${MAX} per site, sites: ${sites.map(s => s.name).join(', ')}\n`);

  const parser = new RecipeParserService();
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true, createdAt: true, updatedAt: true },
  });

  for (const site of sites) {
    console.log(`\n=== ${site.name} ===`);
    const allUrls: string[] = [];
    for (const sitemapUrl of site.sitemaps) {
      console.log(`Fetching sitemap: ${sitemapUrl}`);
      const urls = await fetchSitemap(sitemapUrl);
      allUrls.push(...urls.filter(u => site.recipePattern.test(u)));
    }

    // Shuffle to get variety instead of alphabetical order
    const recipeUrls = allUrls.sort(() => Math.random() - 0.5).slice(0, MAX);
    console.log(`Found ${allUrls.length} recipe URLs, importing up to ${recipeUrls.length}`);

    let ok = 0, skip = 0, error = 0;
    for (let i = 0; i < recipeUrls.length; i++) {
      const url = recipeUrls[i];
      process.stdout.write(`[${i + 1}/${recipeUrls.length}] `);
      const result = await importRecipe(url, parser, products);
      if (result === 'ok') ok++;
      else if (result === 'skip') { skip++; process.stdout.write(`skip\n`); }
      else error++;

      if (result !== 'skip') await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\n${site.name}: ${ok} imported, ${skip} skipped (already in DB), ${error} failed`);
  }

  const total = await prisma.recipe.count();
  console.log(`\nTotal recipes in DB: ${total}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
