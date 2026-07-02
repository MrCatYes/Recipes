import { prisma } from '../db';

async function main() {
  const unmatched = await prisma.ingredient.findMany({
    where: { productId: null },
    select: { rawText: true, parsedUnit: true },
    orderBy: { rawText: 'asc' },
  });
  console.log(`Total unmatched: ${unmatched.length}`);
  for (const i of unmatched) {
    console.log(`${i.rawText} | unit=${i.parsedUnit}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
