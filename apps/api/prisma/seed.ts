import { PrismaClient, StoreChain } from '@prisma/client';
import { CATALOG } from '../src/data/catalog';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding unit conversions...');
  await seedUnitConversions();

  console.log('Seeding stores...');
  await seedStores();

  console.log('Seeding sample products...');
  await seedProducts();

  console.log('Seeding product densities...');
  await seedDensities();

  console.log('Done.');
}

// Per-product ml→g density conversions (e.g. tsp of salt → grams), so recipes
// that measure weight-products by volume can be costed.
async function seedDensities() {
  for (const p of CATALOG) {
    if (p.densityGPerMl == null) continue;
    const product = await prisma.product.findFirst({ where: { name: p.name } });
    if (!product) continue;

    for (const [from, to, factor] of [
      ['ml', 'g', p.densityGPerMl],
      ['g', 'ml', 1 / p.densityGPerMl],
    ] as const) {
      await prisma.unitConversion.upsert({
        where: { fromUnit_toUnit_productId: { fromUnit: from, toUnit: to, productId: product.id } },
        create: { fromUnit: from, toUnit: to, productId: product.id, factor },
        update: { factor },
      });
    }
  }
}

async function seedUnitConversions() {
  const conversions = [
    // ─── Volume: base = ml ──────────────────────────────────────────
    { from: 'L',     to: 'ml',   factor: 1000 },
    { from: 'ml',    to: 'L',    factor: 0.001 },
    { from: 'tasse', to: 'ml',   factor: 250 },   // 1 tasse = 250 ml (QC)
    { from: 'c. à s.', to: 'ml', factor: 15 },    // cuillère à soupe
    { from: 'c. à t.', to: 'ml', factor: 5 },     // cuillère à thé
    { from: 'oz fl', to: 'ml',   factor: 29.5735 },
    { from: 'pinte', to: 'ml',   factor: 946.353 },
    // ─── Weight: base = g ───────────────────────────────────────────
    { from: 'kg',    to: 'g',    factor: 1000 },
    { from: 'g',     to: 'kg',   factor: 0.001 },
    { from: 'lb',    to: 'g',    factor: 453.592 },
    { from: 'oz',    to: 'g',    factor: 28.3495 },
    // ─── Volume → Weight (densities): universal approximations ──────
    // These are product-specific in production but universal fallbacks here
    { from: 'tasse', to: 'g', factor: 200 },  // generic density fallback
  ];

  await prisma.unitConversion.createMany({
    data: conversions.map((c) => ({
      fromUnit: c.from,
      toUnit: c.to,
      factor: c.factor,
      productId: null,
    })),
    skipDuplicates: true,
  });
}

async function seedStores() {
  const chains: Array<{ chain: StoreChain; name: string; city: string }> = [
    { chain: 'IGA',     name: 'IGA Montréal Centre',    city: 'Montréal' },
    { chain: 'Metro',   name: 'Metro Plateau',           city: 'Montréal' },
    { chain: 'Maxi',    name: 'Maxi Anjou',              city: 'Montréal' },
    { chain: 'Walmart', name: 'Walmart Supercentre Laval', city: 'Laval' },
    { chain: 'Costco',  name: 'Costco Montréal',         city: 'Montréal' },
  ];

  await prisma.store.createMany({ data: chains, skipDuplicates: true });
}

async function seedProducts() {
  // Derived from canonical catalog (src/data/catalog.ts)
  const products = CATALOG.map((p) => ({
    name: p.name,
    brand: p.brand,
    category: p.category,
    defaultUnit: p.defaultUnit,
    defaultUnitType: p.defaultUnitType,
  }));

  await prisma.product.createMany({ data: products, skipDuplicates: true });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
