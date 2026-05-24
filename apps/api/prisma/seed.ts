import { PrismaClient, StoreChain } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding unit conversions...');
  await seedUnitConversions();

  console.log('Seeding stores...');
  await seedStores();

  console.log('Seeding sample products...');
  await seedProducts();

  console.log('Done.');
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
  // ~15 common products to bootstrap Phase 1 comparator
  const products = [
    { name: 'Farine tout-usage',     brand: 'Robin Hood', category: 'Farine', defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Sucre blanc',           brand: 'Redpath',    category: 'Sucre',  defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Beurre non salé',       brand: null,         category: 'Produits laitiers', defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Lait 3,25%',            brand: 'Natrel',     category: 'Produits laitiers', defaultUnit: 'ml', defaultUnitType: 'volume' as const },
    { name: 'Crème 35%',             brand: null,         category: 'Produits laitiers', defaultUnit: 'ml', defaultUnitType: 'volume' as const },
    { name: 'Oeufs gros',            brand: null,         category: 'Oeufs',  defaultUnit: 'unit', defaultUnitType: 'count' as const },
    { name: 'Huile canola',          brand: null,         category: 'Huiles', defaultUnit: 'ml', defaultUnitType: 'volume' as const },
    { name: 'Huile d\'olive extra vierge', brand: null,  category: 'Huiles', defaultUnit: 'ml', defaultUnitType: 'volume' as const },
    { name: 'Riz blanc long grain',  brand: 'Uncle Ben\'s', category: 'Féculents', defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Pâtes spaghetti',       brand: 'Barilla',   category: 'Féculents', defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Poitrine de poulet',    brand: null,         category: 'Viandes', defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Boeuf haché maigre',    brand: null,         category: 'Viandes', defaultUnit: 'g', defaultUnitType: 'weight' as const },
    { name: 'Tomates en dés',        brand: 'Hunts',     category: 'Conserves', defaultUnit: 'ml', defaultUnitType: 'volume' as const },
    { name: 'Pois chiches en conserve', brand: null,     category: 'Légumineuses', defaultUnit: 'ml', defaultUnitType: 'volume' as const },
    { name: 'Levure chimique',       brand: 'Magic',     category: 'Épices', defaultUnit: 'g', defaultUnitType: 'weight' as const },
  ];

  await prisma.product.createMany({ data: products, skipDuplicates: true });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
