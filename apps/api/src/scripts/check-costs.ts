import { prisma } from '../db';

async function main() {
  const recipes = await prisma.recipe.findMany({
    select: { title: true, cachedTotalCents: true, cachedStore: true },
    orderBy: { cachedTotalCents: 'asc' },
  });
  for (const r of recipes) {
    const cost = r.cachedTotalCents ? `$${(r.cachedTotalCents/100).toFixed(2)} @ ${r.cachedStore}` : 'NO COST';
    console.log(`${r.title.padEnd(50)} ${cost}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
