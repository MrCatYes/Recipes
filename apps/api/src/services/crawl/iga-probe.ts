/**
 * Throwaway IGA structure probe. Detects how iga.net serves product data:
 * captures JSON API calls, checks for __NEXT_DATA__ / JSON-LD / data-* attrs,
 * and dumps candidate category links. Informs the real crawler.
 *
 *   pnpm exec tsx --env-file=.env src/services/crawl/iga-probe.ts
 *   pnpm exec tsx --env-file=.env src/services/crawl/iga-probe.ts "https://www.iga.net/fr/epicerie/..."
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'playwright';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(chromium as any).use(stealth());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(url: string) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'fr-CA', viewport: { width: 1280, height: 900 } });
  const page: Page = await ctx.newPage();

  // Capture exact product-query requests (URL + body + key headers)
  page.on('request', (req) => {
    const u = req.url();
    if (/algolia/i.test(u) && /dxp_product/i.test(u)) {
      console.log('\n>>> PRODUCT REQUEST');
      console.log('URL:', u);
      console.log('METHOD:', req.method());
      const h = req.headers();
      console.log('referer:', h['referer'], '| origin:', h['origin']);
      console.log('x-algolia-api-key:', h['x-algolia-api-key']);
      console.log('x-algolia-application-id:', h['x-algolia-application-id']);
      console.log('POSTDATA:', (req.postData() ?? '').slice(0, 600));
    }
  });

  // Capture JSON API responses
  const apiHits: Array<{ url: string; status: number; sample: string }> = [];
  let fullProductHit: unknown = null;
  page.on('response', async (res) => {
    try {
      const ct = res.headers()['content-type'] ?? '';
      const u = res.url();
      if (!ct.includes('json')) return;
      if (/google|facebook|analytics|gtm|cookie|consent|sentry|datadog/i.test(u)) return;
      const text = await res.text().catch(() => '');
      if (!fullProductHit && /dxp_product/i.test(u)) {
        try { fullProductHit = (JSON.parse(text).hits ?? [])[0] ?? null; } catch { /* */ }
      }
      // Only keep responses that look product-bearing
      if (/product|article|item|price|prix|search|browse|aisle|catalog|sku/i.test(u + text.slice(0, 200))) {
        apiHits.push({ url: u, status: res.status(), sample: text.slice(0, 300).replace(/\s+/g, ' ') });
      }
    } catch { /* ignore */ }
  });

  console.log(`\n→ Loading ${url}`);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { console.log('goto err:', e.message); return null; });
  console.log(`status: ${resp?.status()}`);
  await page.waitForTimeout(6000);
  // gentle scroll to trigger lazy product loads
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(4000);

  const markers = await page.evaluate(() => {
    const out: Record<string, unknown> = {};
    out.title = document.title;
    out.hasNextData = !!document.getElementById('__NEXT_DATA__');
    out.ldJson = document.querySelectorAll('script[type="application/ld+json"]').length;
    out.dataProductCode = document.querySelectorAll('[data-product-code]').length;
    out.dataProductId = document.querySelectorAll('[data-product-id]').length;
    out.dataQa = document.querySelectorAll('[data-qa]').length;
    out.anyDataProduct = document.querySelectorAll('[class*="product"],[data-testid*="product"]').length;
    // global state objects
    out.globals = Object.keys(window).filter(k => /__|state|apollo|store|next/i.test(k)).slice(0, 20);
    // candidate category links
    out.aisleLinks = Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).getAttribute('href') || '')
      .filter(h => /epicerie|rayon|aisle|categor|departement|allee|product/i.test(h))
      .slice(0, 25);
    return out;
  }).catch((e) => ({ evalErr: e.message }));

  console.log('\n=== DOM MARKERS ===');
  console.log(JSON.stringify(markers, null, 2));

  console.log('\n=== FULL PRODUCT HIT ===');
  console.log(JSON.stringify(fullProductHit, null, 2)?.slice(0, 2500) ?? 'none');

  console.log('\n=== JSON API HITS ===');
  for (const h of apiHits.slice(0, 25)) {
    console.log(`[${h.status}] ${h.url}`);
    console.log(`        ${h.sample}`);
  }
  if (!apiHits.length) console.log('(none captured)');

  await browser.close();
}

const target = process.argv[2] ?? 'https://www.iga.net/fr';
probe(target).catch((e) => { console.error(e); process.exit(1); });
