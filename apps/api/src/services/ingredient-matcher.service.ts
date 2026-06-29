import Fuse from 'fuse.js';
import Groq from 'groq-sdk';
import type { Product } from '@epicerie/shared-types';
import { ruleMatch } from './product-matcher';

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
  tasse: 'tasse',
  cup: 'tasse',
  cups: 'tasse',
  'cuillère à soupe': 'c. à s.',
  'cuillères à soupe': 'c. à s.',
  'c.à.s.': 'c. à s.',
  'c. à s.': 'c. à s.',
  'c à s': 'c. à s.',
  'cuillere a soupe': 'c. à s.',
  tbsp: 'c. à s.',
  tablespoon: 'c. à s.',
  tablespoons: 'c. à s.',
  'cuillère à thé': 'c. à t.',
  'cuillères à thé': 'c. à t.',
  'c.à.t.': 'c. à t.',
  'c. à t.': 'c. à t.',
  'c à t': 'c. à t.',
  'cuillere a the': 'c. à t.',
  tsp: 'c. à t.',
  teaspoon: 'c. à t.',
  teaspoons: 'c. à t.',
  l: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  liters: 'L',
  livre: 'lb',
  livres: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  once: 'oz',
  onces: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  unité: 'unit',
  unités: 'unit',
  gousses: 'gousse',
  tranches: 'tranche',
  branches: 'branche',
  feuilles: 'feuille',
  morceaux: 'morceau',
  pincées: 'pincée',
  pincée: 'pincée',
  pinch: 'pincée',
  sachets: 'sachet',
  boîtes: 'boîte',
  boite: 'boîte',
  can: 'boîte',
  cans: 'boîte',
  filets: 'filet',
  portions: 'portion',
  gros: 'unit',
  grosse: 'unit',
  grosses: 'unit',
  petit: 'unit',
  petite: 'unit',
  petites: 'unit',
  moyen: 'unit',
  moyenne: 'unit',
  moyens: 'unit',
  // More QC French variants
  'c. soupe': 'c. à s.',
  'cs': 'c. à s.',
  'c.s.': 'c. à s.',
  'c. thé': 'c. à t.',
  'ct': 'c. à t.',
  'c.t.': 'c. à t.',
  'cuill. à soupe': 'c. à s.',
  'cuill. à thé': 'c. à t.',
  'cuil. à soupe': 'c. à s.',
  'cuil. à thé': 'c. à t.',
  't.': 'tasse',
  'demi': 'unit',
  'demi-tasse': 'tasse',
  'conserve': 'boîte',
  'paquet': 'unit',
  'paquets': 'unit',
  'sachet': 'sachet',
  'enveloppe': 'sachet',
  'enveloppes': 'sachet',
  'pot': 'unit',
  'pots': 'unit',
  'barquette': 'unit',
  'barquettes': 'unit',
  'bouquet': 'unit',
  'bouquets': 'unit',
  'botte': 'unit',
  'bottes': 'unit',
  'douzaine': 'unit',
  'douzaines': 'unit',
  // Less common English
  'bunch': 'unit',
  'bunches': 'unit',
  'clove': 'gousse',
  'cloves': 'gousse',
  'slice': 'tranche',
  'slices': 'tranche',
  'stalk': 'branche',
  'stalks': 'branche',
  'sprig': 'branche',
  'sprigs': 'branche',
  'leaf': 'feuille',
  'leaves': 'feuille',
  'piece': 'morceau',
  'pieces': 'morceau',
  'pkg': 'unit',
  'package': 'unit',
  'packages': 'unit',
  'dash': 'pincée',
};

export function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return UNIT_NORMALIZE[lower] ?? raw.trim();
}

// ─── Regex ingredient parser ──────────────────────────────────────────────────

// Order matters: longer patterns first to avoid partial matches
const UNIT_ALTERNATIVES = [
  'c\\.\\s*à\\s*s\\.', 'c\\.\\s*à\\s*t\\.',
  'cuill?\\.?\\s*à\\s+soupe', 'cuill?\\.?\\s*à\\s+thé',
  'c\\.\\s*soupe', 'c\\.\\s*thé',
  'c\\.s\\.', 'c\\.t\\.',
  'tablespoons?', 'teaspoons?', 'tbsp', 'tsp',
  'oz\\s+fl', 'oz',
  'tasses?', 'cups?', 'pintes?',
  'gousses?', 'tranches?', 'branches?', 'feuilles?',
  'morceaux?', 'pincées?', 'sachets?', 'enveloppes?',
  'boîtes?', 'boites?', 'conserves?', 'cans?',
  'filets?', 'portions?',
  'paquets?', 'pots?', 'barquettes?', 'bottes?', 'bouquets?', 'douzaines?',
  'grosses?', 'gros', 'petites?', 'petit', 'moyenn?e?s?', 'moyen',
  'pounds?', 'ounces?', 'lbs',
  'kg', 'ml', 'lb', 'g',
  'livres?',
  'L(?!\\w)', 'litres?', 'liters?',
  'unités?', 'unit',
  'bunch(?:es)?', 'cloves?', 'slices?', 'stalks?', 'sprigs?',
  'leaves?', 'pieces?', 'pkg', 'packages?', 'dash',
];

const UNIT_RX = UNIT_ALTERNATIVES.join('|');

// Matches: [qty] [unit] [de/d'/of] [name] [, notes]
// Supports: "1½ tasse", "2 1/4 tasses", "½", "250 ml", etc.
const INGREDIENT_RX = new RegExp(
  `^(\\d+[½¼¾⅓⅔⅛]|[½¼¾⅓⅔⅛]|\\d+(?:[,.]\\d+)?(?:\\s*/\\s*\\d+(?:[,.]\\d+)?)?)?` +
  `(?:\\s+(${UNIT_RX}))?` +
  `(?:\\s+(?:d[''']|de\\s|d\\s|of\\s))?` +
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
  const trimmed = raw.trim();
  const uf = UNICODE_FRACTIONS[trimmed];
  if (uf !== undefined) return uf;
  // Handle "1½", "2¼" — integer + unicode fraction
  const combined = trimmed.match(/^(\d+)([½¼¾⅓⅔⅛])$/);
  if (combined) return parseInt(combined[1], 10) + (UNICODE_FRACTIONS[combined[2]] ?? 0);
  const s = trimmed.replace(',', '.').replace(/\s/g, '');
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
  private groq: Groq;
  private products: Product[];

  constructor(products: Product[], groq?: Groq) {
    this.products = products;
    this.fuse = new Fuse(products, {
      keys: ['name', 'brand'],
      threshold: 0.45,
      includeScore: true,
    });
    this.groq = groq ?? new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async matchAll(rawIngredients: string[]): Promise<ParsedIngredient[]> {
    const results: Array<ParsedIngredient & { needsClaude: boolean }> = [];

    for (const raw of rawIngredients) {
      const parsed = parseIngredientRegex(raw);
      let productId: string | null = null;
      let confidence = 0;

      // 1. Catalog keyword aliases (e.g. "poudre à pâte" → "Levure chimique").
      const kw = ruleMatch(raw, this.products);
      if (kw) {
        productId = kw.id;
        confidence = 0.95;
      }

      // 2. Fuzzy fallback on the parsed product name.
      if (!productId && parsed.productName) {
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

    // Batch unmatched through Groq (only if API key available)
    const unmatched = process.env.GROQ_API_KEY
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
    if (hits.length && (hits[0].score ?? 1) < 0.45) {
      return { product: hits[0].item, confidence: 1 - (hits[0].score ?? 1) };
    }
    // Try simplified: strip articles, prepositions, adjectives
    const simplified = name
      .replace(/\b(du|de la|de l'|des|d'|le|la|les|un|une|au|aux|en|avec|pour|frais|fraîche|frais|fraîches)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (simplified !== name && simplified.length > 2) {
      const retry = this.fuse.search(simplified, { limit: 1 });
      if (retry.length && (retry[0].score ?? 1) < 0.45) {
        return { product: retry[0].item, confidence: (1 - (retry[0].score ?? 1)) * 0.9 };
      }
    }
    return hits.length ? { product: hits[0].item, confidence: 1 - (hits[0].score ?? 1) } : null;
  }

  private async matchWithClaude(
    ingredients: string[]
  ): Promise<Array<RegexParseResult>> {
    const productList = this.products.map(p => p.name).join(', ');

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: `Parse Quebec French recipe ingredient lines. Match each to the closest product name.

Available products: ${productList}

Return a JSON array, one object per ingredient line:
[{"quantity": number|null, "unit": string|null, "productName": string|null, "notes": string|null}]

Rules:
- quantity: numeric (½→0.5, ¼→0.25, ¾→0.75, 1/3→0.333)
- unit: one of g, kg, ml, L, tasse, "c. à s.", "c. à t.", pinte, lb, oz, unit, or null
- productName: exact product name from the available list, or null if no match
- notes: preparation notes (haché, tranché, etc.), or null
- Return ONLY the JSON array`,
        },
        {
          role: 'user',
          content: ingredients.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? '';
    try {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]) as RegexParseResult[];
    } catch {
      // fall through
    }
    return ingredients.map(() => ({ quantity: null, unit: null, productName: null, notes: null }));
  }
}
