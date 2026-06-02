import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { RecipeParserService } from '../services/recipe-parser.service';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';
import { computeRecipeCost } from '../services/recipe-cost.service';
import type { ParseRecipeResponse } from '@epicerie/shared-types';

export async function recipesRoutes(app: FastifyInstance) {
  // POST /recipes/parse  { url }  → parse + save + return RecipeWithCost
  app.post('/recipes/parse', async (req, reply) => {
    const schema = z.object({ url: z.string().url() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const { url } = parsed.data;

    // Return cached result if already parsed
    const existing = await prisma.recipe.findUnique({ where: { sourceUrl: url } });
    if (existing) {
      const cost = await computeRecipeCost(existing.id);
      if (cost) {
        const warnings: string[] = [];
        const unmatched = cost.ingredients.filter(i => !i.productId).length;
        if (unmatched > 0) warnings.push(`${unmatched} ingredient(s) could not be matched to a product`);

        return {
          recipe: cost,
          matchConfidence: Object.fromEntries(
            cost.ingredients.map(i => [i.id, i.productId ? 1 : 0])
          ),
          warnings,
        } satisfies ParseRecipeResponse;
      }
    }

    // Parse the URL
    console.log('[parse] 1. fetching URL:', url);
    const parser = new RecipeParserService();
    let rawRecipe;
    try {
      rawRecipe = await parser.parseUrl(url);
      console.log('[parse] 2. parsed OK:', rawRecipe.title, `(${rawRecipe.ingredients.length} ingredients)`);
    } catch (err) {
      console.log('[parse] ERROR:', err);
      return reply.status(422).send({
        error: 'UnprocessableContent',
        message: err instanceof Error ? err.message : 'Failed to parse recipe',
      });
    }

    // Save recipe skeleton
    console.log('[parse] 3. saving to DB...');
    const recipe = await prisma.recipe.upsert({
      where: { sourceUrl: url },
      create: {
        sourceUrl: url,
        title: rawRecipe.title,
        servings: rawRecipe.servings,
        imageUrl: rawRecipe.imageUrl,
        instructions: rawRecipe.instructions,
        prepTimeMinutes: rawRecipe.prepTimeMinutes,
        cookTimeMinutes: rawRecipe.cookTimeMinutes,
      },
      update: {
        title: rawRecipe.title,
        servings: rawRecipe.servings,
        imageUrl: rawRecipe.imageUrl,
        instructions: rawRecipe.instructions,
        prepTimeMinutes: rawRecipe.prepTimeMinutes,
        cookTimeMinutes: rawRecipe.cookTimeMinutes,
      },
    });

    // Delete old ingredients before re-inserting
    await prisma.ingredient.deleteMany({ where: { recipeId: recipe.id } });

    // Match ingredients to products
    const products = await prisma.product.findMany({
      select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true },
    });
    console.log('[parse] 4. matching', rawRecipe.ingredients.length, 'ingredients...');
    const matcher = new IngredientMatcherService(products);
    const matchedIngredients = await matcher.matchAll(rawRecipe.ingredients);
    console.log('[parse] 5. matched. computing cost...');

    // Save ingredients
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

    // Compute costs
    const cost = await computeRecipeCost(recipe.id);
    if (!cost) {
      return reply.internalServerError('Failed to compute recipe cost');
    }

    const warnings: string[] = [];
    const unmatchedCount = matchedIngredients.filter(m => !m.productId).length;
    if (unmatchedCount > 0) {
      warnings.push(`${unmatchedCount} ingredient(s) could not be matched to a product`);
    }

    return {
      recipe: cost,
      matchConfidence: Object.fromEntries(
        matchedIngredients.map((m, idx) => {
          const saved = cost.ingredients[idx];
          return [saved?.id ?? idx, m.confidence];
        })
      ),
      warnings,
    } satisfies ParseRecipeResponse;
  });

  // GET /recipes/:id/cost  → recompute cost for saved recipe
  app.get<{ Params: { id: string } }>('/recipes/:id/cost', async (req, reply) => {
    const cost = await computeRecipeCost(req.params.id);
    if (!cost) return reply.notFound('Recipe not found');
    return cost;
  });

  // GET /recipes/:id  → recipe metadata only
  app.get<{ Params: { id: string } }>('/recipes/:id', async (req, reply) => {
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: { ingredients: true },
    });
    if (!recipe) return reply.notFound('Recipe not found');
    return recipe;
  });
}
