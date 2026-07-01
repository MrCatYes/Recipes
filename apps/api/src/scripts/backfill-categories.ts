/**
 * Re-classify all recipes using the current classifier rules.
 * Useful after adding new categories (e.g. Soupe) or changing keywords.
 *
 * Usage: npx tsx src/scripts/backfill-categories.ts [--dry-run]
 */

import { prisma } from '../db';
import { classifyRecipe } from '../services/recipe-classifier';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const recipes = await prisma.recipe.findMany({
    select: { id: true, title: true, category: true, instructions: true },
  });

  console.log(`Backfilling categories for ${recipes.length} recipes${DRY_RUN ? ' (dry-run)' : ''}...\n`);

  const changes: Array<{ title: string; from: string; to: string }> = [];

  for (const r of recipes) {
    const newCategory = classifyRecipe(r.title, r.instructions.join(' '));
    if (newCategory !== r.category) {
      changes.push({ title: r.title, from: r.category ?? '(null)', to: newCategory });
      if (!DRY_RUN) {
        await prisma.recipe.update({ where: { id: r.id }, data: { category: newCategory } });
      }
      console.log(`  ${r.title}`);
      console.log(`    ${r.category} → ${newCategory}`);
    }
  }

  console.log(`\n${changes.length} recipes reclassified${DRY_RUN ? ' (dry-run, no DB writes)' : ''}.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
