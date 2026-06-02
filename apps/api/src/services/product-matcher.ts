/**
 * Shared product matcher.
 * Maps a scraped/flyer product name → our canonical DB product via keyword rules.
 * Strict: rejects wrong-category items (jus de tomate ≠ tomates en dés, porc ≠ boeuf).
 */

export interface MatchRule {
  mustInclude: string[];
  mustExclude: string[];
}

export const MATCH_RULES: Record<string, MatchRule> = {
  'Farine tout-usage':          { mustInclude: ['farine tout usage', 'farine tout-usage', 'all purpose flour', 'all-purpose flour', 'farine robin hood', 'farine five roses', 'farine selection', 'farine no name', 'farine sans nom'], mustExclude: ['blé entier', 'whole wheat', 'sarrasin', 'amande', 'avoine', 'gâteau', 'cake', 'sans gluten', 'gluten free', 'épeautre', 'à pain', 'bread'] },
  'Sucre blanc':                { mustInclude: ['sucre granulé', 'sucre blanc', 'granulated sugar', 'white sugar', 'sucre à fruits', 'sucre lantic', 'sucre redpath'], mustExclude: ['cassonade', 'glace', 'icing', 'brown', 'roux', 'érable', 'maple', 'coco', 'vanille', 'substitut', 'édulcorant', 'stevia'] },
  'Beurre non salé':            { mustInclude: ['beurre non salé', 'unsalted butter', 'beurre doux', 'beurre selection', 'beurre lactantia', 'beurre président', 'beurre no name'], mustExclude: ['arachide', 'peanut', 'amande', 'almond', 'margarine', 'cacao', "à l'ail", 'garlic', 'demi-sel'] },
  'Lait 3,25%':                 { mustInclude: ['lait 3,25', 'lait 3.25', 'milk 3.25', 'lait homogénéisé', 'lait entier', 'whole milk'], mustExclude: ['chocolat', 'chocolate', 'amande', 'almond', 'avoine', 'oat', 'soya', 'soy', 'coco', 'condensé', '1 %', '2 %', '1%', '2%', 'écrémé', 'skim', 'frappé', 'lactose', 'cacao', 'fit'] },
  'Crème 35%':                  { mustInclude: ['crème 35', 'cream 35', 'crème à fouetter', 'whipping cream', 'crème épaisse'], mustExclude: ['10 %', '15 %', '10%', '15%', 'sure', 'sour', 'café', 'coffee', 'glacée', 'ice', 'coco', 'fouettée en', 'aérosol'] },
  'Oeufs gros':                 { mustInclude: ['oeufs gros', 'œufs gros', 'gros oeufs', 'large eggs', 'oeufs blancs', 'œufs blancs', 'oeufs calibre gros', 'lot de 12 ufs', 'lot de 12 œufs', 'oeufs bruns', 'naturoeuf'], mustExclude: ['liquide', 'liquid', 'chocolat', 'caille', 'substitut', 'omega'] },
  'Huile canola':               { mustInclude: ['huile de canola', 'huile canola', 'canola oil'], mustExclude: ['mélange', 'blend', 'spray', 'enduit', 'aérosol'] },
  "Huile d'olive extra vierge": { mustInclude: ["huile d'olive extra vierge", 'extra virgin olive oil', "huile d'olive vierge extra"], mustExclude: ['tapenade', 'antipasto', 'marinade', 'spray', 'enduit', 'pomace', 'pure'] },
  'Riz blanc long grain':       { mustInclude: ['riz blanc', 'riz à grain long', 'riz grain long', 'long grain rice', 'white rice', 'riz long'], mustExclude: ['brun', 'brown', 'sauvage', 'wild', 'instantané', 'instant', 'arborio', 'basmati', 'jasmin', 'jasmine', 'assaisonné', 'calrose'] },
  'Pâtes spaghetti':            { mustInclude: ['spaghetti', 'spaghettini', 'pâtes alimentaires barilla', 'pâtes barilla'], mustExclude: ['sauce', 'repas', 'meal', 'soupe', 'soup', 'courge', 'squash', 'sans gluten', 'gluten free'] },
  'Poitrine de poulet':         { mustInclude: ['poitrine de poulet', 'poitrines de poulet', 'chicken breast'], mustExclude: ['haché', 'ground', 'aile', 'wing', 'cuisse', 'thigh', 'entier', 'whole', 'nugget', 'pané', 'panées', 'breaded', 'farci', 'mariné', 'bouillon', 'broth', 'porc', 'pork', 'tofu', 'escalope'] },
  'Boeuf haché maigre':         { mustInclude: ['boeuf haché maigre', 'bœuf haché maigre', 'lean ground beef', 'boeuf haché mi-maigre', 'bœuf haché mi-maigre', 'medium ground beef', 'boeuf haché extra', 'bœuf haché extra'], mustExclude: ['porc', 'pork', 'poulet', 'chicken', 'dinde', 'turkey', 'veau', 'veal', 'végé', 'plant', 'bouillon', 'sauce'] },
  'Tomates en dés':             { mustInclude: ['tomates en dés', 'diced tomatoes', 'tomates en conserve', 'canned tomatoes', 'tomates étuvées', 'tomates broyées', 'crushed tomatoes', 'tomates italiennes'], mustExclude: ['vigne', 'vine', 'cerise', 'cherry', 'fraîche', 'fresh', 'serre', 'rouges', 'séché', 'dried', 'pâte', 'paste', 'ketchup', 'jus', 'juice', 'soupe', 'soup', 'sauce'] },
  'Pois chiches en conserve':   { mustInclude: ['pois chiches', 'chickpea', 'chick pea', 'garbanzo'], mustExclude: ['rôtis', 'roasted', 'collation', 'snack', 'farine', 'flour', 'houmous', 'hummus'] },
  'Levure chimique':            { mustInclude: ['poudre à pâte', 'baking powder', 'poudre à lever'], mustExclude: ['bicarbonate', 'baking soda', 'levure de bière', 'levure sèche', 'yeast'] },
};

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
}

export interface DBProduct { id: string; name: string }

/** Returns the DB product whose rule matches the scraped name, or null. */
export function ruleMatch(scrapedName: string, dbProducts: DBProduct[]): DBProduct | null {
  const name = normalize(scrapedName);

  for (const db of dbProducts) {
    const rule = MATCH_RULES[db.name];
    if (!rule) continue;
    if (!rule.mustInclude.some(k => name.includes(normalize(k)))) continue;
    if (rule.mustExclude.some(k => name.includes(normalize(k)))) continue;
    return db;
  }
  return null;
}

/** Validates that a scraped name matches a specific target product name. */
export function matchesProduct(scrapedName: string, dbName: string): boolean {
  const rule = MATCH_RULES[dbName];
  if (!rule) return false;
  const name = normalize(scrapedName);
  if (!rule.mustInclude.some(k => name.includes(normalize(k)))) return false;
  if (rule.mustExclude.some(k => name.includes(normalize(k)))) return false;
  return true;
}
