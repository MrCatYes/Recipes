/**
 * Daily scrape orchestrator (host-run — needs Chromium for the catalog crawl).
 *   1. Flipp API        → weekly promo prices, all stores (browser-free)
 *   2. Full catalog crawl → Maxi (+ Metro/IGA when available) regular catalog
 *
 * Run on the host (not the Docker API container) via host-cron.ts.
 */

import { PrismaClient } from '@prisma/client';
import { scrapeAllPrices } from './price-scraper.service';
import { crawlMaxi } from './crawl/maxi-catalog.crawler';
import { crawlMetro } from './crawl/metro-catalog.crawler';

const prisma = new PrismaClient();

export async function runDailyScrape(opts: { catalog?: boolean } = {}): Promise<void> {
  const start = Date.now();
  console.log(`\n🛒 Daily scrape started ${new Date().toISOString()}`);

  // 1. Flipp — all-store weekly promo prices. Browser-free.
  try {
    const flipp = await scrapeAllPrices();
    console.log(`Flipp: ${flipp.matched} prices saved (${flipp.total} candidates).`);
  } catch (e) {
    console.error('Flipp failed:', e instanceof Error ? e.message : e);
  }

  // 2. Full catalog crawls (Chromium). Opt-in — heavy (~20-40 min each).
  if (opts.catalog !== false) {
    try { await crawlMaxi(); }
    catch (e) { console.error('Maxi catalog crawl failed:', e instanceof Error ? e.message : e); }
    try { await crawlMetro(); }
    catch (e) { console.error('Metro catalog crawl failed:', e instanceof Error ? e.message : e); }
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
