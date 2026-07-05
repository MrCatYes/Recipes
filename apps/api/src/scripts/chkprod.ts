import { prisma } from "../db";
async function main() {
  const names = ["Roquette", "Glaçons", "Harissa", "Canneberges fraîches", "Pâte à pizza", "Tortellinis"];
  for (const n of names) {
    const p = await prisma.product.findFirst({ where: { name: n } });
    console.log(p ? "EXISTS" : "MISS", n);
  }
  await prisma.();
}
main().catch(e => { console.error(e); process.exit(1); });
