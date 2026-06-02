import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { schedule } from 'node-cron';
import { productsRoutes } from './routes/products.routes';
import { recipesRoutes } from './routes/recipes.routes';
import { scrapeAllPrices } from './services/price-scraper.service';

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
});

async function main() {
  await server.register(cors, { origin: true });
  await server.register(helmet);
  await server.register(sensible);

  server.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  await server.register(productsRoutes, { prefix: '/api/v1' });
  await server.register(recipesRoutes, { prefix: '/api/v1' });

  // TODO Phase 3: flyers routes

  // ─── Daily Flipp price scrape cron ─────────────────────────────────────────
  // Browser-free (runs fine in Docker). Every day at 6:00 AM.
  // Metro Playwright catalog scrape runs separately on the host (needs Chromium):
  //   pnpm exec tsx src/services/daily-scrape.service.ts
  schedule('0 6 * * *', async () => {
    console.log('[cron] Starting daily Flipp scrape...');
    try {
      const { matched } = await scrapeAllPrices();
      console.log(`[cron] Flipp scrape done: ${matched} prices.`);
    } catch (e) {
      console.error('[cron] Scrape failed:', e);
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`API running on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
