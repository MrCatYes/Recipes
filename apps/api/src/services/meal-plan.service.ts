import { prisma } from '../db';
import { computeRecipeCost } from './recipe-cost.service';
import { computeListCost } from './shopping-list.service';
import type {
  MealPlanEntryWithCost,
  MealPlanWithCost,
  ShoppingListWithCost,
  StoreChain,
} from '@epicerie/shared-types';

function scaleCents(cents: number | null, factor: number): number | null {
  return cents == null ? null : Math.round(cents * factor);
}

/**
 * Meal plan with cost: each recipe's cost scaled to its planned servings,
 * aggregated into per-store basket totals + split-shopping minimum + budget.
 */
export async function computeMealPlan(planId: string): Promise<MealPlanWithCost | null> {
  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    include: { entries: { orderBy: { sortOrder: 'asc' }, include: { recipe: true } } },
  });
  if (!plan) return null;

  const totalsByStore: Partial<Record<StoreChain, number>> = {};
  const entries: MealPlanEntryWithCost[] = [];
  let estimatedTotalCents: number | null = null;

  for (const e of plan.entries) {
    const base = e.recipe.servings || 1;
    const factor = e.servings / base;

    const cost = await computeRecipeCost(e.recipeId);
    let costCents: number | null = null;
    let cheapestStore: StoreChain | null = null;

    if (cost) {
      costCents = scaleCents(cost.cheapestTotalCents, factor);
      cheapestStore = cost.cheapestStore;
      // Aggregate scaled per-store totals
      for (const [chain, cents] of Object.entries(cost.totalCostByStore) as Array<[StoreChain, number]>) {
        totalsByStore[chain] = (totalsByStore[chain] ?? 0) + Math.round(cents * factor);
      }
      if (costCents != null) estimatedTotalCents = (estimatedTotalCents ?? 0) + costCents;
    }

    entries.push({
      id: e.id,
      planId: e.planId,
      recipeId: e.recipeId,
      servings: e.servings,
      dayOfWeek: e.dayOfWeek,
      sortOrder: e.sortOrder,
      recipe: {
        id: e.recipe.id,
        title: e.recipe.title,
        imageUrl: e.recipe.imageUrl,
        category: e.recipe.category,
        difficulty: e.recipe.difficulty as MealPlanEntryWithCost['recipe']['difficulty'],
        baseServings: base,
      },
      costCents,
      cheapestStore,
    });
  }

  const storeEntries = (Object.entries(totalsByStore) as Array<[StoreChain, number]>)
    .sort((a, b) => a[1] - b[1]);
  const cheapestTotalCents = storeEntries[0]?.[1] ?? null;

  let budget: MealPlanWithCost['budget'] = null;
  if (plan.budgetCents != null) {
    const spent = cheapestTotalCents ?? 0;
    budget = {
      targetCents: plan.budgetCents,
      spentCents: spent,
      remainingCents: plan.budgetCents - spent,
      overBudget: spent > plan.budgetCents,
    };
  }

  return {
    id: plan.id,
    name: plan.name,
    weekOf: plan.weekOf?.toISOString() ?? null,
    budgetCents: plan.budgetCents,
    entries,
    totalCostByStore: totalsByStore,
    cheapestStore: storeEntries[0]?.[0] ?? null,
    cheapestTotalCents,
    estimatedTotalCents,
    budget,
    recipeCount: entries.length,
  };
}

/**
 * Generate a shopping list from a plan: aggregate every recipe's ingredients
 * (quantities scaled to planned servings), merging same product+unit lines.
 * The "wow" — a week of meals becomes one optimized list.
 */
export async function generateListFromPlan(planId: string, userId: string): Promise<ShoppingListWithCost | null> {
  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    include: { entries: { include: { recipe: { include: { ingredients: { orderBy: { sortOrder: 'asc' } } } } } } },
  });
  if (!plan) return null;

  // Aggregate ingredients. Key by productId+unit when matched, else by raw text.
  interface Agg { rawText: string; productId: string | null; quantity: number | null; unit: string | null; recipeId: string }
  const merged = new Map<string, Agg>();

  for (const e of plan.entries) {
    const factor = e.servings / (e.recipe.servings || 1);
    for (const ing of e.recipe.ingredients) {
      const scaledQty = ing.parsedQuantity != null ? ing.parsedQuantity * factor : null;
      const key = ing.productId && ing.parsedUnit
        ? `p:${ing.productId}:${ing.parsedUnit}`
        : `t:${ing.rawText.toLowerCase().trim()}`;

      const existing = merged.get(key);
      if (existing) {
        if (existing.quantity != null && scaledQty != null) existing.quantity += scaledQty;
      } else {
        merged.set(key, {
          rawText: ing.rawText,
          productId: ing.productId,
          quantity: scaledQty,
          unit: ing.parsedUnit,
          recipeId: e.recipeId,
        });
      }
    }
  }

  // Resolve aisle categories for matched products
  const productIds = [...merged.values()].map(a => a.productId).filter(Boolean) as string[];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category: true } });
  const catById = new Map(products.map(p => [p.id, p.category]));

  const list = await prisma.shoppingList.create({
    data: {
      userId,
      name: `${plan.name} — liste`,
      items: {
        create: [...merged.values()].map((a, idx) => ({
          rawText: a.rawText,
          productId: a.productId,
          quantity: a.quantity != null ? Math.round(a.quantity * 100) / 100 : null,
          unit: a.unit,
          category: a.productId ? catById.get(a.productId) ?? null : null,
          recipeId: a.recipeId,
          sortOrder: idx,
        })),
      },
    },
  });

  return computeListCost(list.id);
}
