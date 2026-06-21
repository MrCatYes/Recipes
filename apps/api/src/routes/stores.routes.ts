import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { findNearbyStores } from '../services/store.service';
import type { NearbyStoresResponse, StoreChain } from '@epicerie/shared-types';

const CHAINS = ['IGA', 'Metro', 'Maxi', 'Walmart', 'Costco', 'SuperC'] as const;

function parseChains(raw?: string): StoreChain[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(',').map(c => c.trim())
    .filter((c): c is StoreChain => (CHAINS as readonly string[]).includes(c));
  return list.length ? list : undefined;
}

export async function storesRoutes(app: FastifyInstance) {
  // GET /stores/nearby?lat=45.5&lng=-73.6&radius=10&chains=IGA,Maxi
  app.get('/stores/nearby', async (req, reply) => {
    const schema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().min(0.5).max(100).optional().default(10),
      chains: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional().default(50),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest('lat & lng requis');

    const stores = await findNearbyStores(parsed.data.lat, parsed.data.lng, parsed.data.radius, {
      chains: parseChains(parsed.data.chains),
      limit: parsed.data.limit,
    });
    return { stores } satisfies NearbyStoresResponse;
  });

  // GET /stores?chains=IGA  → all known stores (optionally by chain)
  app.get('/stores', async (req, reply) => {
    const schema = z.object({ chains: z.string().optional() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest('Invalid query');
    const chains = parseChains(parsed.data.chains);
    const stores = await prisma.store.findMany({
      where: chains?.length ? { chain: { in: chains } } : undefined,
      orderBy: [{ chain: 'asc' }, { name: 'asc' }],
    });
    return { stores };
  });
}
