import { prisma } from '../db';
import type { GetFlyersResponse, FlyerItem, StoreChain } from '@epicerie/shared-types';

function getWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getCurrentFlyers(chains?: StoreChain[]): Promise<GetFlyersResponse> {
  const weekOf = getWeekMonday();

  const rows = await prisma.flyerItem.findMany({
    where: {
      weekOf,
      ...(chains?.length ? { store: { chain: { in: chains } } } : {}),
    },
    include: { store: true, product: true },
    orderBy: { promoPriceCents: 'asc' },
  });

  // Manual baseline prices per (productId, storeId) — used to estimate savings
  // when the flyer itself doesn't carry a regular price.
  const baseline = await getBaselineMap();

  const items: FlyerItem[] = rows.map((r) => {
    // Prefer flyer's own regular price; else fall back to manual baseline (by chain).
    let regular = r.regularPriceCents;
    if ((regular == null || regular <= r.promoPriceCents) && r.productId) {
      const base = baseline.get(`${r.productId}:${r.store.chain}`);
      if (base != null && base > r.promoPriceCents) regular = base;
    }

    return {
      id: r.id,
      storeId: r.storeId,
      productId: r.productId,
      productName: r.product?.name ?? null,
      rawText: r.rawText,
      promoPriceCents: r.promoPriceCents,
      regularPriceCents: regular,
      weekOf: r.weekOf.toISOString(),
      chain: r.store.chain as StoreChain,
    };
  });

  return { weekOf: weekOf.toISOString(), items };
}

/** Latest manual baseline price keyed by `${productId}:${chain}` (cheapest if dup stores). */
async function getBaselineMap(): Promise<Map<string, number>> {
  const manual = await prisma.storeProduct.findMany({
    where: { sku: { startsWith: 'manual-' } },
    select: {
      productId: true,
      store: { select: { chain: true } },
      prices: {
        where: { source: 'manual' },
        orderBy: { capturedAt: 'desc' },
        take: 1,
        select: { priceCents: true },
      },
    },
  });

  const map = new Map<string, number>();
  for (const sp of manual) {
    const price = sp.prices[0]?.priceCents;
    if (price == null) continue;
    const key = `${sp.productId}:${sp.store.chain}`;
    const prev = map.get(key);
    if (prev == null || price < prev) map.set(key, price);
  }
  return map;
}
