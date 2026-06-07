import { prisma } from '../db';
import type { StoreChain } from '@epicerie/shared-types';

export interface CatalogMatch {
  id: string;
  chain: StoreChain;
  name: string;
  brand: string | null;
  category: string | null;
  priceCents: number;
  packageSize: number;
  packageUnit: string;
  url: string | null;
  sim: number;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Trigram search over the crawled CatalogItem table.
 * Returns items whose name is similar to `term`, ranked by similarity.
 */
export async function searchCatalog(
  term: string,
  chains?: StoreChain[],
  limit = 12,
  minSim = 0.18,
): Promise<CatalogMatch[]> {
  const q = norm(term);
  if (q.length < 2) return [];

  const chainFilter = chains?.length ? chains : null;

  const rows = await prisma.$queryRaw<CatalogMatch[]>`
    SELECT id, chain, name, brand, category, "priceCents", "packageSize", "packageUnit", url,
           similarity(lower(name), ${q}) AS sim
    FROM "CatalogItem"
    WHERE similarity(lower(name), ${q}) >= ${minSim}
      ${chainFilter ? prismaIn(chainFilter) : prismaEmpty()}
    ORDER BY sim DESC
    LIMIT ${limit}
  `;
  return rows;
}

// Helpers to conditionally inject the chain filter into the tagged template.
import { Prisma } from '@prisma/client';
function prismaIn(chains: StoreChain[]) {
  return Prisma.sql`AND chain::text = ANY(${chains})`;
}
function prismaEmpty() {
  return Prisma.empty;
}
