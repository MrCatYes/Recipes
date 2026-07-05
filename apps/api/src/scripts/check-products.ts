import { prisma } from "../db";
const names = ["Roquette", "Glaçons", "Harissa", "Pâte miso", "Graines de tournesol", "Canneberges fraîches", "Pamplemousse", "Pâte à pizza", "Pain à hamburger", "Tortellinis", "Filets de sole", "Wasabi", "Grand Marnier"];
for (const n of names) {
  const p = await prisma.product.findFirst({ where: { name: n } });
  console.log(p ? "EXISTS" : "MISSING", n);
}
await prisma.();
