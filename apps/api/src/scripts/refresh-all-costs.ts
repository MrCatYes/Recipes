import { prisma } from '../db';
import { refreshRecipeCostCache } from '../services/recipe-list.service';

async function main() {
  const recipes = await prisma.recipe.findMany({ select: { id: true, title: true } });
  console.log(`Refreshing cost cache for ${recipes.length} recipes...`);
  for (const r of recipes) {
    try {
      await refreshRecipeCostCache(r.id);
      const updated = await prisma.recipe.findUnique({
        where: { id: r.id },
        select: { cachedTotalCents: true, cachedStore: true },
      });
      const cost = updated?.cachedTotalCents
        ? `$${(updated.cachedTotalCents / 100).toFixed(2)} @ ${updated.cachedStore}`
        : 'NO COST';
      console.log(`  ${r.title.padEnd(50)} ${cost}`);
    } catch (e) {
      console.error(`  ERROR ${r.title}:`, e);
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
