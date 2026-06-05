import { prisma } from '../db';
import { computeRecipeCost } from './recipe-cost.service';
import type { RecipesByPromosResponse, StoreChain } from '@epicerie/shared-types';

function getWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getRecipesByPromos(
  chains?: StoreChain[],
  maxRecipes = 10,
  category?: string,
): Promise<RecipesByPromosResponse> {
  const weekOf = getWeekMonday();

  // Products on promo this week (in selected chains), with cheapest promo + regular price
  const flyers = await prisma.flyerItem.findMany({
    where: {
      weekOf,
      productId: { not: null },
      ...(chains?.length ? { store: { chain: { in: chains } } } : {}),
    },
    select: { productId: true, promoPriceCents: true, regularPriceCents: true },
  });

  const promoByProduct = new Map<string, { promo: number; regular: number | null }>();
  for (const f of flyers) {
    if (!f.productId) continue;
    const existing = promoByProduct.get(f.productId);
    if (!existing || f.promoPriceCents < existing.promo) {
      promoByProduct.set(f.productId, { promo: f.promoPriceCents, regular: f.regularPriceCents });
    }
  }

  if (promoByProduct.size === 0) {
    return { weekOf: weekOf.toISOString(), recipes: [] };
  }

  // All recipes with their ingredient productIds (optionally filtered by category)
  const recipes = await prisma.recipe.findMany({
    where: category ? { category } : undefined,
    include: { ingredients: { select: { id: true, productId: true } } },
  });

  const ranked: Array<{ recipeId: string; title: string; promoIngredientIds: string[]; savings: number }> = [];

  for (const r of recipes) {
    const promoIngredientIds: string[] = [];
    let savings = 0;

    for (const ing of r.ingredients) {
      if (!ing.productId) continue;
      const promo = promoByProduct.get(ing.productId);
      if (!promo) continue;
      promoIngredientIds.push(ing.id);
      if (promo.regular != null && promo.regular > promo.promo) {
        savings += promo.regular - promo.promo; // package-level savings (approx)
      }
    }

    if (promoIngredientIds.length > 0) {
      ranked.push({ recipeId: r.id, title: r.title, promoIngredientIds, savings });
    }
  }

  // Most promo ingredients first, then highest savings
  ranked.sort((a, b) =>
    b.promoIngredientIds.length - a.promoIngredientIds.length || b.savings - a.savings,
  );

  // Dedup by title (defensive: same recipe parsed under different source URLs)
  const seenTitles = new Set<string>();
  const deduped = ranked.filter((r) => {
    const key = r.title.trim().toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  const top = deduped.slice(0, maxRecipes);

  const recipesOut: RecipesByPromosResponse['recipes'] = [];
  for (const entry of top) {
    const cost = await computeRecipeCost(entry.recipeId);
    if (!cost) continue;
    recipesOut.push({
      recipe: cost,
      promoIngredients: entry.promoIngredientIds,
      savings: entry.savings,
    });
  }

  return { weekOf: weekOf.toISOString(), recipes: recipesOut };
}
