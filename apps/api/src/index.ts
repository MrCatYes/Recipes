import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

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

  // TODO Phase 1: register routes (products, prices)
  // TODO Phase 2: register routes (recipes, parse)
  // TODO Phase 3: register routes (flyers, by-promos)

  const port = Number(process.env.PORT ?? 3000);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`API running on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
