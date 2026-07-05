import { prisma } from "../db";
const rows = await prisma.ingredient.groupBy({
  by: ["rawText"],
  where: { productId: null },
  _count: { rawText: true },
  orderBy: { _count: { rawText: "desc" } },
  take: 80,
  skip: 60
});
rows.forEach(r => console.log(r._count.rawText, JSON.stringify(r.rawText)));
await prisma.();
