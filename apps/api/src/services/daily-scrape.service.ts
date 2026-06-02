/**
 * Daily scrape orchestrator (hybrid strategy)
 *   1. Flipp API     → weekly promo prices, all stores (Maxi/IGA/Metro/Super C/Walmart)
 *   2. Metro Playwright → regular catalog prices
 *   3. Manual baseline  → seeded once if a product has no price anywhere
 *
 * Runs daily via cron (see index.ts).
 */

import { PrismaClient } from '@prisma/client';
import { scrapeAllPrices } from './price-scraper.service';

const prisma = new PrismaClient();

export async function runDailyScrape(): Promise<void> {
  const start = Date.now();
  console.log(`\n🛒 Daily scrape started ${new Date().toISOString()}`);

  // Flipp — all-store prices (Maxi, IGA, Metro, Super C, Walmart). Browser-free.
  try {
    const flipp = await scrapeAllPrices();
    console.log(`Flipp: ${flipp.matched} prices saved (${flipp.total} candidates).`);
  } catch (e) {
    console.error('Flipp failed:', e instanceof Error ? e.message : e);
  }

  const secs = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`✅ Daily scrape complete in ${secs}s`);
}

// Direct execution
if (process.argv[1]?.includes('daily-scrape')) {
  runDailyScrape()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect(); });
}
