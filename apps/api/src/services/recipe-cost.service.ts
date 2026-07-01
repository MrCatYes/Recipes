import { prisma } from '../db';
import { ConversionService } from './conversion.service';
import { getProductPrices } from './product.service';
import { searchCatalog } from './catalog-search.service';
import { parseIngredientRegex } from './ingredient-matcher.service';
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

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Long-tail pricing: when an ingredient has no curated product match, search the
 * full crawled catalog (CatalogItem) and return the cheapest plausible item per
 * chain, with the recipe portion prorated.
 */
async function catalogFallback(
  rawText: string,
  qty: number,
  unit: string | null,
  universalSvc: ConversionService,
): Promise<PriceWithStore[]> {
  const term = parseIngredientRegex(rawText).productName?.trim();
  if (!term || term.length < 3) return [];

  const candidates = await searchCatalog(term, undefined, 30, 0.2);
  if (!candidates.length) return [];

  // Head-noun guard: keep candidates that share the longest word of the term
  // (≥4 chars) — avoids "huile de maïs" matching "fécule de maïs".
  const words = norm(term).split(/[^a-z0-9]+/).filter(w => w.length >= 4).sort((a, b) => b.length - a.length);
  const head = words[0];
  const guarded = head ? candidates.filter(c => norm(c.name).includes(head)) : candidates;
  const pool = guarded.length ? guarded : candidates;

  // Cheapest prorated cost per chain
  const recipeIsCount = !unit || ['unit', 'unité', 'pièce', 'tranche'].includes(unit);

  const bestByChain = new Map<string, PriceWithStore>();
  for (const c of pool) {
    // Skip unit-packaged catalog items when recipe measures by weight/volume —
    // we can't prorate "500 ml" against "1 unit" without knowing the can size.
    const pkgIsCount = c.packageUnit === 'unit';
    if (pkgIsCount && !recipeIsCount) continue;

    let portion: number | null;
    if (!unit || recipeIsCount) {
      if (pkgIsCount) {
        // count-to-count: prorate recipe qty against package size
        // e.g. "2 poivrons" from a "4-pack for $5.99" → 2/4 × 599 = $2.995
        portion = Math.round(c.priceCents * qty / c.packageSize);
      } else {
        // recipe is count but package is weight/volume — use full package price as
        // best approximation (1 oeuf = 1 carton, 1 oignon = 1 bag, etc.)
        portion = c.priceCents;
      }
    } else {
      portion = universalSvc.costForPortion(qty, unit, c.packageSize, c.packageUnit, c.priceCents);
    }
    if (portion == null || portion <= 0) continue;

    // Sanity cap: single ingredient > $25 is almost certainly a unit mismatch
    if (portion > 2500) continue;

    const existing = bestByChain.get(c.chain);
    if (!existing || portion < existing.priceCents) {
      bestByChain.set(c.chain, {
        chain: c.chain,
        storeName: c.chain,
        priceCents: portion,
        packagePriceCents: c.priceCents,
        packageSize: c.packageSize,
        packageUnit: c.packageUnit,
        pricePerUnit: 0,
        capturedAt: new Date().toISOString(),
        isPromo: false,
      });
    }
  }
  return Array.from(bestByChain.values()).sort((a, b) => a.priceCents - b.priceCents);
}

export async function computeRecipeCost(recipeId: string): Promise<RecipeWithCost | null> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true },
  });
  if (!recipe) return null;

  const totalsByStore: Record<string, number> = {};
  const countByStore: Record<string, number> = {};  // how many ingredients priced at each store
  const ingredientsWithCost: IngredientWithCost[] = [];

  // Universal conversions (no product-specific densities) for catalog fallback.
  const universalSvc = new ConversionService(
    await prisma.unitConversion.findMany({ where: { productId: null } }),
  );

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
    const qty = ing.parsedQuantity;

    let product: IngredientWithCost['product'] = null;
    let costByStore: PriceWithStore[] = [];

    // 1. Curated product path (precise prices for known staples)
    if (ing.productId && qty != null) {
      const priceData = await getProductPrices(ing.productId);
      if (priceData) {
        product = priceData.product;
        const effectiveUnit = ing.parsedUnit ?? (priceData.product.defaultUnitType === 'count' ? 'unit' : null);
        if (effectiveUnit && priceData.prices.length) {
          const svc = await loadConversionSvc(ing.productId);
          const cb: PriceWithStore[] = [];
          for (const p of priceData.prices) {
            const portion = svc.costForPortion(qty, effectiveUnit, p.packageSize, p.packageUnit, p.priceCents, ing.productId);
            if (portion === null) continue;
            cb.push({ ...p, priceCents: portion, packagePriceCents: p.packagePriceCents });
          }
          const byChain = new Map<string, PriceWithStore>();
          for (const p of cb) {
            const e = byChain.get(p.chain);
            if (!e || p.priceCents < e.priceCents) byChain.set(p.chain, p);
          }
          costByStore = Array.from(byChain.values()).sort((a, b) => a.priceCents - b.priceCents);
        }
      }
    }

    // 2. Long-tail fallback: full crawled catalog (covers items absent from the
    //    curated catalog — cacao, chocolat noir, fleur de sel, etc.)
    if (costByStore.length === 0 && qty != null) {
      costByStore = await catalogFallback(ing.rawText, qty, ing.parsedUnit, universalSvc);
    }

    for (const p of costByStore) {
      totalsByStore[p.chain] = (totalsByStore[p.chain] ?? 0) + p.priceCents;
      countByStore[p.chain] = (countByStore[p.chain] ?? 0) + 1;
    }

    ingredientsWithCost.push({
      ...base,
      product,
      costByStore,
      cheapestCostCents: costByStore[0]?.priceCents ?? null,
      cheapestStore: costByStore[0]?.chain ?? null,
    });
  }

  // Only consider stores with prices for ≥70% of priceable ingredients.
  // Use count of ingredients that actually have at least one price (not just productId)
  // to avoid inflating the denominator with productId-linked but unpriced items (e.g. gélatine).
  const matchedCount = ingredientsWithCost.filter(i => i.costByStore.length > 0).length;
  const minCoverage = Math.max(1, Math.ceil(matchedCount * 0.7));
  const filteredStores = Object.entries(totalsByStore)
    .filter(([chain]) => (countByStore[chain] ?? 0) >= minCoverage);
  const sortedStores = filteredStores.length
    ? filteredStores.sort((a, b) => a[1] - b[1])
    : Object.entries(totalsByStore).sort((a, b) => a[1] - b[1]);
  const cheapestStore = sortedStores[0] ? sortedStores[0][0] as StoreChain : null;
  const cheapestTotalCents = sortedStores[0] ? sortedStores[0][1] : null;

  return {
    id: recipe.id,
    sourceUrl: recipe.sourceUrl,
    title: recipe.title,
    category: recipe.category,
    difficulty: recipe.difficulty as RecipeWithCost['difficulty'],
    servings: recipe.servings,
    imageUrl: recipe.imageUrl,
    description: recipe.description ?? null,
    dietaryTags: recipe.dietaryTags ?? [],
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
