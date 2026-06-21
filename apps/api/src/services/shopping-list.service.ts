import { prisma } from '../db';
import { ConversionService } from './conversion.service';
import { getProductPrices } from './product.service';
import type {
  ShoppingListItemWithCost,
  ShoppingListWithCost,
  StoreChain,
} from '@epicerie/shared-types';

async function conversionFor(productId: string): Promise<ConversionService> {
  const rows = await prisma.unitConversion.findMany({
    where: { OR: [{ productId }, { productId: null }] },
  });
  return new ConversionService(rows);
}

/**
 * Full list with per-item cheapest cost and per-store basket totals.
 * - totalCostByStore: sum of item costs a store carries (shop-all-at-one).
 * - estimatedTotalCents: sum of each item's cheapest store (split shopping).
 */
export async function computeListCost(listId: string): Promise<ShoppingListWithCost | null> {
  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!list) return null;

  const totalsByStore: Partial<Record<StoreChain, number>> = {};
  const items: ShoppingListItemWithCost[] = [];
  let estimatedTotalCents: number | null = null;

  for (const it of list.items) {
    let cheapestCostCents: number | null = null;
    let cheapestStore: StoreChain | null = null;

    if (it.productId && it.quantity != null && it.unit) {
      const priceData = await getProductPrices(it.productId);
      if (priceData && priceData.prices.length) {
        const svc = await conversionFor(it.productId);
        for (const p of priceData.prices) {
          const portion = svc.costForPortion(
            it.quantity, it.unit, p.packageSize, p.packageUnit, p.priceCents, it.productId,
          );
          if (portion == null) continue;
          totalsByStore[p.chain] = (totalsByStore[p.chain] ?? 0) + portion;
          if (cheapestCostCents == null || portion < cheapestCostCents) {
            cheapestCostCents = portion;
            cheapestStore = p.chain;
          }
        }
      }
    }

    if (cheapestCostCents != null) {
      estimatedTotalCents = (estimatedTotalCents ?? 0) + cheapestCostCents;
    }

    items.push({
      id: it.id,
      listId: it.listId,
      productId: it.productId,
      rawText: it.rawText,
      quantity: it.quantity,
      unit: it.unit,
      category: it.category,
      checked: it.checked,
      recipeId: it.recipeId,
      sortOrder: it.sortOrder,
      cheapestCostCents,
      cheapestStore,
    });
  }

  const storeEntries = Object.entries(totalsByStore) as Array<[StoreChain, number]>;
  storeEntries.sort((a, b) => a[1] - b[1]);

  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
    items,
    totalCostByStore: totalsByStore,
    cheapestStore: storeEntries[0]?.[0] ?? null,
    cheapestTotalCents: storeEntries[0]?.[1] ?? null,
    estimatedTotalCents,
    itemCount: items.length,
    checkedCount: items.filter((i) => i.checked).length,
  };
}

/**
 * Append a recipe's ingredients to a list (skips ingredients already present
 * for the same product). Returns number of items added.
 */
export async function addRecipeToList(listId: string, recipeId: string): Promise<number> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!recipe) return 0;

  const existing = await prisma.shoppingListItem.findMany({
    where: { listId, productId: { not: null } },
    select: { productId: true },
  });
  const have = new Set(existing.map((e) => e.productId));

  const maxOrder = await prisma.shoppingListItem.aggregate({
    where: { listId }, _max: { sortOrder: true },
  });
  let order = (maxOrder._max.sortOrder ?? -1) + 1;

  // Resolve product categories for aisle grouping
  const productIds = recipe.ingredients.map((i) => i.productId).filter(Boolean) as string[];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } }, select: { id: true, category: true },
  });
  const catById = new Map(products.map((p) => [p.id, p.category]));

  const toAdd = recipe.ingredients.filter((ing) => !(ing.productId && have.has(ing.productId)));
  if (!toAdd.length) return 0;

  await prisma.shoppingListItem.createMany({
    data: toAdd.map((ing) => ({
      listId,
      productId: ing.productId,
      rawText: ing.rawText,
      quantity: ing.parsedQuantity,
      unit: ing.parsedUnit,
      category: ing.productId ? catById.get(ing.productId) ?? null : null,
      recipeId: recipe.id,
      sortOrder: order++,
    })),
  });
  return toAdd.length;
}
