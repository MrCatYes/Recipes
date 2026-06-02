import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCurrentFlyers } from '../services/flyer.service';
import type { StoreChain } from '@epicerie/shared-types';

const CHAINS = ['IGA', 'Metro', 'Maxi', 'Walmart', 'Costco'] as const;

export async function flyersRoutes(app: FastifyInstance) {
  // GET /flyers?chains=Maxi,IGA  — current week's specials
  app.get('/flyers', async (req, reply) => {
    const schema = z.object({
      chains: z.string().optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    let chains: StoreChain[] | undefined;
    if (parsed.data.chains) {
      chains = parsed.data.chains
        .split(',')
        .map((c) => c.trim())
        .filter((c): c is StoreChain => (CHAINS as readonly string[]).includes(c));
    }

    return getCurrentFlyers(chains);
  });
}
