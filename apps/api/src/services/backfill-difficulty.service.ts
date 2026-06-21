/**
 * One-shot backfill: compute difficulty for every existing recipe from its
 * stored ingredients count, instructions and prep+cook time.
 *
 *   pnpm exec tsx --env-file=.env src/services/backfill-difficulty.service.ts
 */

import { PrismaClient } from '@prisma/client';
import { classifyDifficulty } from './recipe-classifier';

const prisma = new PrismaClient();

export async function backfillDifficulty(): Promise<void> {
  const recipes = await prisma.recipe.findMany({
    include: { _count: { select: { ingredients: true } } },
  });
  console.log(`Backfilling difficulty for ${recipes.length} recipes...`);

  let updated = 0;
  for (const r of recipes) {
    const totalMinutes = (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0) || null;
    const difficulty = classifyDifficulty(
      r._count.ingredients,
      r.instructions as string[],
      totalMinutes,
    );
    await prisma.recipe.update({ where: { id: r.id }, data: { difficulty } });
    updated++;
  }
  console.log(`✅ ${updated} recipes updated.`);
}

if (process.argv[1]?.includes('backfill-difficulty')) {
  backfillDifficulty()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect(); });
}
