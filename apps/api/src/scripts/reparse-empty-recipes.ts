/**
 * Re-parse recipes that have 0 ingredients (parser failed on import).
 * Deletes and re-creates ingredients for affected recipes.
 * Run with NODE_ENV=production to suppress SQL logs.
 */
import { prisma } from '../db';
import { RecipeParserService } from '../services/recipe-parser.service';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';
import { refreshRecipeCostCache } from '../services/recipe-list.service';
import { classifyRecipe, classifyDifficulty } from '../services/recipe-classifier';

const MAX = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] ?? '50', 10);

async function main() {
  const emptyRecipes = await prisma.recipe.findMany({
    where: {
      ingredients: { none: {} },
      sourceUrl: { not: null },
    },
    select: { id: true, title: true, sourceUrl: true },
    take: MAX,
  });

  console.log(`Re-parsing ${emptyRecipes.length} recipes with 0 ingredients`);

  const parser = new RecipeParserService();
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true, createdAt: true, updatedAt: true },
  });

  let ok = 0, fail = 0;
  for (const recipe of emptyRecipes) {
    if (!recipe.sourceUrl) { fail++; continue; }
    try {
      const raw = await parser.parseUrl(recipe.sourceUrl);
      if (!raw.ingredients.length) {
        console.log(`  ✗ ${recipe.title}: still 0 ingredients after re-parse`);
        fail++;
        continue;
      }

      const category = raw.category ?? classifyRecipe(raw.title, raw.instructions.join(' '));
      const totalMinutes = (raw.prepTimeMinutes ?? 0) + (raw.cookTimeMinutes ?? 0) || null;
      const difficulty = classifyDifficulty(raw.ingredients.length, raw.instructions, totalMinutes);

      // Update recipe fields that may have been partial
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          category,
          difficulty,
          servings: raw.servings,
          imageUrl: raw.imageUrl,
          description: raw.description ?? null,
          dietaryTags: raw.dietaryTags ?? [],
          instructions: raw.instructions,
          prepTimeMinutes: raw.prepTimeMinutes,
          cookTimeMinutes: raw.cookTimeMinutes,
        },
      });

      const matcher = new IngredientMatcherService(products);
      const matched = await matcher.matchAll(raw.ingredients);

      await prisma.ingredient.deleteMany({ where: { recipeId: recipe.id } });
      await prisma.ingredient.createMany({
        data: matched.map((m, idx) => ({
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

      const matchedCount = matched.filter(m => m.productId).length;
      console.log(`  ✓ ${recipe.title}: ${raw.ingredients.length} ing, ${matchedCount} matched`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${recipe.title}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`\nDone: ${ok} re-parsed, ${fail} failed.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
