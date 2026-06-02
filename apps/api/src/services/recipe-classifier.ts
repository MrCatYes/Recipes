/**
 * Classify a recipe into a coarse category from its title (+ optional text).
 * Keyword-based, free, deterministic. Order = priority.
 */

export const RECIPE_CATEGORIES = [
  'Déjeuner',
  'Entrée',
  'Dessert',
  'Pâtisserie',
  'Accompagnement',
  'Plat principal',
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Checked in order — first match wins.
const RULES: Array<{ category: RecipeCategory; keywords: string[] }> = [
  { category: 'Déjeuner', keywords: ['crepe', 'pancake', 'gaufre', 'gruau', 'omelette', 'dejeuner', 'granola', 'smoothie', 'oeufs brouilles', 'pain dore'] },
  { category: 'Pâtisserie', keywords: ['pate a', 'croissant', 'brioche', 'chou', 'eclair', 'feuillete', 'patisserie', 'scone', 'pate brisee', 'pate feuilletee', 'pain '] },
  { category: 'Dessert', keywords: ['gateau', 'biscuit', 'tarte', 'brownie', 'pouding', 'mousse', 'creme glacee', 'sucre a la creme', 'fudge', 'dessert', 'sorbet', 'tiramisu', 'cupcake', 'sablé', 'sable', 'galette', 'carre', 'compote', 'creme brulee'] },
  { category: 'Entrée', keywords: ['salade', 'soupe', 'potage', 'trempette', 'bruschetta', 'tartare', 'entree', 'veloute', 'crevettes', 'rouleaux', 'imperiaux', 'craquelin', 'hummus', 'guacamole'] },
  { category: 'Accompagnement', keywords: ['puree', 'frites', 'accompagnement', 'riz pilaf', 'couscous', 'legumes roti', 'salade de'] },
  { category: 'Plat principal', keywords: ['poulet', 'boeuf', 'porc', 'pates', 'spaghetti', 'lasagne', 'pizza', 'burger', 'ragout', 'mijote', 'chili', 'pate chinois', 'saute', 'curry', 'casserole', 'poisson', 'saumon', 'fish', 'macaroni', 'risotto', 'tacos', 'quiche', 'paella', 'fondue'] },
];

export function classifyRecipe(title: string, extra = ''): RecipeCategory {
  const text = norm(`${title} ${extra}`);
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(norm(k)))) return rule.category;
  }
  return 'Plat principal';
}
