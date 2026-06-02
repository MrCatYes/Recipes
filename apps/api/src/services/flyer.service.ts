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

  const items: FlyerItem[] = rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    productId: r.productId,
    productName: r.product?.name ?? null,
    rawText: r.rawText,
    promoPriceCents: r.promoPriceCents,
    regularPriceCents: r.regularPriceCents,
    weekOf: r.weekOf.toISOString(),
    chain: r.store.chain as StoreChain,
  }));

  return { weekOf: weekOf.toISOString(), items };
}
