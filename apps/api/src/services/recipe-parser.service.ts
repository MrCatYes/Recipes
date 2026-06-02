import { load } from 'cheerio';
import Groq from 'groq-sdk';

export interface ParsedRecipe {
  title: string;
  servings: number;
  ingredients: string[];
  instructions: string[];
  imageUrl: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function parseDuration(raw: unknown): number | null {
  if (!raw || typeof raw !== 'string') return null;
  // Match time portion: PT... or P<date>T<time>
  const m = raw.match(/T(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m || (!m[1] && !m[2])) return null;
  return (parseInt(m[1] ?? '0', 10) * 60) + parseInt(m[2] ?? '0', 10);
}

export function parseServings(raw: unknown): number {
  if (raw == null) return 4;
  if (typeof raw === 'number') return Math.max(1, Math.round(raw));
  const m = String(raw).match(/\d+/);
  return m ? Math.max(1, parseInt(m[0], 10)) : 4;
}

export function parseImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw || null;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    return typeof first === 'string' ? first : String((first as Record<string, unknown>).url ?? '') || null;
  }
  if (typeof raw === 'object') {
    return String((raw as Record<string, unknown>).url ?? '') || null;
  }
  return null;
}

export function parseInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((step) => {
    if (typeof step === 'string') return step.trim();
    const s = step as Record<string, unknown>;
    return String(s.text ?? s.name ?? '').trim();
  }).filter(Boolean);
}

function findRecipeNode(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null;
  if (Array.isArray(json)) {
    for (const item of json) {
      const r = findRecipeNode(item);
      if (r) return r;
    }
    return null;
  }
  const obj = json as Record<string, unknown>;
  const type = obj['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && (type as string[]).includes('Recipe'))) {
    return obj;
  }
  // Check nested structures
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'about']) {
    if (obj[key]) {
      const r = findRecipeNode(Array.isArray(obj[key]) ? obj[key] : [obj[key]]);
      if (r) return r;
    }
  }
  return null;
}

export function extractJsonLd(html: string): ParsedRecipe | null {
  const $ = load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data: unknown = JSON.parse($(el).html() ?? '');
      const recipe = findRecipeNode(data);
      if (!recipe) continue;

      const ingredients = Array.isArray(recipe.recipeIngredient)
        ? (recipe.recipeIngredient as unknown[]).map(String).filter(Boolean)
        : [];

      if (!recipe.name || ingredients.length === 0) continue;

      return {
        title: String(recipe.name),
        servings: parseServings(recipe.recipeYield ?? recipe['yield']),
        ingredients,
        instructions: parseInstructions(recipe.recipeInstructions),
        imageUrl: parseImageUrl(recipe.image),
        prepTimeMinutes: parseDuration(recipe.prepTime),
        cookTimeMinutes: parseDuration(recipe.cookTime),
      };
    } catch {
      // malformed JSON-LD, try next script tag
    }
  }
  return null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CLAUDE_SYSTEM = `Extract recipe data from a web page. Return a single JSON object, no markdown, no explanation.

Schema:
{
  "title": string,
  "servings": number,
  "ingredients": string[],
  "instructions": string[],
  "imageUrl": string | null,
  "prepTimeMinutes": number | null,
  "cookTimeMinutes": number | null
}

Rules:
- ingredients: preserve exact raw text (quantity + unit + name, e.g. "250 ml de lait")
- instructions: one step per element, plain text, no numbering
- servings: integer >= 1, default 4 if not found
- Return ONLY the JSON object`;

export class RecipeParserService {
  private groq: Groq;

  constructor(groq?: Groq) {
    this.groq = groq ?? new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async parseUrl(url: string): Promise<ParsedRecipe> {
    const html = await this.fetchHtml(url);

    const fromJsonLd = extractJsonLd(html);
    if (fromJsonLd && fromJsonLd.ingredients.length > 0) return fromJsonLd;

    // Groq fallback only if API key available
    if (!process.env.GROQ_API_KEY) {
      if (fromJsonLd) return fromJsonLd; // partial result
      throw new Error('Recette introuvable (JSON-LD absent). Essaie Ricardo, SOS Cuisine ou AllRecipes.');
    }

    return this.extractWithGroq(html, url, fromJsonLd);
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EpicerieBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  }

  private async extractWithGroq(
    html: string,
    url: string,
    partial: ParsedRecipe | null
  ): Promise<ParsedRecipe> {
    const $ = load(html);
    $('script, style, nav, footer, header, aside, [role="navigation"]').remove();
    const text = $('body').text().replace(/\s{3,}/g, '\n\n').slice(0, 20_000);

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: CLAUDE_SYSTEM },
        { role: 'user', content: `URL: ${url}\n\nPage content:\n${text}` },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? '';
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as ParsedRecipe;
    } catch {
      // fall through
    }

    if (partial) return partial;
    throw new Error(`Could not extract recipe from ${url}`);
  }
}
