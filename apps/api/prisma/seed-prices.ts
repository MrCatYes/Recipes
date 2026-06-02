import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Average Quebec prices (manual, realistic as of 2026)
const MANUAL_PRICES: Array<{
  productName: string;
  chain: 'Maxi' | 'IGA' | 'Metro';
  priceCents: number;
  packageSize: number;
  packageUnit: string;
}> = [
  // Maxi
  { productName: 'Farine tout-usage',          chain: 'Maxi', priceCents: 499,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Sucre blanc',                chain: 'Maxi', priceCents: 399,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Beurre non salé',            chain: 'Maxi', priceCents: 699,  packageSize: 454,  packageUnit: 'g' },
  { productName: 'Lait 3,25%',                 chain: 'Maxi', priceCents: 599,  packageSize: 2000, packageUnit: 'ml' },
  { productName: 'Crème 35%',                  chain: 'Maxi', priceCents: 449,  packageSize: 473,  packageUnit: 'ml' },
  { productName: 'Oeufs gros',                 chain: 'Maxi', priceCents: 499,  packageSize: 12,   packageUnit: 'unit' },
  { productName: 'Huile canola',               chain: 'Maxi', priceCents: 699,  packageSize: 1000, packageUnit: 'ml' },
  { productName: "Huile d'olive extra vierge", chain: 'Maxi', priceCents: 999,  packageSize: 500,  packageUnit: 'ml' },
  { productName: 'Riz blanc long grain',       chain: 'Maxi', priceCents: 599,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Pâtes spaghetti',            chain: 'Maxi', priceCents: 199,  packageSize: 450,  packageUnit: 'g' },
  { productName: 'Poitrine de poulet',         chain: 'Maxi', priceCents: 1299, packageSize: 600,  packageUnit: 'g' },
  { productName: 'Boeuf haché maigre',         chain: 'Maxi', priceCents: 899,  packageSize: 454,  packageUnit: 'g' },
  { productName: 'Tomates en dés',             chain: 'Maxi', priceCents: 149,  packageSize: 796,  packageUnit: 'ml' },
  { productName: 'Pois chiches en conserve',   chain: 'Maxi', priceCents: 129,  packageSize: 540,  packageUnit: 'ml' },
  { productName: 'Levure chimique',            chain: 'Maxi', priceCents: 349,  packageSize: 450,  packageUnit: 'g' },

  // IGA
  { productName: 'Farine tout-usage',          chain: 'IGA',  priceCents: 549,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Sucre blanc',                chain: 'IGA',  priceCents: 449,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Beurre non salé',            chain: 'IGA',  priceCents: 749,  packageSize: 454,  packageUnit: 'g' },
  { productName: 'Lait 3,25%',                 chain: 'IGA',  priceCents: 649,  packageSize: 2000, packageUnit: 'ml' },
  { productName: 'Crème 35%',                  chain: 'IGA',  priceCents: 499,  packageSize: 473,  packageUnit: 'ml' },
  { productName: 'Oeufs gros',                 chain: 'IGA',  priceCents: 549,  packageSize: 12,   packageUnit: 'unit' },
  { productName: 'Huile canola',               chain: 'IGA',  priceCents: 749,  packageSize: 1000, packageUnit: 'ml' },
  { productName: "Huile d'olive extra vierge", chain: 'IGA',  priceCents: 1099, packageSize: 500,  packageUnit: 'ml' },
  { productName: 'Riz blanc long grain',       chain: 'IGA',  priceCents: 649,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Pâtes spaghetti',            chain: 'IGA',  priceCents: 249,  packageSize: 450,  packageUnit: 'g' },
  { productName: 'Poitrine de poulet',         chain: 'IGA',  priceCents: 1399, packageSize: 600,  packageUnit: 'g' },
  { productName: 'Boeuf haché maigre',         chain: 'IGA',  priceCents: 999,  packageSize: 454,  packageUnit: 'g' },
  { productName: 'Tomates en dés',             chain: 'IGA',  priceCents: 169,  packageSize: 796,  packageUnit: 'ml' },
  { productName: 'Pois chiches en conserve',   chain: 'IGA',  priceCents: 149,  packageSize: 540,  packageUnit: 'ml' },
  { productName: 'Levure chimique',            chain: 'IGA',  priceCents: 379,  packageSize: 450,  packageUnit: 'g' },

  // Metro
  { productName: 'Farine tout-usage',          chain: 'Metro', priceCents: 529,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Sucre blanc',                chain: 'Metro', priceCents: 429,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Beurre non salé',            chain: 'Metro', priceCents: 729,  packageSize: 454,  packageUnit: 'g' },
  { productName: 'Lait 3,25%',                 chain: 'Metro', priceCents: 629,  packageSize: 2000, packageUnit: 'ml' },
  { productName: 'Crème 35%',                  chain: 'Metro', priceCents: 479,  packageSize: 473,  packageUnit: 'ml' },
  { productName: 'Oeufs gros',                 chain: 'Metro', priceCents: 529,  packageSize: 12,   packageUnit: 'unit' },
  { productName: 'Huile canola',               chain: 'Metro', priceCents: 729,  packageSize: 1000, packageUnit: 'ml' },
  { productName: "Huile d'olive extra vierge", chain: 'Metro', priceCents: 1049, packageSize: 500,  packageUnit: 'ml' },
  { productName: 'Riz blanc long grain',       chain: 'Metro', priceCents: 629,  packageSize: 2000, packageUnit: 'g' },
  { productName: 'Pâtes spaghetti',            chain: 'Metro', priceCents: 229,  packageSize: 450,  packageUnit: 'g' },
  { productName: 'Poitrine de poulet',         chain: 'Metro', priceCents: 1349, packageSize: 600,  packageUnit: 'g' },
  { productName: 'Boeuf haché maigre',         chain: 'Metro', priceCents: 949,  packageSize: 454,  packageUnit: 'g' },
  { productName: 'Tomates en dés',             chain: 'Metro', priceCents: 159,  packageSize: 796,  packageUnit: 'ml' },
  { productName: 'Pois chiches en conserve',   chain: 'Metro', priceCents: 139,  packageSize: 540,  packageUnit: 'ml' },
  { productName: 'Levure chimique',            chain: 'Metro', priceCents: 359,  packageSize: 450,  packageUnit: 'g' },
];

async function main() {
  for (const entry of MANUAL_PRICES) {
    const product = await prisma.product.findFirst({ where: { name: entry.productName } });
    if (!product) { console.warn(`Product not found: ${entry.productName}`); continue; }

    const store = await prisma.store.findFirst({ where: { chain: entry.chain } });
    if (!store) { console.warn(`Store not found: ${entry.chain}`); continue; }

    const sp = await prisma.storeProduct.upsert({
      where: { productId_storeId_sku: { productId: product.id, storeId: store.id, sku: `manual-${product.id}` } },
      create: { productId: product.id, storeId: store.id, sku: `manual-${product.id}`, packageSize: entry.packageSize, packageUnit: entry.packageUnit },
      update: { packageSize: entry.packageSize, packageUnit: entry.packageUnit, lastSeenAt: new Date() },
    });

    await prisma.price.create({
      data: { storeProductId: sp.id, priceCents: entry.priceCents, source: 'manual' },
    });

    console.log(`✓ ${entry.chain} ${entry.productName}: $${(entry.priceCents / 100).toFixed(2)}`);
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(console.error);
