/**
 * Re-parses instructions for existing recipes that have too few steps.
 * Useful after fixing parser logic (e.g., Ricardo data-react-app-props extraction).
 *
 * Usage:
 *   npx tsx src/scripts/reparse-instructions.ts [--site=ricardo] [--max=500] [--min-steps=3]
 */

import { prisma } from '../db';
import { RecipeParserService } from '../services/recipe-parser.service';

const SITE = process.argv.find(a => a.startsWith('--site='))?.split('=')[1] ?? 'ricardo';
const MAX = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] ?? '500', 10);
const MIN_STEPS = parseInt(process.argv.find(a => a.startsWith('--min-steps='))?.split('=')[1] ?? '3', 10);
const DELAY_MS = 700;

const SITE_PATTERNS: Record<string, string> = {
  ricardo: 'ricardocuisine.com',
  '5ingredients': '5ingredients15minutes.com',
  soscuisine: 'soscuisine.com',
  mordu: 'ici.radio-canada.ca/mordu',
};

async function main() {
  const pattern = SITE_PATTERNS[SITE];
  if (!pattern) { console.error('Unknown site:', SITE); process.exit(1); }

  const recipes = await prisma.recipe.findMany({
    where: {
      sourceUrl: { contains: pattern },
    },
    select: { id: true, sourceUrl: true, title: true, instructions: true },
    orderBy: { id: 'asc' },
  });

  const targets = recipes.filter(r => r.instructions.length < MIN_STEPS).slice(0, MAX);
  console.log(`Found ${targets.length} ${SITE} recipes with < ${MIN_STEPS} instruction steps (of ${recipes.length} total)`);

  const parser = new RecipeParserService();
  let ok = 0, failed = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${r.title} (${r.instructions.length} steps) ... `);

    try {
      const parsed = await parser.parseUrl(r.sourceUrl);
      if (!parsed || parsed.instructions.length < MIN_STEPS) {
        process.stdout.write(`skip (still ${parsed?.instructions.length ?? 0} steps)\n`);
        skipped++;
      } else {
        await prisma.recipe.update({
          where: { id: r.id },
          data: { instructions: parsed.instructions },
        });
        process.stdout.write(`✓ ${parsed.instructions.length} steps\n`);
        ok++;
      }
    } catch (e: any) {
      process.stdout.write(`error: ${e.message}\n`);
      failed++;
    }

    await new Promise(res => setTimeout(res, DELAY_MS));
  }

  console.log(`\nDone: ${ok} updated, ${skipped} skipped, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
