import { prisma } from '../db';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';
import { ruleMatch } from '../services/product-matcher';
import { refreshRecipeCostCache } from '../services/recipe-list.service';

// Rematch ingredients using latest catalog rules.
// Default: only unmatched (productId IS NULL). Pass --all to recheck everything.
const ALL = process.argv.includes('--all');

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true, createdAt: true, updatedAt: true },
  });
  const matcher = new IngredientMatcherService(products);

  const where = ALL ? {} : { productId: null };
  const ingredients = await prisma.ingredient.findMany({
    where,
    select: { id: true, rawText: true, productId: true },
  });

  const totalAll = await prisma.ingredient.count();
  const beforeMatched = await prisma.ingredient.count({ where: { productId: { not: null } } });
  let newMatches = 0;
  let processed = 0;

  console.log(`Rematching ${ingredients.length} ingredients (${ALL ? 'all' : 'unmatched only'}, DB total: ${totalAll})...`);

  for (const ing of ingredients) {
    // Fast path: catalog rule match (no Groq)
    const rule = ruleMatch(ing.rawText, products);
    if (rule && rule.id !== ing.productId) {
      if (!ing.productId) newMatches++;
      await prisma.ingredient.update({
        where: { id: ing.id },
        data: { productId: rule.id },
      });
    } else if (!rule && !ing.productId) {
      // Slow path: fuzzy + Groq only for unmatched that ruleMatch couldn't handle
      const results = await matcher.matchAll([ing.rawText]);
      const r = results[0];
      if (r?.productId) {
        newMatches++;
        await prisma.ingredient.update({
          where: { id: ing.id },
          data: { productId: r.productId, parsedQuantity: r.parsedQuantity, parsedUnit: r.parsedUnit },
        });
      }
    }

    processed++;
    if (processed % 1000 === 0 || processed === ingredients.length) {
      console.log(`  ${processed}/${ingredients.length} processed, ${newMatches} new matches`);
    }
  }

  const finalMatched = await prisma.ingredient.count({ where: { productId: { not: null } } });
  console.log(`Before: ${beforeMatched}/${totalAll} (${Math.round(beforeMatched / totalAll * 100)}%)`);
  console.log(`After:  ${finalMatched}/${totalAll} (${Math.round(finalMatched / totalAll * 100)}%)`);
  console.log(`New matches: ${newMatches}`);

  // Refresh cost cache
  const allRecipes = await prisma.recipe.findMany({ select: { id: true } });
  console.log(`Refreshing cost cache for ${allRecipes.length} recipes...`);
  let r = 0;
  for (const rec of allRecipes) {
    await refreshRecipeCostCache(rec.id);
    r++;
    if (r % 500 === 0) console.log(`  ${r}/${allRecipes.length} costs refreshed`);
  }
  console.log('Cache refreshed.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
