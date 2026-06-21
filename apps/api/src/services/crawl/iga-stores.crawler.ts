/**
 * Populate the Store table with real IGA locations from IGA's Algolia store index
 * (dxp_stores_fr — carries _geoloc lat/lng, address, store id in slug).
 * Enables nearby-store geolocation.
 *
 *   pnpm exec tsx --env-file=.env src/services/crawl/iga-stores.crawler.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APP_ID = 'L0APUSIH50';
const API_KEY = '022f6cbb0292d0e78f65897fd6dabad9';
const INDEX = 'dxp_stores_fr';

interface StoreHit {
  locationName?: string;
  slug?: string; // e.g. "8253-iga-atwater"
  _geoloc?: { lat: number; lng: number };
  address?: { address1?: string; city?: string; province?: string; postalCode?: string };
}

async function algolia(body: Record<string, unknown>): Promise<{ hits: StoreHit[]; nbHits: number }> {
  const url = `https://${APP_ID}-dsn.algolia.net/1/indexes/${INDEX}/query` +
    `?x-algolia-api-key=${API_KEY}&x-algolia-application-id=${APP_ID}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.iga.ca/', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Algolia ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json() as Promise<{ hits: StoreHit[]; nbHits: number }>;
}

/** Store id is the numeric prefix of the slug ("8253-iga-atwater" → "8253"). */
function externalIdFromSlug(slug: string | undefined): string | null {
  const m = (slug ?? '').match(/^(\d+)/);
  return m ? m[1] : null;
}

export async function crawlIgaStores(): Promise<void> {
  console.log('Fetching IGA stores from Algolia...');
  let saved = 0;
  for (let page = 0; page < 20; page++) {
    const r = await algolia({ query: '', hitsPerPage: 1000, page });
    if (!r.hits.length) break;

    for (const h of r.hits) {
      const externalId = externalIdFromSlug(h.slug);
      const name = h.locationName?.trim();
      const geo = h._geoloc;
      if (!externalId || !name || !geo) continue;

      await prisma.store.upsert({
        where: { chain_externalId: { chain: 'IGA', externalId } },
        create: {
          chain: 'IGA', externalId, name,
          address: h.address?.address1 ?? null,
          city: h.address?.city ?? null,
          postalCode: h.address?.postalCode ?? null,
          latitude: geo.lat, longitude: geo.lng,
        },
        update: {
          name,
          address: h.address?.address1 ?? null,
          city: h.address?.city ?? null,
          postalCode: h.address?.postalCode ?? null,
          latitude: geo.lat, longitude: geo.lng,
          updatedAt: new Date(),
        },
      });
      saved++;
    }
    if (r.hits.length < 1000) break;
  }

  const count = await prisma.store.count({ where: { chain: 'IGA' } });
  console.log(`✅ IGA stores done. ${saved} upserts, ${count} IGA stores total.`);
}

if (process.argv[1]?.includes('iga-stores')) {
  crawlIgaStores().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });
}
