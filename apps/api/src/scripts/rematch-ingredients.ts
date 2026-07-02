import { prisma } from '../db';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';
import { refreshRecipeCostCache } from '../services/recipe-list.service';

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true, createdAt: true, updatedAt: true },
  });
  const matcher = new IngredientMatcherService(products);

  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, rawText: true, productId: true },
  });

  let newMatches = 0;
  let total = ingredients.length;
  let alreadyMatched = ingredients.filter(i => i.productId).length;

  for (const ing of ingredients) {
    const results = await matcher.matchAll([ing.rawText]);
    const r = results[0];
    if (r?.productId) {
      if (!ing.productId) newMatches++;
      await prisma.ingredient.update({
        where: { id: ing.id },
        data: { productId: r.productId, parsedQuantity: r.parsedQuantity, parsedUnit: r.parsedUnit },
      });
    }
  }

  const finalMatched = await prisma.ingredient.count({ where: { productId: { not: null } } });
  console.log(`Before: ${alreadyMatched}/${total} (${Math.round(alreadyMatched / total * 100)}%)`);
  console.log(`After:  ${finalMatched}/${total} (${Math.round(finalMatched / total * 100)}%)`);
  console.log(`New matches: ${newMatches}`);

  // Refresh cost cache for all recipes
  const allRecipes = await prisma.recipe.findMany({ select: { id: true } });
  console.log(`Refreshing cost cache for ${allRecipes.length} recipes...`);
  for (const r of allRecipes) {
    await refreshRecipeCostCache(r.id);
  }
  console.log('Cache refreshed.');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
