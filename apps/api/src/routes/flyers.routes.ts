import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCurrentFlyers } from '../services/flyer.service';
import { crawlFlippFlyers } from '../services/crawl/flipp-flyers.crawler';
import type { StoreChain } from '@epicerie/shared-types';

const CHAINS = ['IGA', 'Metro', 'Maxi', 'Walmart', 'Costco', 'SuperC'] as const;
const CRAWL_SECRET = process.env.CRAWL_SECRET ?? '';

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

  // POST /flyers/crawl — trigger a crawl (protected by secret)
  app.post('/flyers/crawl', async (req, reply) => {
    const { secret } = (req.body ?? {}) as Record<string, unknown>;
    if (!CRAWL_SECRET || secret !== CRAWL_SECRET) {
      return reply.code(403).send({ error: 'Invalid crawl secret' });
    }

    // Run in background, return immediately
    crawlFlippFlyers()
      .then(r => app.log.info(`Crawl done: ${r.totalItems} items, ${r.matched} matched`))
      .catch(e => app.log.error(`Crawl failed: ${e}`));

    return { status: 'started' };
  });

  // GET /flyers/stats — crawl stats
  app.get('/flyers/stats', async () => {
    const { prisma } = await import('../db');
    const [total, matched, productCount, recipeCount, storeCount, latestItem] = await Promise.all([
      prisma.flyerItem.count(),
      prisma.flyerItem.count({ where: { productId: { not: null } } }),
      prisma.product.count(),
      prisma.recipe.count(),
      prisma.store.count(),
      prisma.flyerItem.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      totalItems: total,
      matchedToProducts: matched,
      matchRate: total > 0 ? `${((matched / total) * 100).toFixed(1)}%` : '0%',
      productCount,
      recipeCount,
      storeCount,
      lastCrawl: latestItem?.createdAt ?? null,
    };
  });
}
