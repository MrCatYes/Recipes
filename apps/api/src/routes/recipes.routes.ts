import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { RecipeParserService } from '../services/recipe-parser.service';
import { IngredientMatcherService } from '../services/ingredient-matcher.service';
import { computeRecipeCost } from '../services/recipe-cost.service';
import { getRecipesByPromos } from '../services/recipe-promos.service';
import { listRecipes, refreshRecipeCostCache, type RecipeSort } from '../services/recipe-list.service';
import { classifyRecipe, classifyDifficulty } from '../services/recipe-classifier';
import { findSubstitutions } from '../services/substitution.service';
import type { ParseRecipeResponse, StoreChain } from '@epicerie/shared-types';

const CHAINS = ['IGA', 'Metro', 'Maxi', 'Walmart', 'Costco', 'SuperC'] as const;

function parseChains(raw?: string): StoreChain[] | undefined {
  if (!raw) return undefined;
  return raw.split(',').map(c => c.trim())
    .filter((c): c is StoreChain => (CHAINS as readonly string[]).includes(c));
}

export async function recipesRoutes(app: FastifyInstance) {
  // GET /recipes?category=Dessert&chains=Maxi,IGA&sort=price|promos|recent&dietaryTag=vegetarien
  app.get('/recipes', async (req, reply) => {
    const schema = z.object({
      category: z.string().optional(),
      difficulty: z.enum(['débutant', 'confirmé', 'expert']).optional(),
      chains: z.string().optional(),
      sort: z.enum(['price', 'promos', 'recent', 'time']).optional().default('price'),
      dietaryTag: z.string().optional(),
      q: z.string().optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    return listRecipes({
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
      chains: parseChains(parsed.data.chains),
      sort: parsed.data.sort as RecipeSort,
      dietaryTag: parsed.data.dietaryTag,
      q: parsed.data.q,
    });
  });
  // GET /recipes/by-promos?chains=Maxi,IGA  → recipes whose ingredients are on sale
  app.get('/recipes/by-promos', async (req, reply) => {
    const schema = z.object({
      chains: z.string().optional(),
      max: z.coerce.number().min(1).max(50).optional().default(10),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    let chains: StoreChain[] | undefined;
    if (parsed.data.chains) {
      chains = parsed.data.chains
        .split(',').map(c => c.trim())
        .filter((c): c is StoreChain => (CHAINS as readonly string[]).includes(c));
    }

    return getRecipesByPromos(chains, parsed.data.max);
  });

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
    const category = rawRecipe.category
      ?? classifyRecipe(rawRecipe.title, rawRecipe.instructions.join(' '));
    const totalMinutes =
      (rawRecipe.prepTimeMinutes ?? 0) + (rawRecipe.cookTimeMinutes ?? 0) || null;
    const difficulty = classifyDifficulty(
      rawRecipe.ingredients.length,
      rawRecipe.instructions,
      totalMinutes,
    );
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
      update: {
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

    // Compute costs + refresh cache
    const cost = await computeRecipeCost(recipe.id);
    if (!cost) {
      return reply.internalServerError('Failed to compute recipe cost');
    }
    // Persist cheapest store to recipe row for fast list rendering
    refreshRecipeCostCache(recipe.id).catch(() => {});

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

  // GET /recipes/:id/substitutions?chains=Maxi,IGA
  // Batched: one request returns cheaper substitutes for every matched ingredient,
  // replacing the previous N-requests-per-recipe (one call per ingredient) pattern.
  app.get<{ Params: { id: string } }>('/recipes/:id/substitutions', async (req, reply) => {
    const chainsParam = (req.query as Record<string, string>).chains ?? '';
    const chains = chainsParam ? chainsParam.split(',') : ['Maxi', 'IGA', 'Metro', 'SuperC', 'Walmart', 'Costco'];
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: { ingredients: { select: { id: true, productId: true } } },
    });
    if (!recipe) return reply.notFound('Recipe not found');

    // Distinct product → first ingredient that references it
    const byProduct = new Map<string, string>();
    for (const ing of recipe.ingredients) {
      if (ing.productId && !byProduct.has(ing.productId)) byProduct.set(ing.productId, ing.id);
    }

    const results = await Promise.all(
      Array.from(byProduct.entries()).map(async ([productId, ingredientId]) => {
        const subs = await findSubstitutions(productId, chains);
        return subs.filter(s => s.savingsCents > 0).map(s => ({ ingredientId, ...s }));
      })
    );
    return { substitutions: results.flat() };
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

  // DELETE /recipes/:id  → delete recipe and its ingredients
  app.delete<{ Params: { id: string } }>('/recipes/:id', async (req, reply) => {
    const { id } = req.params;
    const exists = await prisma.recipe.findUnique({ where: { id } });
    if (!exists) return reply.notFound('Recipe not found');

    await prisma.ingredient.deleteMany({ where: { recipeId: id } });
    await prisma.mealPlanEntry.deleteMany({ where: { recipeId: id } });
    await prisma.recipe.delete({ where: { id } });

    return reply.code(204).send();
  });

  // POST /recipes/:id/rematch  → re-match ingredients against current product catalog
  app.post<{ Params: { id: string } }>('/recipes/:id/rematch', async (req, reply) => {
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: { ingredients: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!recipe) return reply.notFound('Recipe not found');

    const products = await prisma.product.findMany({
      select: { id: true, name: true, brand: true, category: true, gtin: true, defaultUnit: true, defaultUnitType: true },
    });
    const matcher = new IngredientMatcherService(products);
    const matched = await matcher.matchAll(recipe.ingredients.map(i => i.rawText));

    let updated = 0;
    for (let i = 0; i < recipe.ingredients.length; i++) {
      const ing = recipe.ingredients[i];
      const m = matched[i];
      if (m?.productId && m.productId !== ing.productId) {
        await prisma.ingredient.update({
          where: { id: ing.id },
          data: { productId: m.productId, parsedQuantity: m.parsedQuantity, parsedUnit: m.parsedUnit },
        });
        updated++;
      }
    }

    const cost = await computeRecipeCost(recipe.id);
    return { updated, recipe: cost };
  });

  // GET /recipes/search?q=poulet  → search recipes by title or ingredient text
  app.get('/recipes/search', async (req, reply) => {
    const schema = z.object({ q: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const q = parsed.data.q;
    const recipes = await prisma.recipe.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { ingredients: { some: { rawText: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      select: {
        id: true, title: true, category: true, difficulty: true,
        servings: true, imageUrl: true, sourceUrl: true,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return { recipes };
  });
}
