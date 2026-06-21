/**
 * Probe IGA's Algolia product index directly (no browser).
 * Dumps one full product hit so we can map price/package fields,
 * and fetches the category tree. Informs the real crawler.
 *
 *   pnpm exec tsx src/services/crawl/iga-algolia-probe.ts
 */

const APP_ID = 'L0APUSIH50';
const API_KEY = '022f6cbb0292d0e78f65897fd6dabad9';
const PRODUCT_INDEX = 'dxp_product_fr';
const STORE = '8253'; // IGA Atwater (Montréal)

async function algoliaQuery(index: string, params: string) {
  const res = await fetch(`https://${APP_ID}-dsn.algolia.net/1/indexes/${index}/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-API-Key': API_KEY,
      'X-Algolia-Application-Id': APP_ID,
      'Content-Type': 'application/json',
      'Referer': 'https://www.iga.ca/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    },
    body: JSON.stringify({ params }),
  });
  if (!res.ok) throw new Error(`Algolia ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ hits: Record<string, unknown>[]; nbHits: number; nbPages: number }>;
}

async function algoliaQueryBody(index: string, body: Record<string, unknown>) {
  const res = await fetch(`https://${APP_ID}-dsn.algolia.net/1/indexes/${index}/query?x-algolia-agent=Algolia%20for%20JavaScript%20(5.46.0)%3B%20Search%20(5.46.0)%3B%20Browser&x-algolia-api-key=${API_KEY}&x-algolia-application-id=${APP_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.iga.ca/', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Algolia ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{ hits: Record<string, unknown>[]; nbHits: number; nbPages: number }>;
}

async function main() {
  // Browse catalog for the store — see full normal product hit shape
  console.log(`=== BROWSE storeId:${STORE}, hitsPerPage=2 ===`);
  const r1 = await algoliaQueryBody(PRODUCT_INDEX, {
    filters: `storeId:${STORE} AND isVisible:true`,
    hitsPerPage: 2,
    query: '',
  });
  console.log(`nbHits=${r1.nbHits} nbPages=${r1.nbPages}`);
  console.log('FULL HIT[0]:');
  console.log(JSON.stringify(r1.hits[0], null, 2));

  // 3. Facet slicing validation (mirrors crawler strategy)
  console.log('\n=== FACET hierarchicalCategories.lvl2 ===');
  const fr = await algoliaQueryBody(PRODUCT_INDEX, {
    query: '', filters: `storeId:${STORE} AND isVisible:true`,
    facets: ['hierarchicalCategories.lvl2'], maxValuesPerFacet: 1000, hitsPerPage: 0,
  }) as unknown as { facets?: Record<string, Record<string, number>> };
  const facet = fr.facets?.['hierarchicalCategories.lvl2'] ?? {};
  const entries = Object.entries(facet).sort((a, b) => b[1] - a[1]);
  console.log(`${entries.length} lvl2 slices. Largest 5:`);
  for (const [v, c] of entries.slice(0, 5)) console.log(`  ${c}\t${v}`);
  console.log(`slices over 1000 (overflow lost): ${entries.filter(([, c]) => c > 1000).length}`);
  if (entries.length) {
    const [v] = entries[Math.floor(entries.length / 2)];
    const s = await algoliaQueryBody(PRODUCT_INDEX, {
      query: '', filters: `storeId:${STORE} AND isVisible:true AND hierarchicalCategories.lvl2:"${v.replace(/"/g, '\\"')}"`,
      hitsPerPage: 2,
    });
    console.log(`\nsample slice "${v}" → ${s.nbHits} hits`);
    for (const h of s.hits as Array<Record<string, unknown>>) {
      console.log(`  ${h.articleNumber} | ${h.name} | ${h.price}$ | ${h.itemAmountValue} ${h.itemAmountUnit} | ${(h.categories as string[])?.[0]}`);
    }
  }

  // 4. Category tree
  console.log('\n=== CATEGORY TREE (store ' + STORE + ') ===');
  try {
    const res = await fetch(`https://www.iga.ca/api/algolia/fetchProductCategories/${STORE}?locale=fr`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });
    console.log(`status ${res.status}`);
    if (res.ok) {
      const data = await res.json() as { response?: Record<string, string[]> };
      const cats = data.response ?? {};
      const top = Object.keys(cats);
      console.log(`${top.length} top categories:`);
      console.log(top.join(' | '));
      console.log('\nexample subcategories of first:', JSON.stringify(cats[top[0]]?.slice(0, 8)));
    }
  } catch (e) {
    console.log('cat fetch err:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
