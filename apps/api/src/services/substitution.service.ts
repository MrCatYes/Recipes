import { prisma } from '../db';

interface Substitution {
  originalProductId: string;
  originalName: string;
  substituteProductId: string;
  substituteName: string;
  reason: string;
  savingsCents: number;
}

const SUBSTITUTION_GROUPS: string[][] = [
  ['Beurre non salé', 'Huile canola'],
  ['Crème 35%', 'Crème sure', 'Yogourt grec nature'],
  ['Fromage cheddar', 'Fromage mozzarella râpé'],
  ['Riz blanc long grain', 'Riz basmati'],
  ['Pâtes spaghetti', 'Pâtes penne', 'Pâtes macaroni'],
  ['Boeuf haché maigre', 'Porc haché', 'Dinde hachée'],
  ['Poitrine de poulet', 'Cuisses de poulet'],
  ['Saumon filet', 'Tilapia filet'],
  ['Lait 3,25%', 'Lait 2%'],
  ['Vinaigre blanc', 'Vinaigre de cidre', 'Vinaigre balsamique'],
  ['Bouillon de poulet', 'Bouillon de boeuf'],
  ['Haricots noirs en conserve', 'Haricots rouges en conserve', 'Pois chiches en conserve', 'Lentilles sèches'],
  ['Paprika', 'Paprika fumé', 'Poudre de chili'],
];

export async function findSubstitutions(
  productId: string,
  chains: string[]
): Promise<Substitution[]> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return [];

  const group = SUBSTITUTION_GROUPS.find(g => g.includes(product.name));
  if (!group) return [];

  const alternatives = group.filter(name => name !== product.name);
  const altProducts = await prisma.product.findMany({
    where: { name: { in: alternatives } },
  });

  const results: Substitution[] = [];

  for (const alt of altProducts) {
    const [origPrices, altPrices] = await Promise.all([
      getCheapestPrice(productId, chains),
      getCheapestPrice(alt.id, chains),
    ]);

    if (origPrices == null || altPrices == null) continue;

    const savings = origPrices - altPrices;
    if (savings <= 0) continue;

    const reason = getSubstitutionReason(product.name, alt.name);

    results.push({
      originalProductId: productId,
      originalName: product.name,
      substituteProductId: alt.id,
      substituteName: alt.name,
      reason,
      savingsCents: savings,
    });
  }

  return results.sort((a, b) => b.savingsCents - a.savingsCents);
}

async function getCheapestPrice(productId: string, chains: string[]): Promise<number | null> {
  const storeChains = chains as import('@prisma/client').StoreChain[];
  const sp = await prisma.storeProduct.findMany({
    where: {
      productId,
      store: { chain: { in: storeChains } },
    },
    include: {
      prices: { orderBy: { capturedAt: 'desc' }, take: 1 },
    },
  });

  const prices = sp
    .flatMap(s => s.prices)
    .map(p => p.priceCents)
    .filter((p): p is number => p != null);

  // Also check flyer items
  const flyerItems = await prisma.flyerItem.findMany({
    where: {
      productId,
      store: { chain: { in: storeChains } },
      weekOf: { gte: new Date(Date.now() - 14 * 86400_000) },
    },
    select: { promoPriceCents: true },
  });

  for (const fi of flyerItems) {
    prices.push(fi.promoPriceCents);
  }

  return prices.length > 0 ? Math.min(...prices) : null;
}

function getSubstitutionReason(original: string, substitute: string): string {
  if (original.includes('Boeuf') && substitute.includes('Porc')) return 'Le porc haché est généralement moins cher';
  if (original.includes('Boeuf') && substitute.includes('Dinde')) return 'La dinde hachée est plus maigre et moins chère';
  if (original.includes('Poitrine') && substitute.includes('Cuisses')) return 'Les cuisses sont plus savoureuses et moins chères';
  if (original.includes('Saumon') && substitute.includes('Tilapia')) return 'Poisson blanc plus abordable';
  if (original.includes('Crème 35') && substitute.includes('Yogourt')) return 'Plus léger et plus économique';
  if (original.includes('Beurre') && substitute.includes('Huile')) return 'Substitut végétal plus abordable';
  if (original.includes('3,25') && substitute.includes('2%')) return 'Même usage, légèrement moins cher';
  return 'Alternative comparable à meilleur prix';
}
