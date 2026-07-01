/**
 * Probe Ricardo recipe IDs to discover valid recipe URLs.
 * Tests a range of IDs and writes valid ones to /tmp/ricardo-urls.txt
 *
 *   npx tsx src/scripts/probe-ricardo-ids.ts [start] [end] [step]
 *   Default: probes IDs 1-300 (step 1) + 300-9000 (step 30) = ~570 probes
 */

import { writeFileSync } from 'fs';

const START = parseInt(process.argv[2] ?? '1', 10);
const END = parseInt(process.argv[3] ?? '9000', 10);
const STEP = parseInt(process.argv[4] ?? '15', 10);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'fr-CA,fr;q=0.9',
};

async function checkId(id: number): Promise<string | null> {
  try {
    // Use HEAD first to check if the URL is valid without downloading the whole page
    const url = `https://www.ricardocuisine.com/recettes/${id}-x`;
    const res = await fetch(url, {
      method: 'HEAD',
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (res.status === 200) {
      // Get the final URL after redirect to get the real slug
      return res.url;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const validUrls: string[] = [];
  const ids = [];

  // Dense probe of low IDs (classic recipes)
  for (let i = START; i <= Math.min(END, 500); i += 1) ids.push(i);
  // Sparse probe of higher IDs (newer recipes)
  for (let i = 501; i <= END; i += STEP) ids.push(i);

  process.stderr.write(`Probing ${ids.length} IDs from ${ids[0]} to ${ids[ids.length-1]}...\n`);

  // Probe in batches of 5 concurrent
  const BATCH = 5;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(id => checkId(id)));
    for (const url of results) {
      if (url) {
        validUrls.push(url);
        process.stderr.write(`  ✓ ${url}\n`);
      }
    }
    if (i % 50 === 0) process.stderr.write(`[${i}/${ids.length}] ${validUrls.length} valid so far\n`);
    await new Promise(r => setTimeout(r, 200)); // ~25 req/s max
  }

  process.stderr.write(`\nFound ${validUrls.length} valid recipe URLs\n`);
  writeFileSync('/tmp/ricardo-urls.txt', validUrls.join('\n'));
  process.stderr.write(`Written to /tmp/ricardo-urls.txt\n`);
}
main().catch(e => { process.stderr.write(String(e)); process.exit(1); });
