/**
 * Host-side cron runner — runs the full daily scrape (Flipp promos + catalog
 * crawl) on a schedule. Must run on the HOST (not the Docker API container)
 * because the catalog crawl needs Chromium/Playwright.
 *
 *   pnpm exec tsx --env-file=.env src/host-cron.ts         (waits for schedule)
 *   pnpm exec tsx --env-file=.env src/host-cron.ts --now   (also runs immediately)
 *
 * Keep this process running (e.g. a terminal, pm2, or Windows Task Scheduler
 * launching it at login). Schedule: every day at 04:00.
 */

import { schedule } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runDailyScrape } from './services/daily-scrape.service';

const prisma = new PrismaClient();
const CRON = process.env.SCRAPE_CRON ?? '0 4 * * *'; // 4 AM daily

async function runOnce(reason: string) {
  console.log(`\n[host-cron] run (${reason}) @ ${new Date().toISOString()}`);
  try {
    await runDailyScrape({ catalog: true });
  } catch (e) {
    console.error('[host-cron] run failed:', e);
  }
}

console.log(`[host-cron] started. Schedule: "${CRON}". Waiting…`);
schedule(CRON, () => void runOnce('cron'));

// Optional immediate run when launched with --now
if (process.argv.includes('--now')) {
  void runOnce('startup --now').then(() => prisma.$disconnect());
}
