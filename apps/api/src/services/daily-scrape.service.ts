/**
 * Daily scrape orchestrator (host-run — needs Chromium for the catalog crawl).
 *   1. Flipp API        → weekly promo prices, all stores (browser-free)
 *   2. Full catalog crawl → Maxi (+ Metro/IGA when available) regular catalog
 *
 * Run on the host (not the Docker API container) via host-cron.ts.
 */

import { PrismaClient } from '@prisma/client';
import { scrapeAllPrices } from './price-scraper.service';
import { crawlFlippFlyers } from './crawl/flipp-flyers.crawler';
import { crawlMaxi } from './crawl/maxi-catalog.crawler';
import { crawlMetro, crawlSuperC } from './crawl/metro-catalog.crawler';
import { crawlIga } from './crawl/iga-catalog.crawler';

const prisma = new PrismaClient();

export async function runDailyScrape(opts: { catalog?: boolean } = {}): Promise<void> {
  const start = Date.now();
  console.log(`\n🛒 Daily scrape started ${new Date().toISOString()}`);

  // 1. Full Flipp flyers — all items from every chain's circular. Browser-free.
  try {
    const ff = await crawlFlippFlyers();
    console.log(`Flipp flyers: ${ff.totalItems} items from ${ff.flyersProcessed} flyers (${ff.matched} matched).`);
  } catch (e) {
    console.error('Flipp flyers failed:', e instanceof Error ? e.message : e);
  }

  // 1b. Flipp product search — targeted product prices (supplements the full flyers).
  try {
    const flipp = await scrapeAllPrices();
    console.log(`Flipp search: ${flipp.matched} prices saved (${flipp.total} candidates).`);
  } catch (e) {
    console.error('Flipp search failed:', e instanceof Error ? e.message : e);
  }

  // 1c. IGA full catalog — via Algolia JSON API. Browser-free, fast (~1-2 min).
  try { await crawlIga(); }
  catch (e) { console.error('IGA catalog crawl failed:', e instanceof Error ? e.message : e); }

  // 2. Full catalog crawls (Chromium). Opt-in — heavy (~20-40 min each).
  if (opts.catalog !== false) {
    try { await crawlMaxi(); }
    catch (e) { console.error('Maxi catalog crawl failed:', e instanceof Error ? e.message : e); }
    try { await crawlMetro(); }
    catch (e) { console.error('Metro catalog crawl failed:', e instanceof Error ? e.message : e); }
    try { await crawlSuperC(); }
    catch (e) { console.error('Super C catalog crawl failed:', e instanceof Error ? e.message : e); }
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
