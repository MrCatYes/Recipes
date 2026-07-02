import { prisma } from '../db';

async function main() {
  const recipes = await prisma.recipe.findMany({ select: { title: true, sourceUrl: true } });
  for (const r of recipes) {
    const domain = r.sourceUrl ? new URL(r.sourceUrl).hostname : 'no url';
    console.log(`${domain.padEnd(35)} ${r.title}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
