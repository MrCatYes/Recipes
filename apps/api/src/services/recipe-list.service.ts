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

export async function listRecipes(
  opts: { category?: string; difficulty?: string; chains?: StoreChain[]; sort?: RecipeSort } = {},
): Promise<GetRecipesResponse> {
  const { category, difficulty, chains, sort = 'price' } = opts;

  const recipes = await prisma.recipe.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(difficulty ? { difficulty } : {}),
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

  // Dedup by title; compute cheapest total over selected chains
  const seen = new Set<string>();
  const summaries: RecipeSummary[] = [];

  for (const r of recipes) {
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cost = await computeRecipeCost(r.id);
    if (!cost) continue;

    // Cheapest store among selected chains
    const totals = Object.entries(cost.totalCostByStore)
      .filter(([c]) => !chains?.length || chains.includes(c as StoreChain))
      .sort((a, b) => a[1] - b[1]);

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
      cheapestStore: (totals[0]?.[0] as StoreChain) ?? null,
      cheapestTotalCents: totals[0]?.[1] ?? null,
      promoIngredientCount: promoCount,
      ingredientCount: r.ingredients.length,
      matchedIngredientCount: matchedCount,
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
