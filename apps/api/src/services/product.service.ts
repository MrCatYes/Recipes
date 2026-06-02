import { prisma } from '../db';
import { ConversionService } from './conversion.service';
import type { GetPricesResponse, PriceWithStore, SearchProductsResponse, StoreChain } from '@epicerie/shared-types';

async function getConversionService(productId?: string): Promise<ConversionService> {
  const conversions = await prisma.unitConversion.findMany({
    where: productId ? { OR: [{ productId }, { productId: null }] } : { productId: null },
  });
  return new ConversionService(conversions);
}

export async function searchProducts(q: string, category?: string, limit = 20): Promise<SearchProductsResponse> {
  const products = await prisma.product.findMany({
    where: {
      AND: [
        q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
          ],
        } : {},
        category ? { category: { equals: category, mode: 'insensitive' } } : {},
      ],
    },
    take: limit,
    orderBy: { name: 'asc' },
  });

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      gtin: p.gtin,
      defaultUnit: p.defaultUnit,
      defaultUnitType: p.defaultUnitType as 'weight' | 'volume' | 'count',
    })),
    total: products.length,
  };
}

export async function getProductPrices(productId: string): Promise<GetPricesResponse | null> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const svc = await getConversionService(productId);

  // Latest price per store_product
  const storeProducts = await prisma.storeProduct.findMany({
    where: { productId },
    include: {
      store: true,
      prices: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
    },
  });

  const prices: Array<PriceWithStore & { source: string }> = [];
  const baselineByChain = new Map<string, number>(); // manual price per chain

  for (const sp of storeProducts) {
    const latest = sp.prices[0];
    if (!latest) continue;

    const chain = sp.store.chain as StoreChain;
    if (latest.source === 'manual') {
      const prev = baselineByChain.get(chain);
      if (prev == null || latest.priceCents < prev) baselineByChain.set(chain, latest.priceCents);
    }

    const perUnit = svc.pricePerBaseUnit(sp.packageSize, sp.packageUnit, latest.priceCents);

    prices.push({
      chain,
      storeName: sp.store.name,
      priceCents: latest.priceCents,
      packagePriceCents: latest.priceCents,
      packageSize: sp.packageSize,
      packageUnit: sp.packageUnit,
      pricePerUnit: perUnit?.cents ?? 0,
      capturedAt: latest.capturedAt.toISOString(),
      isPromo: false, // recomputed after dedup vs baseline
      source: latest.source,
    });
  }

  // Dedup per chain. Prefer real data (flyer/scrape) over manual baseline;
  // within same source tier, keep cheapest package price.
  const sourceRank = (s: string) => (s === 'manual' ? 0 : 1); // higher = better
  const cheapestByChain = new Map<string, PriceWithStore & { source: string }>();
  for (const p of prices) {
    const existing = cheapestByChain.get(p.chain);
    if (!existing) { cheapestByChain.set(p.chain, p); continue; }
    const better =
      sourceRank(p.source) > sourceRank(existing.source) ||
      (sourceRank(p.source) === sourceRank(existing.source) && p.priceCents < existing.priceCents);
    if (better) cheapestByChain.set(p.chain, p);
  }

  // A kept price is a promo if it's a real (non-manual) price meaningfully below
  // that chain's manual baseline (≥5% cheaper).
  for (const [chain, p] of cheapestByChain) {
    const base = baselineByChain.get(chain);
    p.isPromo = p.source !== 'manual' && base != null && p.priceCents <= base * 0.95;
  }
  // Sort by absolute package price. Per-unit price is unreliable here because
  // flyer items frequently have an unparseable package size.
  const dedupedPrices: PriceWithStore[] = Array.from(cheapestByChain.values())
    .map(({ source: _source, ...p }) => p)
    .sort((a, b) => a.priceCents - b.priceCents);

  const cheapestChain = dedupedPrices[0]?.chain ?? null;

  return {
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      gtin: product.gtin,
      defaultUnit: product.defaultUnit,
      defaultUnitType: product.defaultUnitType as 'weight' | 'volume' | 'count',
    },
    prices: dedupedPrices,
    cheapestChain,
  };
}
