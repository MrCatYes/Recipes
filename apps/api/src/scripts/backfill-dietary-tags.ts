/**
 * Backfill dietaryTags on all existing Recipe rows.
 * Run once with: npx tsx src/scripts/backfill-dietary-tags.ts
 */
import { prisma } from '../db';
import { parseDietaryTags } from '../services/recipe-parser.service';

async function main() {
  const recipes = await prisma.recipe.findMany({
    include: { ingredients: { select: { rawText: true } } },
  });

  let updated = 0;
  for (const recipe of recipes) {
    if (recipe.dietaryTags && recipe.dietaryTags.length > 0) continue;
    const texts = recipe.ingredients.map(i => i.rawText);
    const tags = parseDietaryTags(null, texts);
    if (tags.length === 0) continue;

    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { dietaryTags: tags },
    });
    console.log(`[${recipe.title}] → ${tags.join(', ')}`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated}/${recipes.length} recipes.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
