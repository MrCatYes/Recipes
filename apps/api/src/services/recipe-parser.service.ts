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
  dietaryTags: string[];
}

const SCHEMA_DIET_MAP: Record<string, string> = {
  'vegetariandiet':  'vegetarien',
  'vegandiet':       'vegetalien',
  'halaldiet':       'halal',
  'kosherdiet':      'casher',
  'glutenfreediet':  'sans-gluten',
  'lowlactosediet':  'sans-lactose',
  'lowcaloriediet':  'low-calories',
};

export function parseDietaryTags(raw: unknown, ingredients: string[]): string[] {
  const tags = new Set<string>();

  // From JSON-LD suitableForDiet
  const rawArr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const d of rawArr) {
    const key = String(d).toLowerCase().replace(/.*\//g, '').replace(/[-_\s]/g, '');
    if (SCHEMA_DIET_MAP[key]) tags.add(SCHEMA_DIET_MAP[key]);
  }

  // Auto-detect from ingredient list
  const text = ingredients.join(' ').toLowerCase();
  const MEAT = /\b(poulet|chicken|boeuf|beef|porc|pork|bacon|lard|agneau|lamb|dinde|turkey|veau|veal|canard|duck|lapin|rabbit|chevreau|bison|saumon|salmon|thon|tuna|crevette|shrimp|anchois|anchovies|fruits de mer|seafood|jambon|ham|pepperoni|saucisse|sausage|merguez|prosciutto|pancetta|chorizo|vivaneau|tilapia|morue|aiglefin|haddock|flétan|halibut|pangasius|truite|trout|doré|walleye|mahi|bar|loup de mer|poisson|fish|crabe|crab|homard|lobster|pétoncle|scallop|moule|mussel|huître|oyster|calmar|squid)\b/;
  const DAIRY = /\b(lait|milk|beurre|butter|fromage|cheese|crème|cream|yogourt|yogurt|ghee|mozzarella|cheddar|parmesan|ricotta|feta|mascarpone|petit-lait|whey)\b/;
  const EGG = /\b(oeuf|œuf|egg)\b/;
  const PORK = /\b(porc|pork|bacon|lard|jambon|ham|pepperoni|saucisse de porc|pancetta|prosciutto|chorizo)\b/;
  const GLUTEN = /\b(farine|flour|blé|wheat|orge|barley|seigle|rye|pain|bread|pâtes|pasta|couscous|boulgour|bulgur|semoule|chapelure|panko)\b/;
  const LACTOSE = DAIRY; // lactose intolerance = same as dairy

  if (!MEAT.test(text)) tags.add('vegetarien');
  if (!MEAT.test(text) && !DAIRY.test(text) && !EGG.test(text)) tags.add('vegetalien');
  if (!PORK.test(text)) tags.add('halal');
  if (!GLUTEN.test(text)) tags.add('sans-gluten');
  if (!LACTOSE.test(text)) tags.add('sans-lactose');

  return Array.from(tags);
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
  if (typeof raw === 'number') return raw > 0 && raw <= 100 ? Math.round(raw) : 4;
  const str = String(raw).trim();
  // If raw is a volume/weight measure (e.g. "625 ml", "500 g"), it's a yield not a serving count
  if (/^\d+[\s,.]?\d*\s*(ml|g|kg|L|oz|lb|cl)\b/i.test(str)) return 4;
  const m = str.match(/\d+/);
  if (!m) return 4;
  const n = parseInt(m[0], 10);
  // Cap at 100 — anything higher is almost certainly a misparse (volume, grams, etc.)
  return n > 0 && n <= 100 ? n : 4;
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

const META_LINE_RE = /^(portions?|rendement|préparation|preparation|cuisson|macération|maceration|repos|réfrigération|réfrigeration|congélation|congelation|attente|refroidissement|levée|levee|marinage|trempage|décongélation|decongelation|marinade\s+\d|temps\s+de)\s+[\d,]/i;
const META_BOOL_RE = /^se\s+congèle\s+(oui|non)$/i;

function cleanIngredientText(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isMetaLine(s: string): boolean {
  const t = s.trim();
  return META_LINE_RE.test(t) || META_BOOL_RE.test(t);
}

export function parseInstructions(raw: unknown): string[] {
  const clean = (s: string) => s
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/^\s*(?:step\s*)?\d+[\.\)]\s*/i, '') // strip leading "1." / "Step 1:"
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split(/\n|<br\s*\/?>/).map(clean).filter(s => s.length > 3);
  if (!Array.isArray(raw)) return [];
  const steps: string[] = [];
  for (const step of raw as unknown[]) {
    if (typeof step === 'string') {
      steps.push(...step.split(/\n/).map(clean).filter(s => s.length > 3));
    } else {
      const s = step as Record<string, unknown>;
      const text = String(s.text ?? s.name ?? '').trim();
      if (text) steps.push(clean(text));
    }
  }
  return steps;
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
  'soup': 'Soupe', 'soupe': 'Soupe', 'potage': 'Soupe', 'veloute': 'Soupe', 'bisque': 'Soupe', 'chowder': 'Soupe',
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
        ? (recipe.recipeIngredient as unknown[]).map(i => cleanIngredientText(String(i))).filter(s => s && !isMetaLine(s))
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

      const parsedIngredients = ingredients;
      return {
        title: String(recipe.name),
        servings: parseServings(recipe.recipeYield ?? recipe['yield']),
        ingredients: parsedIngredients,
        instructions: parseInstructions(recipe.recipeInstructions),
        imageUrl: parseImageUrl(recipe.image),
        prepTimeMinutes: prepTime,
        cookTimeMinutes: cookTime,
        category,
        description: desc && desc.length > 10 ? desc : null,
        dietaryTags: parseDietaryTags(recipe.suitableForDiet, parsedIngredients),
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
    .filter(s => s && !isMetaLine(s));
  if (ingredients.length === 0) {
    prop('ingredients').toArray()
      .map(el => $(el).text().trim())
      .filter(s => s && !isMetaLine(s))
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
    dietaryTags: parseDietaryTags(null, ingredients),
  };
}

export function extractHeuristicHtml(html: string): ParsedRecipe | null {
  const $ = load(html);

  const title = $('h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.trim()
    || null;
  if (!title) return null;

  // Ricardo old-format: full recipe data embedded in React component props
  const ricardoEl = $('[data-react-app="recipeCookingMode"]');
  if (ricardoEl.length) {
    const raw = ricardoEl.attr('data-react-app-props') ?? '';
    try {
      const rData = JSON.parse(
        raw.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      );
      if (Array.isArray(rData.ingredientGroups) && Array.isArray(rData.preparationGroups)) {
        const rIngredients: string[] = [];
        for (const g of rData.ingredientGroups) {
          for (const ing of (g.ingredients ?? [])) {
            const t = (ing.description ?? '').trim().replace(/\s+/g, ' ');
            if (t && t.length > 2 && !isMetaLine(t)) rIngredients.push(t);
          }
        }
        const rInstructions: string[] = [];
        for (const g of rData.preparationGroups) {
          const steps = (g.preparations ?? []).slice().sort((a: any, b: any) => a.preparationOrder - b.preparationOrder);
          for (const step of steps) {
            const t = (step.description ?? '').trim().replace(/\s+/g, ' ');
            if (t && t.length > 5) rInstructions.push(t);
          }
        }
        if (rIngredients.length >= 2) {
          const imageUrl = $('meta[property="og:image"]').attr('content') ?? null;
          const catText = $('[itemprop="recipeCategory"]').first().text().trim();
          const descText = $('meta[property="og:description"]').attr('content')?.trim() ?? '';
          let servings = 4;
          const servText = $('[itemprop="recipeYield"]').first().text() || $('[class*="portion"]').first().text();
          if (servText) { const sv = parseServings(servText); if (sv > 0) servings = sv; }
          return {
            title: rData.title ?? title,
            servings,
            ingredients: rIngredients,
            instructions: rInstructions,
            imageUrl,
            prepTimeMinutes: null,
            cookTimeMinutes: null,
            category: mapCategory(catText) ?? null,
            description: descText.length > 10 ? descText : null,
            dietaryTags: parseDietaryTags(null, rIngredients),
          };
        }
      }
    } catch {
      // fall through to CSS selector extraction
    }
  }

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
    // Ricardo.com (old format scoped to ingredient section)
    '.c-recipe-instructions--ingredients .c-recipe-instructions__item',
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
    // Cuisinez.com / 5ingredients15minutes / pratico-pratiques
    '.recipe__ingredients--ingredient li',
    '.recipe__ingredients--ingredient',
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
      if (t && t.length > 2 && t.length < 200 && !isMetaLine(t)) ingredients.push(t);
    });
    if (ingredients.length >= 2) break; // need at least 2 to be a real ingredient list
  }
  // Dedup while preserving order (e.g., duplicate selectors matching same elements)
  const ingSet = new Set<string>();
  const uniqueIngredients = ingredients.filter(i => {
    const key = i.toLowerCase().replace(/\s+/g, ' ');
    if (ingSet.has(key)) return false;
    ingSet.add(key);
    return true;
  });
  if (uniqueIngredients.length === 0) return null;
  ingredients.length = 0;
  ingredients.push(...uniqueIngredients);

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
    // Ricardo.com old format (same c-recipe-instructions__item as ingredients but scoped)
    '.c-recipe-instructions--preparation .c-recipe-instructions__item',
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

  // Try to extract prep/cook time from common patterns
  function extractMinutesFromEl(sel: string): number | null {
    const el = $(sel).first();
    if (!el.length) return null;
    // Try ISO duration in content/datetime attributes first
    const iso = el.attr('content') ?? el.attr('datetime');
    if (iso) return parseDuration(iso);
    // Fall back to text
    const txt = el.text().trim();
    // "1h30", "1 h 30 min", "30 min", "30 minutes"
    const mFull = txt.match(/(\d+)\s*h(?:\s*(\d+)\s*(?:min|m))?|(\d+)\s*(?:min|minutes?|m)/i);
    if (mFull) {
      if (mFull[1] != null) return parseInt(mFull[1], 10) * 60 + parseInt(mFull[2] ?? '0', 10);
      return parseInt(mFull[3], 10);
    }
    // Bare number — WPRM etc. put units in a sibling span; treat as minutes
    const mNum = txt.match(/^(\d+)$/);
    if (mNum) return parseInt(mNum[1], 10);
    return null;
  }

  let prepTimeMinutes: number | null = null;
  let cookTimeMinutes: number | null = null;

  const prepSelectors = [
    '.wprm-recipe-prep_time', '.tasty-recipe-prep-time', '[class*="prep-time"]', '[class*="preptime"]',
    '[itemprop="prepTime"]', 'meta[itemprop="prepTime"]',
    '.recipe-prep-time', '[class*="prep_time"]',
  ];
  const cookSelectors = [
    '.wprm-recipe-cook_time', '.tasty-recipe-cook-time', '[class*="cook-time"]', '[class*="cooktime"]',
    '[itemprop="cookTime"]', 'meta[itemprop="cookTime"]',
    '.recipe-cook-time', '[class*="cook_time"]',
  ];
  const totalSelectors = [
    '.wprm-recipe-total_time', '.tasty-recipe-total-time', '[class*="total-time"]',
    '[itemprop="totalTime"]', 'meta[itemprop="totalTime"]',
  ];

  for (const sel of prepSelectors) {
    const v = extractMinutesFromEl(sel);
    if (v) { prepTimeMinutes = v; break; }
  }
  for (const sel of cookSelectors) {
    const v = extractMinutesFromEl(sel);
    if (v) { cookTimeMinutes = v; break; }
  }
  if (!prepTimeMinutes && !cookTimeMinutes) {
    for (const sel of totalSelectors) {
      const v = extractMinutesFromEl(sel);
      if (v) { cookTimeMinutes = v; break; }
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
    prepTimeMinutes,
    cookTimeMinutes,
    category: null,
    description: ogDesc && ogDesc.length > 10 ? ogDesc : null,
    dietaryTags: parseDietaryTags(null, ingredients),
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
  "category": "Déjeuner" | "Entrée" | "Soupe" | "Plat principal" | "Dessert" | "Pâtisserie" | "Accompagnement" | "Collation" | "Boisson" | null,
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

    // Tier 3: CSS-class heuristics (includes Ricardo data-react-app-props extraction)
    const fromHeuristic = extractHeuristicHtml(html);

    // For Microdata results with too few instructions, prefer heuristic if it has more
    if (fromMicrodata && fromMicrodata.ingredients.length > 0) {
      if (fromHeuristic && fromHeuristic.instructions.length > fromMicrodata.instructions.length) {
        return fromHeuristic;
      }
      return fromMicrodata;
    }
    if (fromHeuristic && fromHeuristic.ingredients.length > 0) return fromHeuristic;

    // Tier 4: Groq LLM fallback
    const partial = fromJsonLd ?? fromMicrodata ?? fromHeuristic;
    if (!process.env.GROQ_API_KEY) {
      if (partial) return partial;
      throw new Error('Recette introuvable. Essaie Ricardo, SOS Cuisine ou AllRecipes.');
    }

    return this.extractWithGroq(html, url, partial);
  }

  private async fetchHtml(url: string, attempt = 1): Promise<string> {
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
    // Retry once on transient server errors
    if ((res.status === 429 || res.status === 503 || res.status === 502) && attempt < 3) {
      const delay = attempt * 2000;
      await new Promise(r => setTimeout(r, delay));
      return this.fetchHtml(url, attempt + 1);
    }
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

    let content = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 16000);
        await new Promise(r => setTimeout(r, delay));
      }
      try {
        const completion = await this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 4096,
          messages: [
            { role: 'system', content: CLAUDE_SYSTEM },
            { role: 'user', content: `URL: ${url}\n\nPage content:\n${text}` },
          ],
        });
        content = completion.choices[0]?.message?.content ?? '';
        break;
      } catch (e: unknown) {
        if ((e as { status?: number })?.status === 429) continue;
        throw e;
      }
    }

    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as ParsedRecipe;
        if (!parsed.dietaryTags) parsed.dietaryTags = parseDietaryTags(null, parsed.ingredients ?? []);
        return parsed;
      }
    } catch {
      // fall through
    }

    if (partial) return partial;
    throw new Error(`Could not extract recipe from ${url}`);
  }
}
