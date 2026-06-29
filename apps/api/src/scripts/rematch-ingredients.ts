import { prisma } from '../db';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true },
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

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
