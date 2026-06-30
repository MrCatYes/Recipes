/**
 * One-time script: deduplicate Product rows that share the same name.
 * Keeps the row with the lowest createdAt (earliest), re-points all FK
 * references to it, then deletes the duplicates.
 *
 * Run with: npx tsx src/scripts/dedup-products.ts
 */

import { prisma } from '../db';

async function main() {
  const allProducts = await prisma.product.findMany({ orderBy: { createdAt: 'asc' } });

  // Group by name; keep first (oldest)
  const byName = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    const key = p.name;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(p);
  }

  let dedupCount = 0;
  for (const [name, rows] of byName.entries()) {
    if (rows.length <= 1) continue;

    const [keep, ...dupes] = rows;
    const dupeIds = dupes.map(r => r.id);

    // Re-point Ingredient.productId → winner
    const ingResult = await prisma.ingredient.updateMany({
      where: { productId: { in: dupeIds } },
      data: { productId: keep.id },
    });

    // Re-point FlyerItem.productId → winner
    const flyerResult = await prisma.flyerItem.updateMany({
      where: { productId: { in: dupeIds } },
      data: { productId: keep.id },
    });

    // Delete orphan UnitConversions first (FK to Product)
    await prisma.unitConversion.deleteMany({
      where: { productId: { in: dupeIds } },
    });

    // Delete orphan StoreProducts first (FK to Product)
    await prisma.storeProduct.deleteMany({
      where: { productId: { in: dupeIds } },
    });

    // Delete duplicate products
    await prisma.product.deleteMany({ where: { id: { in: dupeIds } } });

    console.log(
      `${name}: kept ${keep.id}, removed ${dupeIds.length} dupes` +
      ` (${ingResult.count} ingredients re-pointed, ${flyerResult.count} flyer items re-pointed)`,
    );
    dedupCount += dupeIds.length;
  }

  console.log(`\nTotal removed: ${dedupCount} duplicate products.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
