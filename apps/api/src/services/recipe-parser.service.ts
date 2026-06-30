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
  category: string | null;
  description: string | null;
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

const CATEGORY_MAP: Record<string, string> = {
  'breakfast': 'Déjeuner', 'brunch': 'Déjeuner', 'déjeuner': 'Déjeuner', 'petit-déjeuner': 'Déjeuner',
  'appetizer': 'Entrée', 'starter': 'Entrée', 'entrée': 'Entrée', 'entree': 'Entrée', 'hors d\'oeuvre': 'Entrée',
  'main course': 'Plat principal', 'main dish': 'Plat principal', 'dinner': 'Plat principal', 'plat principal': 'Plat principal', 'souper': 'Plat principal', 'lunch': 'Plat principal',
  'dessert': 'Dessert', 'desserts': 'Dessert', 'gâteau': 'Pâtisserie', 'cake': 'Pâtisserie', 'baking': 'Pâtisserie', 'pâtisserie': 'Pâtisserie',
  'side dish': 'Accompagnement', 'side': 'Accompagnement', 'accompagnement': 'Accompagnement', 'salade': 'Accompagnement', 'salad': 'Accompagnement',
  'soup': 'Soupe', 'soupe': 'Soupe', 'potage': 'Soupe',
  'snack': 'Collation', 'collation': 'Collation',
  'beverage': 'Boisson', 'drink': 'Boisson', 'boisson': 'Boisson', 'cocktail': 'Boisson', 'smoothie': 'Boisson',
};

function mapCategory(raw: unknown): string | null {
  if (!raw) return null;
  const candidates = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  for (const c of candidates) {
    const lower = c.toLowerCase().trim();
    if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
    for (const [key, val] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(key)) return val;
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

      let prepTime = parseDuration(recipe.prepTime);
      let cookTime = parseDuration(recipe.cookTime);
      if (!prepTime && !cookTime) {
        const totalTime = parseDuration(recipe.totalTime);
        if (totalTime) cookTime = totalTime;
      }

      const category = mapCategory(recipe.recipeCategory)
        ?? mapCategory(recipe.keywords);

      const desc = typeof recipe.description === 'string' ? recipe.description.trim() : null;

      return {
        title: String(recipe.name),
        servings: parseServings(recipe.recipeYield ?? recipe['yield']),
        ingredients,
        instructions: parseInstructions(recipe.recipeInstructions),
        imageUrl: parseImageUrl(recipe.image),
        prepTimeMinutes: prepTime,
        cookTimeMinutes: cookTime,
        category,
        description: desc && desc.length > 10 ? desc : null,
      };
    } catch {
      // malformed JSON-LD, try next script tag
    }
  }
  return null;
}

export function extractMicrodata(html: string): ParsedRecipe | null {
  const $ = load(html);
  const recipeEl = $('[itemtype*="schema.org/Recipe"]').first();
  if (!recipeEl.length) return null;

  const prop = (name: string) => recipeEl.find(`[itemprop="${name}"]`);

  const title = prop('name').first().text().trim();
  if (!title) return null;

  const ingredients = prop('recipeIngredient').toArray()
    .map(el => $(el).text().trim())
    .filter(Boolean);
  if (ingredients.length === 0) {
    prop('ingredients').toArray()
      .map(el => $(el).text().trim())
      .filter(Boolean)
      .forEach(i => ingredients.push(i));
  }
  if (ingredients.length === 0) return null;

  const instructions = prop('recipeInstructions').toArray()
    .map(el => $(el).text().trim())
    .filter(Boolean);

  const imageEl = prop('image').first();
  const imageUrl = imageEl.attr('src') ?? imageEl.attr('content') ?? null;
  const catText = prop('recipeCategory').first().text().trim();
  const descText = prop('description').first().text().trim();

  return {
    title,
    servings: parseServings(prop('recipeYield').first().text() || null),
    ingredients,
    instructions,
    imageUrl,
    prepTimeMinutes: parseDuration(prop('prepTime').first().attr('content') ?? prop('prepTime').first().attr('datetime') ?? null),
    cookTimeMinutes: parseDuration(prop('cookTime').first().attr('content') ?? prop('cookTime').first().attr('datetime') ?? null),
    category: mapCategory(catText) ?? null,
    description: descText.length > 10 ? descText : null,
  };
}

export function extractHeuristicHtml(html: string): ParsedRecipe | null {
  const $ = load(html);

  const title = $('h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.trim()
    || null;
  if (!title) return null;

  const ingredients: string[] = [];
  const ingSelectors = [
    // WordPress recipe plugins
    '.wprm-recipe-ingredient',
    '.tasty-recipe-ingredients li',
    '.mv-create-ingredients li',
    '.easyrecipe .ingredient',
    // Common class patterns
    '.recipe-ingredients li',
    '.ingredients li',
    '.ingredient-list li',
    '[class*="ingredient"] li',
    // Ricardo.com
    '.recipe__ingredients li',
    '.c-ingredients li',
    // SOS Cuisine
    '.recipe-ingredient-list li',
    '.ingredients-group li',
    // Allrecipes
    '.mntl-structured-ingredients__list-item',
    // Marmiton / Cuisinez
    '.recipe-ingredients__list__item',
    '.recipe-ingredient-qty',
    // Trois fois par jour
    '.recipe-detail__ingredients li',
    '.ingredients-section li',
    // Coup de pouce / Châtelaine
    '.field-ingredients li',
    '.recipe-detail-ingredients li',
    // Recettes du Québec
    '.recette-ingredients li',
    '.recipeIngredients li',
    // Cuisinez.com / 5ingredients15minutes
    '.entry-ingredients li',
    '.recipe-card__ingredients li',
    // Mordu (Radio-Canada)
    '.recipe-content__ingredients li',
    '[data-testid="ingredient-list"] li',
    // Bob le Chef
    '.single-recipe-ingredients li',
    // Foodlavie / Zeste / IGA recettes
    '.recipe-detail__ingredient-list li',
    '.recipe-ingredient li',
    '.ingredients-list__item',
    '[data-recipe-ingredients] li',
    // Pratico-pratiques / Les Recettes de Caty
    '.recipe_ingredients li',
    '.recipe-card-ingredients li',
    // Generic fallback
    'ul[class*="recette"] li',
    'ul[class*="recipe"] li',
    'ul[class*="ingredien"] li',
  ];
  for (const sel of ingSelectors) {
    $(sel).each((_, el) => {
      const t = $(el).text().trim().replace(/\s+/g, ' ');
      if (t && t.length > 2 && t.length < 200) ingredients.push(t);
    });
    if (ingredients.length > 0) break;
  }
  if (ingredients.length === 0) return null;

  const instructions: string[] = [];
  const stepSelectors = [
    '.wprm-recipe-instruction',
    '.tasty-recipe-instructions li',
    '.mv-create-instructions li',
    '.recipe-instructions li',
    '.instructions li',
    '.recipe-steps li',
    '[class*="instruction"] li',
    '[class*="preparation"] li',
    '.recipe__steps li',
    '.c-steps li',
    '.mntl-sc-block-group--LI',
    '.recipe-steps__list__item',
    // QC sites
    '.recipe-detail__steps li',
    '.recipe-detail-steps li',
    '.recette-preparation li',
    '.recipe-content__steps li',
    '.single-recipe-preparation li',
    '.entry-instructions li',
    '.recipe-card__directions li',
    '.field-preparation li',
    // Extra QC sites
    '.recipe-detail__step-list li',
    '.recipe_preparation li',
    '.recipe-card-directions li',
    '[data-recipe-instructions] li',
    '.steps-list__item',
    'ol[class*="recette"] li',
    'ol[class*="recipe"] li',
    'ol[class*="instruction"] li',
    'ol[class*="preparation"] li',
  ];
  for (const sel of stepSelectors) {
    $(sel).each((_, el) => {
      const t = $(el).text().trim().replace(/\s+/g, ' ');
      if (t && t.length > 5) instructions.push(t);
    });
    if (instructions.length > 0) break;
  }

  // Try to extract servings from common patterns
  let servings = 4;
  const servingsSelectors = [
    '.wprm-recipe-servings',
    '.tasty-recipe-yield',
    '[class*="serving"]',
    '[class*="portion"]',
    '[class*="yield"]',
  ];
  for (const sel of servingsSelectors) {
    const t = $(sel).first().text();
    if (t) {
      const s = parseServings(t);
      if (s > 0) { servings = s; break; }
    }
  }

  const imageUrl = $('meta[property="og:image"]').attr('content') ?? null;
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim()
    ?? $('meta[name="description"]').attr('content')?.trim()
    ?? null;

  return {
    title,
    servings,
    ingredients,
    instructions,
    imageUrl,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    category: null,
    description: ogDesc && ogDesc.length > 10 ? ogDesc : null,
  };
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
  "cookTimeMinutes": number | null,
  "category": "Déjeuner" | "Entrée" | "Plat principal" | "Dessert" | "Pâtisserie" | "Accompagnement" | "Soupe" | "Collation" | "Boisson" | null,
  "description": string | null
}

Rules:
- ingredients: preserve exact raw text (quantity + unit + name, e.g. "250 ml de lait")
- instructions: one step per element, plain text, no numbering
- servings: integer >= 1, default 4 if not found
- category: pick the best match from the enum, null if unsure
- description: 1-2 sentence summary of the dish, null if not found
- Return ONLY the JSON object`;

export class RecipeParserService {
  private groq: Groq;

  constructor(groq?: Groq) {
    this.groq = groq ?? new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async parseUrl(url: string): Promise<ParsedRecipe> {
    const html = await this.fetchHtml(url);

    // Tier 1: JSON-LD (schema.org/Recipe) — most reliable
    const fromJsonLd = extractJsonLd(html);
    if (fromJsonLd && fromJsonLd.ingredients.length > 0) return fromJsonLd;

    // Tier 2: HTML Microdata (itemtype="schema.org/Recipe")
    const fromMicrodata = extractMicrodata(html);
    if (fromMicrodata && fromMicrodata.ingredients.length > 0) return fromMicrodata;

    // Tier 3: CSS-class heuristics (WordPress recipe plugins, common patterns)
    const fromHeuristic = extractHeuristicHtml(html);
    if (fromHeuristic && fromHeuristic.ingredients.length > 0) return fromHeuristic;

    // Tier 4: Groq LLM fallback
    const partial = fromJsonLd ?? fromMicrodata ?? fromHeuristic;
    if (!process.env.GROQ_API_KEY) {
      if (partial) return partial;
      throw new Error('Recette introuvable. Essaie Ricardo, SOS Cuisine ou AllRecipes.');
    }

    return this.extractWithGroq(html, url, partial);
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
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
    $('script, style, nav, footer, header, aside, iframe, svg, noscript, [role="navigation"], [role="banner"], [role="complementary"], .ad, .ads, .advertisement, .sidebar, .comments, .social-share').remove();
    const text = $('body').text().replace(/\s{3,}/g, '\n\n').slice(0, 25_000);

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
