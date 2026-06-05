/**
 * Canonical product catalog — SINGLE SOURCE OF TRUTH.
 *
 * Everything derives from here:
 *   - DB product rows           (prisma seed)
 *   - keyword match rules       (product-matcher)
 *   - Flipp search queries      (price-scraper)
 *   - manual baseline prices    (seed-prices)
 *
 * To add a product: append one entry here. That's it.
 */

export type UnitType = 'weight' | 'volume' | 'count';
export type Chain = 'Maxi' | 'IGA' | 'Metro';

export interface CatalogProduct {
  name: string;
  brand: string | null;
  category: string;
  defaultUnit: string;       // g | ml | unit
  defaultUnitType: UnitType;
  /** keyword rules: scraped name must contain ≥1 include and 0 exclude */
  include: string[];
  exclude: string[];
  /** Flipp/scraper search terms */
  queries: string[];
  /** baseline package + price per chain (cents), used when no flyer/scrape price */
  pkg: { size: number; unit: string };
  baseline: Partial<Record<Chain, number>>;
  /** density in g per ml — enables ml→g for weight products measured by volume
   *  in recipes (tsp of salt, tbsp of baking powder, cups of flour…) */
  densityGPerMl?: number;
}

export const CATALOG: CatalogProduct[] = [
  // ─── Baking / pantry ────────────────────────────────────────────────────────
  {
    name: 'Farine tout-usage', brand: 'Robin Hood', category: 'Farine',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['farine tout usage', 'farine tout-usage', 'all purpose flour', 'all-purpose flour', 'farine robin hood', 'farine five roses', 'farine selection', 'farine no name', 'farine sans nom'],
    exclude: ['blé entier', 'whole wheat', 'sarrasin', 'amande', 'avoine', 'gâteau', 'cake', 'sans gluten', 'gluten free', 'épeautre', 'à pain', 'bread'],
    queries: ['farine', 'farine tout usage', 'flour'],
    pkg: { size: 2000, unit: 'g' }, baseline: { Maxi: 499, IGA: 549, Metro: 529 }, densityGPerMl: 0.53,
  },
  {
    name: 'Sucre blanc', brand: 'Redpath', category: 'Sucre',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['sucre granulé', 'sucre blanc', 'granulated sugar', 'white sugar', 'sucre à fruits', 'sucre lantic', 'sucre redpath'],
    exclude: ['cassonade', 'glace', 'icing', 'brown', 'roux', 'érable', 'maple', 'coco', 'vanille', 'substitut', 'édulcorant', 'stevia'],
    queries: ['sucre', 'sucre granulé'],
    pkg: { size: 2000, unit: 'g' }, baseline: { Maxi: 399, IGA: 449, Metro: 429 }, densityGPerMl: 0.85,
  },
  {
    name: 'Cassonade', brand: null, category: 'Sucre',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['cassonade', 'sucre roux', 'brown sugar'],
    exclude: ['glace', 'icing', 'granulé'],
    queries: ['cassonade', 'brown sugar'],
    pkg: { size: 1000, unit: 'g' }, baseline: { Maxi: 299, IGA: 329, Metro: 319 }, densityGPerMl: 0.9,
  },
  {
    name: "Sirop d'érable", brand: null, category: 'Sucre',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ["sirop d'érable", 'maple syrup', 'sirop erable'],
    exclude: ['table', 'aunt jemima', 'crème'],
    queries: ["sirop d'érable", 'maple syrup'],
    pkg: { size: 540, unit: 'ml' }, baseline: { Maxi: 1099, IGA: 1199, Metro: 1149 },
  },
  {
    name: 'Levure chimique', brand: 'Magic', category: 'Épices',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['poudre à pâte', 'baking powder', 'poudre à lever'],
    exclude: ['bicarbonate', 'baking soda', 'levure de bière', 'levure sèche', 'yeast'],
    queries: ['poudre à pâte', 'baking powder'],
    pkg: { size: 450, unit: 'g' }, baseline: { Maxi: 349, IGA: 379, Metro: 359 }, densityGPerMl: 0.8,
  },
  {
    name: 'Bicarbonate de soude', brand: 'Arm & Hammer', category: 'Épices',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['bicarbonate de soude', 'bicarbonate de sodium', 'baking soda', 'petite vache'],
    exclude: ['poudre à pâte', 'baking powder'],
    queries: ['bicarbonate', 'baking soda'],
    pkg: { size: 500, unit: 'g' }, baseline: { Maxi: 199, IGA: 229, Metro: 219 }, densityGPerMl: 0.9,
  },
  {
    name: 'Extrait de vanille', brand: null, category: 'Épices',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['extrait de vanille', 'vanilla extract', 'essence de vanille'],
    exclude: ['gousse', 'bean', 'sucre'],
    queries: ['vanille extrait', 'vanilla extract'],
    pkg: { size: 100, unit: 'ml' }, baseline: { Maxi: 449, IGA: 499, Metro: 479 },
  },
  {
    name: 'Sel', brand: 'Sifto', category: 'Épices',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['sel de table', 'sel iodé', 'table salt', 'sel sifto', 'sel windsor', 'de sel', 'sel '],
    exclude: ['marin', 'mer', 'fleur de sel', 'casher', 'kosher', "d'ail", 'garlic salt', 'céleri', 'persil', 'vaisselle'],
    queries: ['sel de table', 'table salt'],
    pkg: { size: 1000, unit: 'g' }, baseline: { Maxi: 149, IGA: 169, Metro: 159 }, densityGPerMl: 1.2,
  },
  {
    name: 'Beurre arachide', brand: 'Kraft', category: 'Tartinades',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ["beurre d'arachide", 'beurre arachide', 'peanut butter'],
    exclude: ['amande', 'almond', 'noisette', 'chocolat'],
    queries: ["beurre d'arachide", 'peanut butter'],
    pkg: { size: 1000, unit: 'g' }, baseline: { Maxi: 499, IGA: 549, Metro: 529 }, densityGPerMl: 1.07,
  },
  {
    name: "Flocons d'avoine", brand: 'Quaker', category: 'Céréales',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ["flocons d'avoine", 'gruau', 'oats', 'oatmeal', 'rolled oats'],
    exclude: ['barre', 'bar', 'biscuit', 'cookie'],
    queries: ['gruau', 'flocons avoine', 'oats'],
    pkg: { size: 1000, unit: 'g' }, baseline: { Maxi: 399, IGA: 449, Metro: 429 },
  },

  // ─── Dairy & eggs ─────────────────────────────────────────────────────────────
  {
    name: 'Beurre non salé', brand: null, category: 'Produits laitiers',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['beurre non salé', 'unsalted butter', 'beurre doux', 'beurre selection', 'beurre lactantia', 'beurre président', 'beurre no name'],
    exclude: ['arachide', 'peanut', 'amande', 'almond', 'margarine', 'cacao', "à l'ail", 'garlic', 'demi-sel'],
    queries: ['beurre', 'butter'],
    pkg: { size: 454, unit: 'g' }, baseline: { Maxi: 699, IGA: 749, Metro: 729 }, densityGPerMl: 0.96,
  },
  {
    name: 'Lait 3,25%', brand: 'Natrel', category: 'Produits laitiers',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['lait 3,25', 'lait 3.25', 'milk 3.25', 'lait homogénéisé', 'lait entier', 'whole milk'],
    exclude: ['chocolat', 'chocolate', 'amande', 'almond', 'avoine', 'oat', 'soya', 'soy', 'coco', 'condensé', '1 %', '2 %', '1%', '2%', 'écrémé', 'skim', 'frappé', 'lactose', 'cacao', 'fit'],
    queries: ['lait', 'lait 3.25'],
    pkg: { size: 2000, unit: 'ml' }, baseline: { Maxi: 599, IGA: 649, Metro: 629 },
  },
  {
    name: 'Crème 35%', brand: null, category: 'Produits laitiers',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['crème 35', 'cream 35', 'crème à fouetter', 'whipping cream', 'crème épaisse'],
    exclude: ['10 %', '15 %', '10%', '15%', 'sure', 'sour', 'café', 'coffee', 'glacée', 'ice', 'coco', 'fouettée en', 'aérosol'],
    queries: ['crème 35', 'crème à fouetter'],
    pkg: { size: 473, unit: 'ml' }, baseline: { Maxi: 449, IGA: 499, Metro: 479 },
  },
  {
    name: 'Crème sure', brand: null, category: 'Produits laitiers',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['crème sure', 'sour cream', 'crème aigre'],
    exclude: ['35', 'fouetter', 'café'],
    queries: ['crème sure', 'sour cream'],
    pkg: { size: 500, unit: 'ml' }, baseline: { Maxi: 299, IGA: 329, Metro: 319 },
  },
  {
    name: 'Yogourt grec nature', brand: 'Oikos', category: 'Produits laitiers',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['yogourt grec', 'greek yogurt', 'yogourt nature'],
    exclude: ['boire', 'drink', 'enfant', 'kids', 'aromatisé', 'vanille', 'fraise'],
    queries: ['yogourt grec', 'greek yogurt'],
    pkg: { size: 750, unit: 'g' }, baseline: { Maxi: 499, IGA: 549, Metro: 529 },
  },
  {
    name: 'Fromage cheddar', brand: null, category: 'Produits laitiers',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['fromage cheddar', 'cheddar cheese', 'cheddar fort', 'cheddar mi-fort', 'cheddar doux'],
    exclude: ['tranches', 'slices', 'râpé', 'shredded', 'effiloché', 'string', 'collation'],
    queries: ['cheddar', 'fromage cheddar'],
    pkg: { size: 400, unit: 'g' }, baseline: { Maxi: 599, IGA: 649, Metro: 629 },
  },
  {
    name: 'Fromage mozzarella râpé', brand: null, category: 'Produits laitiers',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['mozzarella râpé', 'mozzarella rapé', 'shredded mozzarella', 'fromage râpé', 'pizza mozzarella'],
    exclude: ['boule', 'ball', 'frais', 'fresh', 'bâton'],
    queries: ['mozzarella râpé', 'fromage râpé'],
    pkg: { size: 320, unit: 'g' }, baseline: { Maxi: 499, IGA: 549, Metro: 529 },
  },
  {
    name: 'Oeufs gros', brand: null, category: 'Oeufs',
    defaultUnit: 'unit', defaultUnitType: 'count',
    include: ['oeufs gros', 'œufs gros', 'gros oeufs', 'large eggs', 'oeufs blancs', 'œufs blancs', 'oeufs calibre gros', 'lot de 12 ufs', 'lot de 12 œufs', 'oeufs bruns', 'naturoeuf'],
    exclude: ['liquide', 'liquid', 'chocolat', 'caille', 'substitut'],
    queries: ['oeufs', 'eggs'],
    pkg: { size: 12, unit: 'unit' }, baseline: { Maxi: 499, IGA: 549, Metro: 529 },
  },

  // ─── Oils ───────────────────────────────────────────────────────────────────
  {
    name: 'Huile canola', brand: null, category: 'Huiles',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['huile de canola', 'huile canola', 'canola oil', 'huile végétale', 'huile vegetale', 'vegetable oil'],
    exclude: ['mélange', 'blend', 'spray', 'enduit', 'aérosol', 'olive'],
    queries: ['huile canola', 'canola oil'],
    pkg: { size: 1000, unit: 'ml' }, baseline: { Maxi: 699, IGA: 749, Metro: 729 },
  },
  {
    name: "Huile d'olive extra vierge", brand: null, category: 'Huiles',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ["huile d'olive extra vierge", 'extra virgin olive oil', "huile d'olive vierge extra"],
    exclude: ['tapenade', 'antipasto', 'marinade', 'spray', 'enduit', 'pomace', 'pure'],
    queries: ['huile olive', 'olive oil'],
    pkg: { size: 500, unit: 'ml' }, baseline: { Maxi: 999, IGA: 1099, Metro: 1049 },
  },

  // ─── Grains & pasta ───────────────────────────────────────────────────────────
  {
    name: 'Riz blanc long grain', brand: null, category: 'Féculents',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['riz blanc', 'riz à grain long', 'riz grain long', 'long grain rice', 'white rice', 'riz long'],
    exclude: ['brun', 'brown', 'sauvage', 'wild', 'instantané', 'instant', 'arborio', 'basmati', 'jasmin', 'jasmine', 'assaisonné', 'calrose'],
    queries: ['riz blanc', 'white rice'],
    pkg: { size: 2000, unit: 'g' }, baseline: { Maxi: 599, IGA: 649, Metro: 629 }, densityGPerMl: 0.85,
  },
  {
    name: 'Pâtes spaghetti', brand: 'Barilla', category: 'Féculents',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['spaghetti', 'spaghettini', 'pâtes alimentaires barilla', 'pâtes barilla'],
    exclude: ['sauce', 'repas', 'meal', 'soupe', 'soup', 'courge', 'squash', 'sans gluten', 'gluten free'],
    queries: ['spaghetti', 'pâtes barilla'],
    pkg: { size: 450, unit: 'g' }, baseline: { Maxi: 199, IGA: 249, Metro: 229 },
  },

  // ─── Canned ─────────────────────────────────────────────────────────────────
  {
    name: 'Tomates en dés', brand: 'Hunts', category: 'Conserves',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['tomates en dés', 'diced tomatoes', 'tomates en conserve', 'canned tomatoes', 'tomates étuvées', 'tomates broyées', 'crushed tomatoes', 'tomates italiennes'],
    exclude: ['vigne', 'vine', 'cerise', 'cherry', 'fraîche', 'fresh', 'serre', 'rouges', 'séché', 'dried', 'pâte', 'paste', 'ketchup', 'jus', 'juice', 'soupe', 'soup', 'sauce'],
    queries: ['tomates en dés', 'diced tomatoes'],
    pkg: { size: 796, unit: 'ml' }, baseline: { Maxi: 149, IGA: 169, Metro: 159 },
  },
  {
    name: 'Pâte de tomate', brand: null, category: 'Conserves',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['pâte de tomate', 'tomato paste', 'concentré de tomate'],
    exclude: ['sauce', 'dés', 'diced', 'jus', 'broyées'],
    queries: ['pâte de tomate', 'tomato paste'],
    pkg: { size: 156, unit: 'ml' }, baseline: { Maxi: 99, IGA: 119, Metro: 109 },
  },
  {
    name: 'Sauce tomate', brand: null, category: 'Conserves',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['sauce tomate', 'tomato sauce', 'sauce aux tomates'],
    exclude: ['pâte', 'paste', 'dés', 'diced', 'pour pâtes', 'pasta sauce', 'à spaghetti'],
    queries: ['sauce tomate', 'tomato sauce'],
    pkg: { size: 680, unit: 'ml' }, baseline: { Maxi: 129, IGA: 149, Metro: 139 },
  },
  {
    name: 'Pois chiches en conserve', brand: null, category: 'Légumineuses',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['pois chiches', 'chickpea', 'chick pea', 'garbanzo'],
    exclude: ['rôtis', 'roasted', 'collation', 'snack', 'farine', 'flour', 'houmous', 'hummus'],
    queries: ['pois chiches', 'chickpeas'],
    pkg: { size: 540, unit: 'ml' }, baseline: { Maxi: 129, IGA: 149, Metro: 139 },
  },
  {
    name: 'Maïs en conserve', brand: 'Géant Vert', category: 'Conserves',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['maïs en conserve', 'maïs en grains', 'canned corn', 'corn kernels', 'maïs en crème'],
    exclude: ['épi', 'cob', 'surgelé', 'frozen', 'tortilla', 'farine', 'sirop', 'syrup'],
    queries: ['maïs en grains', 'canned corn'],
    pkg: { size: 341, unit: 'ml' }, baseline: { Maxi: 99, IGA: 119, Metro: 109 },
  },

  // ─── Produce ──────────────────────────────────────────────────────────────────
  {
    name: 'Oignon jaune', brand: null, category: 'Légumes',
    defaultUnit: 'unit', defaultUnitType: 'count',
    include: ['oignon jaune', 'oignons jaunes', 'yellow onion', 'oignon espagnol'],
    exclude: ['vert', 'green', 'rouge', 'red', 'poudre', 'powder', 'frit', 'fried', 'perlé'],
    queries: ['oignon jaune', 'yellow onion'],
    pkg: { size: 1, unit: 'unit' }, baseline: { Maxi: 79, IGA: 89, Metro: 85 },
  },
  {
    name: 'Ail', brand: null, category: 'Légumes',
    defaultUnit: 'unit', defaultUnitType: 'count',
    include: ["bulbe d'ail", 'ail frais', "tête d'ail", "gousses d'ail", 'fresh garlic', 'garlic bulb'],
    exclude: ['poudre', 'powder', 'sel', 'salt', 'haché en pot', 'minced', 'toast', 'pain', 'bread', 'crevette', 'shrimp', 'sauce', 'vinaigrette', 'croûton', 'beurre', 'butter', 'trempette'],
    queries: ['ail frais', 'bulbe ail'],
    pkg: { size: 1, unit: 'unit' }, baseline: { Maxi: 69, IGA: 79, Metro: 75 },
  },
  {
    name: 'Pomme de terre', brand: null, category: 'Légumes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['pommes de terre', 'patates', 'potatoes', 'russet', 'yukon'],
    exclude: ['douce', 'sweet', 'frite', 'fries', 'croustilles', 'chips', 'pilée', 'purée'],
    queries: ['pommes de terre', 'potatoes'],
    pkg: { size: 4500, unit: 'g' }, baseline: { Maxi: 399, IGA: 449, Metro: 429 },
  },
  {
    name: 'Carotte', brand: null, category: 'Légumes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['carottes', 'carrots'],
    exclude: ['jus', 'juice', 'gâteau', 'cake', 'râpées', 'mini', 'naines'],
    queries: ['carottes', 'carrots'],
    pkg: { size: 1000, unit: 'g' }, baseline: { Maxi: 199, IGA: 229, Metro: 219 },
  },

  // ─── Meat ───────────────────────────────────────────────────────────────────
  {
    name: 'Poitrine de poulet', brand: null, category: 'Viandes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['poitrine de poulet', 'poitrines de poulet', 'chicken breast'],
    exclude: ['haché', 'ground', 'aile', 'wing', 'cuisse', 'thigh', 'entier', 'whole', 'nugget', 'pané', 'panées', 'breaded', 'farci', 'mariné', 'bouillon', 'broth', 'porc', 'pork', 'tofu', 'escalope'],
    queries: ['poitrine poulet', 'chicken breast'],
    pkg: { size: 600, unit: 'g' }, baseline: { Maxi: 1299, IGA: 1399, Metro: 1349 },
  },
  {
    name: 'Boeuf haché maigre', brand: null, category: 'Viandes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['boeuf haché maigre', 'bœuf haché maigre', 'lean ground beef', 'boeuf haché mi-maigre', 'bœuf haché mi-maigre', 'medium ground beef', 'boeuf haché extra', 'bœuf haché extra'],
    exclude: ['porc', 'pork', 'poulet', 'chicken', 'dinde', 'turkey', 'veau', 'veal', 'végé', 'plant', 'bouillon', 'sauce'],
    queries: ['boeuf haché', 'ground beef'],
    pkg: { size: 454, unit: 'g' }, baseline: { Maxi: 899, IGA: 999, Metro: 949 },
  },
  {
    name: 'Porc haché', brand: null, category: 'Viandes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['porc haché', 'ground pork'],
    exclude: ['boeuf', 'beef', 'poulet', 'chicken', 'dinde', 'veau', 'saucisse'],
    queries: ['porc haché', 'ground pork'],
    pkg: { size: 450, unit: 'g' }, baseline: { Maxi: 599, IGA: 649, Metro: 629 },
  },
  {
    name: 'Bacon', brand: null, category: 'Viandes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['bacon', 'lard fumé'],
    exclude: ['bits', 'morceaux', 'végé', 'dinde', 'turkey', 'canadien rond'],
    queries: ['bacon'],
    pkg: { size: 375, unit: 'g' }, baseline: { Maxi: 599, IGA: 649, Metro: 629 },
  },

  // ─── Bakery ─────────────────────────────────────────────────────────────────
  {
    name: 'Pain tranché', brand: null, category: 'Boulangerie',
    defaultUnit: 'unit', defaultUnitType: 'count',
    include: ['pain tranché', 'pain blanc', 'pain de blé', 'sliced bread', 'pain sandwich'],
    exclude: ['baguette', 'hamburger', 'hot dog', 'pita', 'naan', 'bagel', 'croûtons'],
    queries: ['pain tranché', 'sliced bread'],
    pkg: { size: 1, unit: 'unit' }, baseline: { Maxi: 299, IGA: 329, Metro: 319 },
  },

  // ─── Pantry condiments & broths ───────────────────────────────────────────────
  {
    name: 'Poivre noir moulu', brand: null, category: 'Épices',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['poivre noir', 'poivre moulu', 'black pepper', 'de poivre', 'poivre du moulin'],
    exclude: ['poivron', 'bell', 'cayenne', 'rouge', 'rose', 'blanc'],
    queries: ['poivre noir', 'black pepper'],
    pkg: { size: 60, unit: 'g' }, baseline: { Maxi: 399, IGA: 449, Metro: 429 }, densityGPerMl: 0.5,
  },
  {
    name: 'Fécule de maïs', brand: null, category: 'Épicerie',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['fécule de maïs', 'fecule de mais', 'corn starch', 'cornstarch', 'fécule'],
    exclude: ['sirop', 'syrup', 'farine de maïs'],
    queries: ['fécule de maïs', 'corn starch'],
    pkg: { size: 454, unit: 'g' }, baseline: { Maxi: 249, IGA: 279, Metro: 269 }, densityGPerMl: 0.55,
  },
  {
    name: 'Bouillon de poulet', brand: null, category: 'Conserves',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['bouillon de poulet', 'chicken broth', 'chicken stock', 'fond de poulet', 'bouillon poulet'],
    exclude: ['boeuf', 'beef', 'légume', 'vegetable', 'cube', 'poudre', 'soupe'],
    queries: ['bouillon de poulet', 'chicken broth'],
    pkg: { size: 900, unit: 'ml' }, baseline: { Maxi: 199, IGA: 229, Metro: 219 },
  },
  {
    name: 'Bouillon de boeuf', brand: null, category: 'Conserves',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['bouillon de boeuf', 'bouillon de bœuf', 'beef broth', 'beef stock', 'fond de boeuf', 'fond de veau'],
    exclude: ['poulet', 'chicken', 'légume', 'vegetable', 'cube', 'poudre', 'soupe'],
    queries: ['bouillon de boeuf', 'beef broth'],
    pkg: { size: 900, unit: 'ml' }, baseline: { Maxi: 199, IGA: 229, Metro: 219 },
  },
  {
    name: 'Sauce soya', brand: null, category: 'Épicerie',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['sauce soya', 'sauce soja', 'soy sauce'],
    exclude: ['teriyaki', 'huîtres', 'oyster', 'hoisin'],
    queries: ['sauce soya', 'soy sauce'],
    pkg: { size: 500, unit: 'ml' }, baseline: { Maxi: 299, IGA: 329, Metro: 319 },
  },
  {
    name: 'Vinaigre blanc', brand: null, category: 'Épicerie',
    defaultUnit: 'ml', defaultUnitType: 'volume',
    include: ['vinaigre blanc', 'white vinegar'],
    exclude: ['balsamique', 'balsamic', 'cidre', 'cider', 'de riz', 'de vin', 'wine'],
    queries: ['vinaigre blanc', 'white vinegar'],
    pkg: { size: 1000, unit: 'ml' }, baseline: { Maxi: 199, IGA: 219, Metro: 209 },
  },

  // ─── More produce ─────────────────────────────────────────────────────────────
  {
    name: 'Petits pois', brand: null, category: 'Légumes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['petits pois', 'pois verts', 'green peas', 'pois surgelés'],
    exclude: ['chiche', 'chickpea', 'mange-tout', 'snap', 'soupe', 'cassés'],
    queries: ['petits pois', 'green peas'],
    pkg: { size: 750, unit: 'g' }, baseline: { Maxi: 299, IGA: 329, Metro: 319 },
  },
  {
    name: 'Épinards', brand: null, category: 'Légumes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['épinards', 'epinards', 'spinach'],
    exclude: ['crème', 'cream', 'trempette', 'dip', 'surgelés en bloc'],
    queries: ['épinards', 'spinach'],
    pkg: { size: 300, unit: 'g' }, baseline: { Maxi: 299, IGA: 349, Metro: 329 },
  },
  {
    name: 'Poivron', brand: null, category: 'Légumes',
    defaultUnit: 'unit', defaultUnitType: 'count',
    include: ['poivron', 'poivrons', 'bell pepper'],
    exclude: ['poudre', 'powder', 'flakes', 'piment fort', 'broyé', 'séché'],
    queries: ['poivron', 'bell pepper'],
    pkg: { size: 1, unit: 'unit' }, baseline: { Maxi: 150, IGA: 175, Metro: 165 },
  },
  {
    name: 'Oignon vert', brand: null, category: 'Légumes',
    defaultUnit: 'unit', defaultUnitType: 'count',
    include: ['oignon vert', 'oignons verts', 'échalote verte', 'green onion', 'scallion', 'ciboule'],
    exclude: ['jaune', 'rouge', 'espagnol', 'poudre', 'française'],
    queries: ['oignon vert', 'green onion'],
    pkg: { size: 1, unit: 'unit' }, baseline: { Maxi: 129, IGA: 149, Metro: 139 },
  },
  {
    name: 'Gingembre', brand: null, category: 'Légumes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['gingembre frais', 'gingembre', 'fresh ginger', 'racine de gingembre'],
    exclude: ['moulu', 'ground', 'ale', 'tisane', 'biscuit', 'confit'],
    queries: ['gingembre', 'ginger'],
    pkg: { size: 100, unit: 'g' }, baseline: { Maxi: 99, IGA: 119, Metro: 109 },
  },
  {
    name: 'Champignons', brand: null, category: 'Légumes',
    defaultUnit: 'g', defaultUnitType: 'weight',
    include: ['champignons', 'champignon', 'mushroom', 'café au lait', 'cremini', 'blancs'],
    exclude: ['soupe', 'soup', 'sauce', 'crème', 'séchés'],
    queries: ['champignons', 'mushrooms'],
    pkg: { size: 227, unit: 'g' }, baseline: { Maxi: 249, IGA: 279, Metro: 269 },
  },
];

export const CHAINS: Chain[] = ['Maxi', 'IGA', 'Metro'];
