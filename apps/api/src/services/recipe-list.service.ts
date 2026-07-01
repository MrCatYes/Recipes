import { prisma } from '../db';
import { computeRecipeCost } from './recipe-cost.service';
import type { GetRecipesResponse, RecipeSummary, StoreChain } from '@epicerie/shared-types';

function getWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export type RecipeSort = 'price' | 'promos' | 'recent' | 'time';

/**
 * Recompute and persist the cost cache for a single recipe.
 * Call after parse, rematch, or price updates.
 */
export async function refreshRecipeCostCache(recipeId: string): Promise<void> {
  const cost = await computeRecipeCost(recipeId);
  if (!cost) return;
  // Use cheapestStore from computeRecipeCost which applies coverage filtering
  await prisma.recipe.update({
    where: { id: recipeId },
    data: {
      cachedTotalCents: cost.cheapestTotalCents ?? null,
      cachedStore: cost.cheapestStore ?? null,
      cachedCostAt: new Date(),
    },
  });
}

export async function listRecipes(
  opts: { category?: string; difficulty?: string; chains?: StoreChain[]; sort?: RecipeSort; dietaryTag?: string; q?: string } = {},
): Promise<GetRecipesResponse> {
  const { category, difficulty, chains, sort = 'price', dietaryTag, q } = opts;

  const recipes = await prisma.recipe.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(dietaryTag ? { dietaryTags: { has: dietaryTag } } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    },
    include: { ingredients: { select: { id: true, productId: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Products on promo this week (selected chains)
  const weekOf = getWeekMonday();
  const flyers = await prisma.flyerItem.findMany({
    where: { weekOf, productId: { not: null }, ...(chains?.length ? { store: { chain: { in: chains } } } : {}) },
    select: { productId: true },
  });
  const promoProducts = new Set(flyers.map((f) => f.productId));

  const allCategories = Array.from(
    new Set((await prisma.recipe.findMany({ select: { category: true } })).map((r) => r.category).filter(Boolean) as string[]),
  ).sort();

  // Dedup by title; use cached cost when available, compute lazily otherwise
  const seen = new Set<string>();
  const summaries: RecipeSummary[] = [];

  for (const r of recipes) {
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Use cached cost — avoids O(n) computeRecipeCost calls on list
    let cheapestTotalCents: number | null = r.cachedTotalCents ?? null;
    let cheapestStore: StoreChain | null = (r.cachedStore as StoreChain) ?? null;

    // If no cache yet, compute synchronously and persist for next time
    if (cheapestTotalCents === null) {
      const cost = await computeRecipeCost(r.id);
      if (cost) {
        const totals = Object.entries(cost.totalCostByStore)
          .filter(([c]) => !chains?.length || chains.includes(c as StoreChain))
          .sort((a, b) => a[1] - b[1]);
        cheapestTotalCents = totals[0]?.[1] ?? null;
        cheapestStore = (totals[0]?.[0] as StoreChain) ?? null;
        // Persist — fire and forget
        prisma.recipe.update({
          where: { id: r.id },
          data: { cachedTotalCents: cheapestTotalCents, cachedStore: cheapestStore, cachedCostAt: new Date() },
        }).catch(() => {});
      }
    } else if (chains?.length) {
      // Cached value is chain-agnostic; must recompute per-chain if chains are filtered
      const cost = await computeRecipeCost(r.id);
      if (cost) {
        const totals = Object.entries(cost.totalCostByStore)
          .filter(([c]) => chains.includes(c as StoreChain))
          .sort((a, b) => a[1] - b[1]);
        cheapestTotalCents = totals[0]?.[1] ?? null;
        cheapestStore = (totals[0]?.[0] as StoreChain) ?? null;
      }
    }

    const promoCount = r.ingredients.filter((i) => i.productId && promoProducts.has(i.productId)).length;
    const matchedCount = r.ingredients.filter((i) => i.productId).length;
    const totalTime = ((r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0)) || null;

    summaries.push({
      id: r.id,
      title: r.title,
      category: r.category,
      difficulty: r.difficulty as RecipeSummary['difficulty'],
      imageUrl: r.imageUrl,
      servings: r.servings,
      totalTimeMinutes: totalTime,
      cheapestStore,
      cheapestTotalCents,
      promoIngredientCount: promoCount,
      ingredientCount: r.ingredients.length,
      matchedIngredientCount: matchedCount,
      dietaryTags: r.dietaryTags ?? [],
    });
  }

  summaries.sort((a, b) => {
    if (sort === 'promos') return b.promoIngredientCount - a.promoIngredientCount;
    if (sort === 'price') return (a.cheapestTotalCents ?? Infinity) - (b.cheapestTotalCents ?? Infinity);
    if (sort === 'time') return (a.totalTimeMinutes ?? Infinity) - (b.totalTimeMinutes ?? Infinity);
    return 0; // recent = keep createdAt desc order
  });

  return { recipes: summaries, categories: allCategories };
}
