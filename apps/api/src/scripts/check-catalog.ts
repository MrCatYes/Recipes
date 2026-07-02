import { prisma } from '../db';
async function main() {
  const items = await prisma.catalogItem.findMany({
    where: { name: { contains: 'sel', mode: 'insensitive' } },
    select: { name: true, chain: true, priceCents: true, packageUnit: true },
    take: 5,
  });
  console.log('SEL:', JSON.stringify(items));
  const pretzels = await prisma.catalogItem.findMany({
    where: { name: { contains: 'bretzel', mode: 'insensitive' } },
    select: { name: true }, take: 5,
  });
  console.log('PRETZELS:', JSON.stringify(pretzels));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
