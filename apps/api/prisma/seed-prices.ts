/**
 * Seeds manual baseline prices from the canonical catalog.
 * These are the fallback when no flyer/scrape price exists for a product+chain.
 */

import { PrismaClient } from '@prisma/client';
import { CATALOG } from '../src/data/catalog';

const prisma = new PrismaClient();

async function main() {
  let count = 0;

  for (const entry of CATALOG) {
    const product = await prisma.product.findFirst({ where: { name: entry.name } });
    if (!product) { console.warn(`Product not found: ${entry.name}`); continue; }

    for (const [chain, priceCents] of Object.entries(entry.baseline)) {
      if (priceCents == null) continue;
      const store = await prisma.store.findFirst({ where: { chain: chain as never } });
      if (!store) { console.warn(`Store not found: ${chain}`); continue; }

      const sku = `manual-${product.id}`;
      const sp = await prisma.storeProduct.upsert({
        where: { productId_storeId_sku: { productId: product.id, storeId: store.id, sku } },
        create: { productId: product.id, storeId: store.id, sku, packageSize: entry.pkg.size, packageUnit: entry.pkg.unit },
        update: { packageSize: entry.pkg.size, packageUnit: entry.pkg.unit, lastSeenAt: new Date() },
      });

      await prisma.price.create({
        data: { storeProductId: sp.id, priceCents, source: 'manual' },
      });

      count++;
    }
    console.log(`✓ ${entry.name}`);
  }

  console.log(`\nDone. ${count} baseline prices seeded.`);
  await prisma.$disconnect();
}

main().catch(console.error);
