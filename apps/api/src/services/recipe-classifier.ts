/**
 * Classify a recipe into a coarse category from its title (+ optional text).
 * Keyword-based, free, deterministic. Order = priority.
 */

export const RECIPE_CATEGORIES = [
  'Déjeuner',
  'Entrée',
  'Soupe',
  'Dessert',
  'Pâtisserie',
  'Accompagnement',
  'Boisson',
  'Collation',
  'Plat principal',
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Checked in order — first match wins.
const RULES: Array<{ category: RecipeCategory; keywords: string[] }> = [
  { category: 'Déjeuner', keywords: ['crepe', 'pancake', 'gaufre', 'gruau', 'omelette', 'dejeuner', 'granola', 'smoothie', 'oeufs brouilles', 'pain dore', 'frittata', 'shakshuka', 'muffin dejeuner', 'overnight oats', 'benedict'] },
  { category: 'Boisson', keywords: ['cocktail', 'limonade', 'sangria', 'boisson', 'jus de', 'tisane', 'chocolat chaud', 'latte', 'milkshake', 'slush', 'punch', 'spritz', 'infusion', 'kefir', 'cosmopolitan', 'cosmopolitain', 'portonic', 'vin chaud', 'kir royal', 'aperitif', 'thé glacé', 'thé froid', 'kombucha'] },
  { category: 'Soupe', keywords: ['soupe', 'potage', 'veloute', 'chowder', 'gaspacho', 'bouillon', 'minestrone', 'bisque', 'bortsch', 'ramen', 'pho', 'consomme', 'vichyssoise', 'creme de '] },
  // Dessert before Entrée so "salade de fruits" beats the generic 'salade' keyword
  { category: 'Dessert', keywords: [
    'gateau', 'biscuit', 'tarte', 'brownie', 'pouding', 'mousse ', 'creme glacee', 'sucre a la creme',
    'fudge', 'dessert', 'sorbet', 'tiramisu', 'cupcake', 'sable', 'galette', 'carre au', 'carre de',
    'compote', 'creme brulee', 'creme anglaise', 'cheesecake', 'panna cotta', 'crostata', 'clafoutis', 'fondant au chocolat',
    'muffin', 'scone sucre', 'profiterole', 'macaron', 'verrine',
    'jujube', 'bonbon', 'confiserie', 'nougat', 'praline',
    'salade de fruit', 'brochette de cerise', 'quatre-quarts', 'quatre quarts',
    'eclat de chocolat', 'tartinade au chocolat', 'caramel ecossais',
    'croustade', 'crumble', 'biscotti', 'panettone', 'sundae', 'moka', 'billot',
    'cake au', 'cake a la', 'cake a l',
    'carres moelleux', 'carres aux', 'carres de',
    'brown betty', 'tapioca', 'guimauve', 'marshmallow', 'flan ', 'flans',
  ] },
  // Collation after Dessert — sweet spreads and snacks
  { category: 'Collation', keywords: [
    'craquelin', 'barre energetique', 'barre de', 'energie', 'trail mix', 'pop corn', 'popcorn',
    'bouchees', 'collation', 'snack', 'nachos', 'chips maison', 'tartinade', 'sucette', 'confiture',
  ] },
  { category: 'Pâtisserie', keywords: ['pate a', 'croissant', 'brioche', 'choux', 'eclair', 'feuillete', 'patisserie', 'scone', 'pate brisee', 'pate feuilletee', 'pain ', 'focaccia', 'naan', 'baguette', 'pretzel', 'bretzel'] },
  { category: 'Entrée', keywords: [
    'salade', 'trempette', 'bruschetta', 'tartare', 'entree', 'crevettes', 'rouleaux', 'imperiaux',
    'hummus', 'guacamole', 'ceviche', 'carpaccio', 'antipasto', 'terrine', 'pate de foie', 'foie gras',
    'gravlax', 'crostini', 'gougere', 'salsa', 'tapenade', 'brie', 'camembert',
    'acras', 'bouraks', 'champignons farcis', 'legumes farcis',
  ] },
  { category: 'Accompagnement', keywords: ['puree', 'frites', 'accompagnement', 'riz pilaf', 'riz basmati', 'riz blanc', 'riz long', 'couscous', 'legumes roti', 'salade de', 'gratin', 'slaw', 'polenta', 'tabbouleh', 'sauce pour'] },
  { category: 'Plat principal', keywords: [
    'poulet', 'boeuf', 'porc', 'agneau', 'veau', 'gigot', 'pates', 'spaghetti', 'lasagne', 'pizza',
    'burger', 'ragout', 'mijote', 'chili', 'pate chinois', 'saute', 'curry', 'casserole', 'poisson',
    'saumon', 'fish', 'macaroni', 'risotto', 'tacos', 'quiche', 'paella', 'fondue', 'steak', 'roti',
    'tourtiere', 'shepherd', 'pad thai', 'burrito', 'fajita', 'gyoza', 'dumplings', 'bolognese',
    'carbonara', 'tikka masala', 'butter chicken', 'canard', 'confit', 'osso buco', 'blanquette',
    'bourguignon',
  ] },
];

export function classifyRecipe(title: string, extra = ''): RecipeCategory {
  // Title takes priority: if a rule matches the title alone, use it immediately.
  const titleNorm = norm(title);
  for (const rule of RULES) {
    if (rule.keywords.some((k) => titleNorm.includes(norm(k)))) return rule.category;
  }
  // Fallback: check instructions for Soupe/Déjeuner/Boisson signals (high-confidence only).
  if (extra) {
    const extraNorm = norm(extra);
    const highConfidence: RecipeCategory[] = ['Soupe', 'Déjeuner', 'Boisson', 'Dessert'];
    for (const rule of RULES) {
      if (!highConfidence.includes(rule.category)) continue;
      if (rule.keywords.some((k) => extraNorm.includes(norm(k)))) return rule.category;
    }
  }
  return 'Plat principal';
}

// ─── Difficulty ─────────────────────────────────────────────────────────────
// Deterministic score from ingredient count, step count, total time and
// technique keywords. Free, no LLM. Order of techniques = signal strength.

export const RECIPE_DIFFICULTIES = ['débutant', 'confirmé', 'expert'] as const;
export type RecipeDifficulty = (typeof RECIPE_DIFFICULTIES)[number];

// High-skill techniques — strong push toward expert.
const ADVANCED_TECHNIQUES = [
  'pate feuilletee', 'feuilletage', 'temperage', 'temperer le chocolat', 'pochage', 'pocher',
  'flambe', 'flamber', 'emulsion', 'emulsionner', 'confit', 'confire', 'braiser',
  'macaron', 'souffle', 'meringue italienne', 'pate a choux', 'genoise', 'bavarois',
  'ganache', 'sous vide', 'clarifier', 'bain-marie', 'julienne', 'brunoise', 'desosser',
  'lever les filets', 'abaisser', 'glacage miroir', 'creme anglaise', 'tremper le chocolat',
  'monter en neige', 'caraméliser', 'carameliser', 'deglacer', 'reduction',
];

// Mid-skill techniques — push toward confirmé.
const INTERMEDIATE_TECHNIQUES = [
  'mariner', 'paner', 'saisir', 'mijoter', 'blanchir', 'sauter', 'rotir', 'gratiner',
  'reduire', 'fouetter', 'incorporer', 'petrir', 'laisser reposer', 'beurre pommade',
  'monter', 'napper', 'zester', 'tamiser', 'faire revenir', 'deglacer',
];

function countMatches(text: string, keywords: string[]): number {
  let n = 0;
  for (const k of keywords) if (text.includes(norm(k))) n++;
  return n;
}

/**
 * Classify recipe difficulty: débutant | confirmé | expert.
 * @param ingredientCount  number of ingredient lines
 * @param instructions     array of step strings
 * @param totalMinutes     prep + cook minutes (null if unknown)
 */
export function classifyDifficulty(
  ingredientCount: number,
  instructions: string[],
  totalMinutes: number | null,
): RecipeDifficulty {
  const text = norm(instructions.join(' '));
  const steps = instructions.length;

  let score = 0;

  // Ingredient count
  if (ingredientCount >= 12) score += 2;
  else if (ingredientCount >= 7) score += 1;

  // Step count
  if (steps >= 10) score += 2;
  else if (steps >= 6) score += 1;

  // Total time
  if (totalMinutes != null) {
    if (totalMinutes >= 120) score += 2;
    else if (totalMinutes >= 60) score += 1;
  }

  // Techniques
  score += Math.min(countMatches(text, INTERMEDIATE_TECHNIQUES), 2); // cap +2
  score += Math.min(countMatches(text, ADVANCED_TECHNIQUES) * 2, 4);  // cap +4

  if (score >= 6) return 'expert';
  if (score >= 3) return 'confirmé';
  return 'débutant';
}
