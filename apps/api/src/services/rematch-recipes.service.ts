/**
 * Re-match stored recipe ingredients against the current product catalog.
 * Use after expanding the catalog so existing recipes pick up new matches
 * WITHOUT re-fetching their source URLs.
 *
 *   pnpm exec tsx src/services/rematch-recipes.service.ts
 */

import { PrismaClient } from '@prisma/client';
import { IngredientMatcherService } from './ingredient-matcher.service';

const prisma = new PrismaClient();

export async function rematchAllRecipes(): Promise<{ recipes: number; newMatches: number }> {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true },
  });
  const matcher = new IngredientMatcherService(products);

  const recipes = await prisma.recipe.findMany({
    include: { ingredients: { orderBy: { sortOrder: 'asc' } } },
  });

  let newMatches = 0;

  for (const recipe of recipes) {
    if (recipe.ingredients.length === 0) continue;

    const before = recipe.ingredients.filter(i => i.productId).length;
    const matched = await matcher.matchAll(recipe.ingredients.map(i => i.rawText));

    // matchAll preserves order → align with existing ingredient rows
    await prisma.$transaction(
      recipe.ingredients.map((ing, idx) => {
        const m = matched[idx];
        return prisma.ingredient.update({
          where: { id: ing.id },
          data: {
            productId: m?.productId ?? null,
            parsedQuantity: m?.parsedQuantity ?? ing.parsedQuantity,
            parsedUnit: m?.parsedUnit ?? ing.parsedUnit,
            notes: m?.notes ?? ing.notes,
          },
        });
      }),
    );

    const after = matched.filter(m => m.productId).length;
    newMatches += Math.max(0, after - before);
    console.log(`  ${recipe.title.slice(0, 40).padEnd(42)} ${before} → ${after} matched`);
  }

  console.log(`\nDone. ${recipes.length} recipes, +${newMatches} new ingredient matches.`);
  return { recipes: recipes.length, newMatches };
}

if (process.argv[1]?.includes('rematch-recipes')) {
  rematchAllRecipes()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect(); });
}
