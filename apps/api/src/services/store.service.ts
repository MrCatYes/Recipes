import { prisma } from '../db';
import type { NearbyStore, StoreChain } from '@epicerie/shared-types';

/** Great-circle distance in km between two lat/lng points (Haversine). Pure. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Stores within `radiusKm` of (lat,lng), nearest first.
 * In-memory Haversine over the Store table (fine for a few hundred stores;
 * swap for PostGIS if the table grows large).
 */
export async function findNearbyStores(
  lat: number,
  lng: number,
  radiusKm = 10,
  opts: { chains?: StoreChain[]; limit?: number } = {},
): Promise<NearbyStore[]> {
  const stores = await prisma.store.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      ...(opts.chains?.length ? { chain: { in: opts.chains } } : {}),
    },
  });

  const withDist = stores
    .map((s) => ({
      id: s.id,
      chain: s.chain as StoreChain,
      name: s.name,
      address: s.address,
      city: s.city,
      postalCode: s.postalCode,
      latitude: s.latitude!,
      longitude: s.longitude!,
      distanceKm: Math.round(haversineKm(lat, lng, s.latitude!, s.longitude!) * 10) / 10,
    }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return opts.limit ? withDist.slice(0, opts.limit) : withDist;
}
