import Fuse from 'fuse.js';
import Anthropic from '@anthropic-ai/sdk';
import type { Product } from '@epicerie/shared-types';

export interface RegexParseResult {
  quantity: number | null;
  unit: string | null;
  productName: string | null;
  notes: string | null;
}

export interface ParsedIngredient {
  rawText: string;
  parsedQuantity: number | null;
  parsedUnit: string | null;
  productId: string | null;
  confidence: number;
  notes: string | null;
}

// ─── Unit normalization ───────────────────────────────────────────────────────

const UNIT_NORMALIZE: Record<string, string> = {
  tasses: 'tasse',
  'cuillère à soupe': 'c. à s.',
  'cuillères à soupe': 'c. à s.',
  'c.à.s.': 'c. à s.',
  'cuillere a soupe': 'c. à s.',
  'cuillère à thé': 'c. à t.',
  'cuillères à thé': 'c. à t.',
  'c.à.t.': 'c. à t.',
  'cuillere a the': 'c. à t.',
  l: 'L',
  litre: 'L',
  litres: 'L',
  livre: 'lb',
  livres: 'lb',
  once: 'oz',
  onces: 'oz',
  unité: 'unit',
  unités: 'unit',
  gousses: 'gousse',
  tranches: 'tranche',
  branches: 'branche',
  feuilles: 'feuille',
  morceaux: 'morceau',
  pincées: 'pincée',
  sachets: 'sachet',
  boîtes: 'boîte',
  filets: 'filet',
  portions: 'portion',
};

export function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return UNIT_NORMALIZE[lower] ?? raw.trim();
}

// ─── Regex ingredient parser ──────────────────────────────────────────────────

// Order matters: longer patterns first to avoid partial matches
const UNIT_ALTERNATIVES = [
  'c\\.\\s*à\\s*s\\.', 'c\\.\\s*à\\s*t\\.',
  'cuillères?\\s+à\\s+soupe', 'cuillères?\\s+à\\s+thé',
  'oz\\s+fl', 'oz',
  'tasses?', 'pintes?',
  'gousses?', 'tranches?', 'branches?', 'feuilles?',
  'morceaux?', 'pincées?', 'sachets?', 'boîtes?', 'filets?', 'portions?',
  'kg', 'ml', 'lb', 'g',
  'L(?!\\w)',
  'unités?', 'unit',
];

const UNIT_RX = UNIT_ALTERNATIVES.join('|');

// Matches: [qty] [unit] [de/d'/of] [name] [, notes]
const INGREDIENT_RX = new RegExp(
  `^([½¼¾⅓⅔⅛]|\\d+(?:[,.]\\d+)?(?:\\s*/\\s*\\d+(?:[,.]\\d+)?)?)?` +
  `(?:\\s+(${UNIT_RX}))?` +
  `(?:\\s+(?:d[''’]|de\\s|d\\s|of\\s))?` +
  `(.+?)` +
  `(?:\\s*,\\s*(.+))?$`,
  'i'
);

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125,
};

function parseQuantity(raw: string | undefined): number | null {
  if (!raw) return null;
  const uf = UNICODE_FRACTIONS[raw.trim()];
  if (uf !== undefined) return uf;
  const s = raw.replace(',', '.').replace(/\s/g, '');
  if (s.includes('/')) {
    const [n, d] = s.split('/');
    const val = parseFloat(n) / parseFloat(d);
    return isNaN(val) ? null : val;
  }
  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

export function parseIngredientRegex(raw: string): RegexParseResult {
  const text = raw.trim();
  const m = text.match(INGREDIENT_RX);
  if (!m) return { quantity: null, unit: null, productName: text, notes: null };

  const quantity = parseQuantity(m[1]);
  const unit = m[2] ? normalizeUnit(m[2]) : null;
  const productName = m[3]?.trim() ?? null;
  const notes = m[4]?.trim() ?? null;

  return { quantity, unit, productName: productName || text, notes };
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.55;

export class IngredientMatcherService {
  private fuse: Fuse<Product>;
  private claude: Anthropic;
  private products: Product[];

  constructor(products: Product[], claude?: Anthropic) {
    this.products = products;
    this.fuse = new Fuse(products, {
      keys: ['name', 'brand'],
      threshold: 0.45,
      includeScore: true,
    });
    this.claude = claude ?? new Anthropic();
  }

  async matchAll(rawIngredients: string[]): Promise<ParsedIngredient[]> {
    const results: Array<ParsedIngredient & { needsClaude: boolean }> = [];

    for (const raw of rawIngredients) {
      const parsed = parseIngredientRegex(raw);
      let productId: string | null = null;
      let confidence = 0;

      if (parsed.productName) {
        const match = this.fuzzyMatch(parsed.productName);
        if (match && match.confidence >= CONFIDENCE_THRESHOLD) {
          productId = match.product.id;
          confidence = match.confidence;
        }
      }

      results.push({
        rawText: raw,
        parsedQuantity: parsed.quantity,
        parsedUnit: parsed.unit,
        productId,
        confidence,
        notes: parsed.notes,
        needsClaude: productId === null && parsed.productName !== null,
      });
    }

    // Batch unmatched through Claude (only if API key available)
    const unmatched = process.env.ANTHROPIC_API_KEY
      ? results.map((r, i) => ({ i, raw: r.rawText, needsClaude: r.needsClaude })).filter(x => x.needsClaude)
      : [];

    if (unmatched.length > 0) {
      const claudeResults = await this.matchWithClaude(unmatched.map(x => x.raw));
      for (let j = 0; j < unmatched.length; j++) {
        const { i } = unmatched[j];
        const cr = claudeResults[j];
        if (!cr?.productName) continue;

        const match = this.fuzzyMatch(cr.productName);
        if (match) {
          results[i].parsedQuantity ??= cr.quantity ?? null;
          results[i].parsedUnit ??= cr.unit ?? null;
          results[i].productId = match.product.id;
          results[i].confidence = match.confidence * 0.85; // discount for AI path
          results[i].notes ??= cr.notes ?? null;
        }
      }
    }

    return results.map(({ needsClaude: _, ...r }) => r);
  }

  private fuzzyMatch(name: string): { product: Product; confidence: number } | null {
    const hits = this.fuse.search(name, { limit: 1 });
    if (!hits.length) return null;
    const score = hits[0].score ?? 1; // Fuse: lower = better
    return { product: hits[0].item, confidence: 1 - score };
  }

  private async matchWithClaude(
    ingredients: string[]
  ): Promise<Array<RegexParseResult>> {
    const productList = this.products.map(p => p.name).join(', ');

    const stream = this.claude.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: [{
        type: 'text',
        text: `Parse Quebec French recipe ingredient lines. Match each to the closest product name.

Available products: ${productList}

Return a JSON array, one object per ingredient line:
[{"quantity": number|null, "unit": string|null, "productName": string|null, "notes": string|null}]

Rules:
- quantity: numeric (½→0.5, ¼→0.25, ¾→0.75, 1/3→0.333)
- unit: one of g, kg, ml, L, tasse, "c. à s.", "c. à t.", pinte, lb, oz, unit, or null
- productName: exact product name from the available list, or null if no match
- notes: preparation notes (haché, tranché, etc.), or null
- Return ONLY the JSON array`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: ingredients.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      }],
    });
    const message = await stream.finalMessage();

    for (const block of message.content) {
      if (block.type === 'text' && block.text.trim()) {
        try {
          const match = block.text.match(/\[[\s\S]*\]/);
          if (match) return JSON.parse(match[0]) as RegexParseResult[];
        } catch {
          // keep trying
        }
      }
    }
    return ingredients.map(() => ({ quantity: null, unit: null, productName: null, notes: null }));
  }
}
