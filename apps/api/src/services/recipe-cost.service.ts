import { prisma } from '../db';
import { ConversionService } from './conversion.service';
import { getProductPrices } from './product.service';
import type {
  IngredientWithCost,
  PriceWithStore,
  RecipeWithCost,
  StoreChain,
} from '@epicerie/shared-types';

async function loadConversionSvc(productId: string): Promise<ConversionService> {
  const conversions = await prisma.unitConversion.findMany({
    where: { OR: [{ productId }, { productId: null }] },
  });
  return new ConversionService(conversions);
}

export async function computeRecipeCost(recipeId: string): Promise<RecipeWithCost | null> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true },
  });
  if (!recipe) return null;

  const totalsByStore: Record<string, number> = {};
  const ingredientsWithCost: IngredientWithCost[] = [];

  for (const ing of recipe.ingredients) {
    const base: Omit<IngredientWithCost, 'product' | 'costByStore' | 'cheapestCostCents' | 'cheapestStore'> = {
      id: ing.id,
      recipeId: ing.recipeId,
      rawText: ing.rawText,
      parsedQuantity: ing.parsedQuantity,
      parsedUnit: ing.parsedUnit,
      productId: ing.productId,
      notes: ing.notes,
    };

    if (!ing.productId || ing.parsedQuantity == null || !ing.parsedUnit) {
      ingredientsWithCost.push({ ...base, product: null, costByStore: [], cheapestCostCents: null, cheapestStore: null });
      continue;
    }

    const priceData = await getProductPrices(ing.productId);
    if (!priceData || priceData.prices.length === 0) {
      ingredientsWithCost.push({ ...base, product: priceData?.product ?? null, costByStore: [], cheapestCostCents: null, cheapestStore: null });
      continue;
    }

    const svc = await loadConversionSvc(ing.productId);

    const costByStore: PriceWithStore[] = [];
    for (const p of priceData.prices) {
      // Skip prices with an unparsed package size. packageSize=1 is the parser's
      // default fallback (flyer items without a size) — our staples are always
      // sold in larger packages (454g, 2L, 12 eggs...), so size<=1 = garbage and
      // would wildly inflate the prorated cost.
      if (p.packageSize <= 1) continue;

      const portionCents = svc.costForPortion(
        ing.parsedQuantity,
        ing.parsedUnit,
        p.packageSize,
        p.packageUnit,
        p.priceCents,
        ing.productId,
      );
      if (portionCents === null) continue;
      costByStore.push({ ...p, priceCents: portionCents, packagePriceCents: p.packagePriceCents });
    }

    // Keep cheapest per chain only (avoid double-counting flipp + manual + scrape duplicates)
    const cheapestByChain = new Map<string, PriceWithStore>();
    for (const p of costByStore) {
      const existing = cheapestByChain.get(p.chain);
      if (!existing || p.priceCents < existing.priceCents) {
        cheapestByChain.set(p.chain, p);
      }
    }
    const dedupedCostByStore = Array.from(cheapestByChain.values())
      .sort((a, b) => a.priceCents - b.priceCents);

    // Accumulate per-store totals from deduped prices only
    for (const p of dedupedCostByStore) {
      totalsByStore[p.chain] = (totalsByStore[p.chain] ?? 0) + p.priceCents;
    }

    ingredientsWithCost.push({
      ...base,
      product: priceData.product,
      costByStore: dedupedCostByStore,
      cheapestCostCents: dedupedCostByStore[0]?.priceCents ?? null,
      cheapestStore: dedupedCostByStore[0]?.chain ?? null,
    });
  }

  const sortedStores = Object.entries(totalsByStore).sort((a, b) => a[1] - b[1]);
  const cheapestStore = sortedStores[0] ? sortedStores[0][0] as StoreChain : null;
  const cheapestTotalCents = sortedStores[0] ? sortedStores[0][1] : null;

  return {
    id: recipe.id,
    sourceUrl: recipe.sourceUrl,
    title: recipe.title,
    servings: recipe.servings,
    imageUrl: recipe.imageUrl,
    instructions: recipe.instructions as string[],
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    ingredients: ingredientsWithCost,
    totalCostByStore: totalsByStore as Record<StoreChain, number>,
    cheapestStore,
    cheapestTotalCents,
    costPerServingCents: cheapestTotalCents != null
      ? Math.round(cheapestTotalCents / recipe.servings)
      : null,
  };
}
