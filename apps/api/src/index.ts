import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { productsRoutes } from './routes/products.routes';
import { recipesRoutes } from './routes/recipes.routes';

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

  const port = Number(process.env.PORT ?? 3000);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`API running on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
