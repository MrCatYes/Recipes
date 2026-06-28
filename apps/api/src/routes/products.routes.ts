import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { searchProducts, getProductPrices } from '../services/product.service';
import { findSubstitutions } from '../services/substitution.service';

export async function productsRoutes(app: FastifyInstance) {
  // GET /products?q=farine&category=Farine&limit=20
  app.get('/products', async (req, reply) => {
    const schema = z.object({
      q:        z.string().optional().default(''),
      category: z.string().optional(),
      limit:    z.coerce.number().min(1).max(100).optional().default(20),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const result = await searchProducts(parsed.data.q, parsed.data.category, parsed.data.limit);
    return result;
  });

  // GET /products/:id
  app.get<{ Params: { id: string } }>('/products/:id', async (req, reply) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return reply.notFound('Product not found');
    return product;
  });

  // GET /products/:id/prices
  app.get<{ Params: { id: string } }>('/products/:id/prices', async (req, reply) => {
    const result = await getProductPrices(req.params.id);
    if (!result) return reply.notFound('Product not found');
    return result;
  });

  // GET /products/:id/history?days=90 — price history for charts
  app.get<{ Params: { id: string } }>('/products/:id/history', async (req, reply) => {
    const days = Number((req.query as Record<string, string>).days ?? '90');
    const since = new Date(Date.now() - days * 86400_000);

    const prices = await prisma.price.findMany({
      where: {
        storeProduct: { productId: req.params.id },
        capturedAt: { gte: since },
      },
      include: { storeProduct: { include: { store: true } } },
      orderBy: { capturedAt: 'asc' },
    });

    const flyerPrices = await prisma.flyerItem.findMany({
      where: {
        productId: req.params.id,
        weekOf: { gte: since },
      },
      include: { store: true },
      orderBy: { weekOf: 'asc' },
    });

    return {
      prices: prices.map(p => ({
        date: p.capturedAt.toISOString().split('T')[0],
        priceCents: p.priceCents,
        chain: p.storeProduct.store.chain,
        source: p.source,
      })),
      flyerPrices: flyerPrices.map(f => ({
        date: f.weekOf.toISOString().split('T')[0],
        promoPriceCents: f.promoPriceCents,
        regularPriceCents: f.regularPriceCents,
        chain: f.store.chain,
      })),
    };
  });

  // GET /products/:id/substitutions?chains=Maxi,IGA
  app.get<{ Params: { id: string } }>('/products/:id/substitutions', async (req, reply) => {
    const chainsParam = (req.query as Record<string, string>).chains ?? '';
    const chains = chainsParam ? chainsParam.split(',') : ['Maxi', 'IGA', 'Metro', 'SuperC', 'Walmart', 'Costco'];
    return findSubstitutions(req.params.id, chains);
  });

  // GET /products/categories — list all product categories with counts
  app.get('/products/categories', async () => {
    const cats = await prisma.product.groupBy({
      by: ['category'],
      _count: true,
      orderBy: { category: 'asc' },
    });
    return cats.map(c => ({ category: c.category, count: c._count }));
  });

  // GET /products/prices?q=farine  (search + best prices in one call for compare screen)
  app.get('/products/prices', async (req, reply) => {
    const schema = z.object({ q: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return reply.badRequest('q is required');

    const { products } = await searchProducts(parsed.data.q, undefined, 1);
    if (!products.length) return reply.notFound('No product found');

    const result = await getProductPrices(products[0].id);
    if (!result) return reply.notFound('Product not found');
    return result;
  });

  // POST /products  (admin: create product)
  app.post('/products', async (req, reply) => {
    const schema = z.object({
      name:            z.string().min(1),
      brand:           z.string().optional(),
      category:        z.string().min(1),
      gtin:            z.string().optional(),
      defaultUnit:     z.string().min(1),
      defaultUnitType: z.enum(['weight', 'volume', 'count']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const product = await prisma.product.create({ data: parsed.data });
    return reply.code(201).send(product);
  });

  // POST /products/:id/prices  (admin: record a price observation)
  app.post<{ Params: { id: string } }>('/products/:id/prices', async (req, reply) => {
    const schema = z.object({
      storeId:     z.string().min(1),
      priceCents:  z.number().int().positive(),
      packageSize: z.number().positive(),
      packageUnit: z.string().min(1),
      sku:         z.string().optional(),
      source:      z.enum(['manual', 'scrape', 'flyer']).default('manual'),
      validFrom:   z.string().datetime().optional(),
      validTo:     z.string().datetime().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return reply.notFound('Product not found');

    const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId } });
    if (!store) return reply.notFound('Store not found');

    const { storeId, priceCents, packageSize, packageUnit, sku, source, validFrom, validTo } = parsed.data;

    const storeProduct = await prisma.storeProduct.upsert({
      where: {
        productId_storeId_sku: {
          productId: req.params.id,
          storeId,
          sku: sku ?? '',
        },
      },
      update: { packageSize, packageUnit, lastSeenAt: new Date() },
      create: { productId: req.params.id, storeId, sku: sku ?? null, packageSize, packageUnit },
    });

    const price = await prisma.price.create({
      data: {
        storeProductId: storeProduct.id,
        priceCents,
        source,
        validFrom: validFrom ? new Date(validFrom) : null,
        validTo:   validTo   ? new Date(validTo)   : null,
      },
    });

    return reply.code(201).send({ storeProduct, price });
  });
}
