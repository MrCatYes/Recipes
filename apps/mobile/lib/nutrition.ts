export interface Macros {
  kcal: number;    // per 100g or 100ml
  protein: number; // g
  fat: number;     // g
  carbs: number;   // g
  fiber: number;   // g
  sugar: number;   // g
}

// Per 100g unless noted. Source: USDA / Health Canada.
const NUTRITION_DB: Record<string, Macros> = {
  'Farine tout-usage':         { kcal: 364, protein: 10.3, fat: 1.0,  carbs: 76.3, fiber: 2.7,  sugar: 0.3 },
  'Sucre blanc':               { kcal: 387, protein: 0.0,  fat: 0.0,  carbs: 100,  fiber: 0.0,  sugar: 100 },
  'Cassonade':                 { kcal: 380, protein: 0.1,  fat: 0.0,  carbs: 98.1, fiber: 0.0,  sugar: 97.0 },
  'Poudre à pâte':             { kcal: 53,  protein: 0.0,  fat: 0.0,  carbs: 27.7, fiber: 0.2,  sugar: 0.0 },
  'Bicarbonate de soude':      { kcal: 0,   protein: 0.0,  fat: 0.0,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Sel':                       { kcal: 0,   protein: 0.0,  fat: 0.0,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Poivre noir':               { kcal: 251, protein: 10.4, fat: 3.3,  carbs: 64.8, fiber: 25.3, sugar: 0.6 },
  'Cannelle moulue':           { kcal: 247, protein: 4.0,  fat: 1.2,  carbs: 80.6, fiber: 53.1, sugar: 2.2 },
  'Cumin':                     { kcal: 375, protein: 17.8, fat: 22.3, carbs: 44.2, fiber: 10.5, sugar: 2.3 },
  'Paprika':                   { kcal: 282, protein: 14.1, fat: 12.9, carbs: 54.0, fiber: 34.9, sugar: 10.3 },
  'Ail en poudre':             { kcal: 331, protein: 16.6, fat: 0.7,  carbs: 72.7, fiber: 9.0,  sugar: 0.9 },
  'Vanille':                   { kcal: 288, protein: 0.1,  fat: 0.1,  carbs: 12.7, fiber: 0.0,  sugar: 12.7 },
  'Levure instantanée':        { kcal: 325, protein: 40.4, fat: 7.6,  carbs: 41.2, fiber: 26.9, sugar: 0.0 },
  'Fécule de maïs':            { kcal: 381, protein: 0.3,  fat: 0.1,  carbs: 91.3, fiber: 0.9,  sugar: 0.0 },
  'Cacao en poudre':           { kcal: 228, protein: 19.6, fat: 13.7, carbs: 57.9, fiber: 37.0, sugar: 1.8 },
  'Chocolat noir':             { kcal: 546, protein: 4.9,  fat: 31.3, carbs: 59.4, fiber: 7.0,  sugar: 47.9 },
  // Dairy
  'Lait 2%':                   { kcal: 50,  protein: 3.4,  fat: 2.0,  carbs: 4.8,  fiber: 0.0,  sugar: 4.8 },
  'Beurre':                    { kcal: 717, protein: 0.9,  fat: 81.1, carbs: 0.1,  fiber: 0.0,  sugar: 0.1 },
  'Crème 35%':                 { kcal: 345, protein: 2.1,  fat: 36.1, carbs: 2.8,  fiber: 0.0,  sugar: 2.8 },
  'Crème sure':                { kcal: 198, protein: 2.4,  fat: 19.4, carbs: 4.6,  fiber: 0.0,  sugar: 0.4 },
  'Yogourt grec nature':       { kcal: 97,  protein: 9.0,  fat: 5.0,  carbs: 3.6,  fiber: 0.0,  sugar: 3.6 },
  'Fromage cheddar':           { kcal: 403, protein: 25.0, fat: 33.1, carbs: 1.3,  fiber: 0.0,  sugar: 0.5 },
  'Fromage mozzarella':        { kcal: 280, protein: 28.1, fat: 17.1, carbs: 3.1,  fiber: 0.0,  sugar: 1.0 },
  'Fromage parmesan':          { kcal: 431, protein: 38.5, fat: 28.6, carbs: 4.1,  fiber: 0.0,  sugar: 0.9 },
  'Fromage ricotta':           { kcal: 174, protein: 11.3, fat: 13.0, carbs: 3.0,  fiber: 0.0,  sugar: 0.3 },
  'Fromage feta':              { kcal: 264, protein: 14.2, fat: 21.3, carbs: 4.1,  fiber: 0.0,  sugar: 4.1 },
  'Fromage à la crème':        { kcal: 342, protein: 6.2,  fat: 34.0, carbs: 2.7,  fiber: 0.0,  sugar: 2.7 },
  'Oeuf':                      { kcal: 143, protein: 12.6, fat: 9.5,  carbs: 0.7,  fiber: 0.0,  sugar: 0.4 },
  // Oils & condiments
  'Huile d\'olive':            { kcal: 884, protein: 0.0,  fat: 100,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Huile végétale':            { kcal: 884, protein: 0.0,  fat: 100,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Sauce soja':                { kcal: 53,  protein: 8.1,  fat: 0.6,  carbs: 4.9,  fiber: 0.8,  sugar: 1.7 },
  'Vinaigre blanc':            { kcal: 18,  protein: 0.0,  fat: 0.0,  carbs: 0.6,  fiber: 0.0,  sugar: 0.6 },
  'Vinaigre de riz':           { kcal: 18,  protein: 0.0,  fat: 0.0,  carbs: 1.3,  fiber: 0.0,  sugar: 0.5 },
  'Vinaigre de cidre':         { kcal: 21,  protein: 0.0,  fat: 0.0,  carbs: 0.9,  fiber: 0.0,  sugar: 0.4 },
  'Miel':                      { kcal: 304, protein: 0.3,  fat: 0.0,  carbs: 82.4, fiber: 0.2,  sugar: 82.1 },
  'Sirop d\'érable':           { kcal: 260, protein: 0.0,  fat: 0.1,  carbs: 67.0, fiber: 0.0,  sugar: 60.5 },
  'Sirop de maïs':             { kcal: 282, protein: 0.0,  fat: 0.2,  carbs: 76.8, fiber: 0.0,  sugar: 43.8 },
  'Moutarde de Dijon':         { kcal: 66,  protein: 3.6,  fat: 3.3,  carbs: 5.9,  fiber: 3.7,  sugar: 2.0 },
  'Tahini':                    { kcal: 595, protein: 17.0, fat: 53.8, carbs: 21.2, fiber: 9.3,  sugar: 0.5 },
  // Proteins
  'Poulet entier':             { kcal: 239, protein: 27.3, fat: 13.6, carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Poitrine de poulet':        { kcal: 165, protein: 31.0, fat: 3.6,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Hauts de cuisse de poulet': { kcal: 209, protein: 26.0, fat: 10.9, carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Boeuf haché':               { kcal: 254, protein: 17.2, fat: 20.0, carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Côtelettes de porc':        { kcal: 231, protein: 25.7, fat: 13.9, carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Saumon':                    { kcal: 208, protein: 20.4, fat: 13.4, carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Thon en conserve':          { kcal: 128, protein: 29.1, fat: 1.0,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Crevettes':                 { kcal: 106, protein: 20.3, fat: 1.7,  carbs: 0.9,  fiber: 0.0,  sugar: 0.0 },
  'Tofu ferme':                { kcal: 76,  protein: 8.1,  fat: 4.2,  carbs: 1.9,  fiber: 0.3,  sugar: 0.6 },
  'Bacon':                     { kcal: 541, protein: 37.0, fat: 42.0, carbs: 1.4,  fiber: 0.0,  sugar: 0.0 },
  'Saucisse italienne':        { kcal: 344, protein: 19.1, fat: 29.2, carbs: 2.3,  fiber: 0.0,  sugar: 0.6 },
  // Legumes
  'Haricots noirs':            { kcal: 132, protein: 8.9,  fat: 0.5,  carbs: 23.7, fiber: 8.7,  sugar: 0.3 },
  'Pois chiches':              { kcal: 164, protein: 8.9,  fat: 2.6,  carbs: 27.4, fiber: 7.6,  sugar: 4.8 },
  'Lentilles':                 { kcal: 116, protein: 9.0,  fat: 0.4,  carbs: 20.1, fiber: 7.9,  sugar: 1.8 },
  'Haricots rouges':           { kcal: 127, protein: 8.7,  fat: 0.5,  carbs: 22.8, fiber: 6.4,  sugar: 0.3 },
  // Grains
  'Riz blanc':                 { kcal: 130, protein: 2.7,  fat: 0.3,  carbs: 28.2, fiber: 0.4,  sugar: 0.1 },
  'Riz brun':                  { kcal: 111, protein: 2.6,  fat: 0.9,  carbs: 22.8, fiber: 1.8,  sugar: 0.4 },
  'Pâtes alimentaires':        { kcal: 157, protein: 5.8,  fat: 0.9,  carbs: 30.9, fiber: 1.8,  sugar: 0.6 },
  'Quinoa cuit':               { kcal: 120, protein: 4.4,  fat: 1.9,  carbs: 21.3, fiber: 2.8,  sugar: 0.9 },
  'Flocons d\'avoine':         { kcal: 389, protein: 16.9, fat: 6.9,  carbs: 66.3, fiber: 10.6, sugar: 0.0 },
  'Couscous':                  { kcal: 112, protein: 3.8,  fat: 0.2,  carbs: 23.2, fiber: 1.4,  sugar: 0.1 },
  'Pain tranché':              { kcal: 265, protein: 9.0,  fat: 3.3,  carbs: 49.2, fiber: 2.7,  sugar: 5.7 },
  // Vegetables
  'Tomates':                   { kcal: 18,  protein: 0.9,  fat: 0.2,  carbs: 3.9,  fiber: 1.2,  sugar: 2.6 },
  'Tomates en conserve':       { kcal: 32,  protein: 1.6,  fat: 0.3,  carbs: 6.3,  fiber: 2.0,  sugar: 4.0 },
  'Oignons':                   { kcal: 40,  protein: 1.1,  fat: 0.1,  carbs: 9.3,  fiber: 1.7,  sugar: 4.2 },
  'Ail':                       { kcal: 149, protein: 6.4,  fat: 0.5,  carbs: 33.1, fiber: 2.1,  sugar: 1.0 },
  'Échalotes':                 { kcal: 72,  protein: 2.5,  fat: 0.1,  carbs: 16.8, fiber: 3.2,  sugar: 7.9 },
  'Poivrons':                  { kcal: 31,  protein: 1.0,  fat: 0.3,  carbs: 6.0,  fiber: 2.1,  sugar: 4.2 },
  'Carottes':                  { kcal: 41,  protein: 0.9,  fat: 0.2,  carbs: 9.6,  fiber: 2.8,  sugar: 4.7 },
  'Brocoli':                   { kcal: 34,  protein: 2.8,  fat: 0.4,  carbs: 6.6,  fiber: 2.6,  sugar: 1.7 },
  'Épinards':                  { kcal: 23,  protein: 2.9,  fat: 0.4,  carbs: 3.6,  fiber: 2.2,  sugar: 0.4 },
  'Champignons':               { kcal: 22,  protein: 3.1,  fat: 0.3,  carbs: 3.3,  fiber: 1.0,  sugar: 2.0 },
  'Pommes de terre':           { kcal: 77,  protein: 2.0,  fat: 0.1,  carbs: 17.5, fiber: 2.2,  sugar: 0.8 },
  'Patates douces':            { kcal: 86,  protein: 1.6,  fat: 0.1,  carbs: 20.1, fiber: 3.0,  sugar: 4.2 },
  'Courgettes':                { kcal: 17,  protein: 1.2,  fat: 0.3,  carbs: 3.1,  fiber: 1.0,  sugar: 2.5 },
  'Aubergines':                { kcal: 25,  protein: 1.0,  fat: 0.2,  carbs: 5.9,  fiber: 3.0,  sugar: 3.5 },
  'Concombres':                { kcal: 15,  protein: 0.6,  fat: 0.1,  carbs: 3.6,  fiber: 0.5,  sugar: 1.7 },
  'Céleri':                    { kcal: 16,  protein: 0.7,  fat: 0.2,  carbs: 3.0,  fiber: 1.6,  sugar: 1.3 },
  'Asperges':                  { kcal: 20,  protein: 2.2,  fat: 0.1,  carbs: 3.9,  fiber: 2.1,  sugar: 1.9 },
  'Avocat':                    { kcal: 160, protein: 2.0,  fat: 14.7, carbs: 8.5,  fiber: 6.7,  sugar: 0.7 },
  'Piment jalapeño':           { kcal: 29,  protein: 0.9,  fat: 0.4,  carbs: 6.5,  fiber: 2.8,  sugar: 4.1 },
  'Maïs':                      { kcal: 86,  protein: 3.3,  fat: 1.4,  carbs: 19.0, fiber: 2.7,  sugar: 3.2 },
  'Laitue romaine':            { kcal: 17,  protein: 1.2,  fat: 0.3,  carbs: 3.3,  fiber: 2.1,  sugar: 1.2 },
  // Fruits
  'Citrons':                   { kcal: 29,  protein: 1.1,  fat: 0.3,  carbs: 9.3,  fiber: 2.8,  sugar: 2.5 },
  'Jus de lime':               { kcal: 25,  protein: 0.4,  fat: 0.1,  carbs: 8.4,  fiber: 0.4,  sugar: 1.7 },
  'Oranges':                   { kcal: 47,  protein: 0.9,  fat: 0.1,  carbs: 11.8, fiber: 2.4,  sugar: 9.4 },
  'Pommes':                    { kcal: 52,  protein: 0.3,  fat: 0.2,  carbs: 13.8, fiber: 2.4,  sugar: 10.4 },
  'Bananes':                   { kcal: 89,  protein: 1.1,  fat: 0.3,  carbs: 22.8, fiber: 2.6,  sugar: 12.2 },
  'Fraises':                   { kcal: 32,  protein: 0.7,  fat: 0.3,  carbs: 7.7,  fiber: 2.0,  sugar: 4.9 },
  'Mangue':                    { kcal: 60,  protein: 0.8,  fat: 0.4,  carbs: 15.0, fiber: 1.6,  sugar: 13.7 },
  'Ananas':                    { kcal: 50,  protein: 0.5,  fat: 0.1,  carbs: 13.1, fiber: 1.4,  sugar: 9.9 },
  // Nuts & seeds
  'Amandes':                   { kcal: 579, protein: 21.2, fat: 49.9, carbs: 21.6, fiber: 12.5, sugar: 4.4 },
  'Noix de cajou':             { kcal: 553, protein: 18.2, fat: 43.9, carbs: 30.2, fiber: 3.3,  sugar: 5.9 },
  'Noix de Grenoble':          { kcal: 654, protein: 15.2, fat: 65.2, carbs: 13.7, fiber: 6.7,  sugar: 2.6 },
  'Beurre d\'arachide':        { kcal: 588, protein: 25.1, fat: 50.4, carbs: 20.0, fiber: 6.0,  sugar: 9.2 },
  'Graines de sésame':         { kcal: 573, protein: 17.7, fat: 49.7, carbs: 23.5, fiber: 11.8, sugar: 0.3 },
  'Graines de chia':           { kcal: 486, protein: 16.5, fat: 30.7, carbs: 42.1, fiber: 34.4, sugar: 0.0 },
  // Beverages / liquids
  'Bouillon de poulet':        { kcal: 10,  protein: 1.3,  fat: 0.2,  carbs: 0.8,  fiber: 0.0,  sugar: 0.3 },
  'Bouillon de légumes':       { kcal: 8,   protein: 0.1,  fat: 0.1,  carbs: 1.8,  fiber: 0.0,  sugar: 1.0 },
  'Lait de coco':              { kcal: 230, protein: 2.3,  fat: 23.8, carbs: 5.5,  fiber: 2.2,  sugar: 3.3 },
  'Café moulu':                { kcal: 2,   protein: 0.3,  fat: 0.0,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  // Misc
  'Pâte de tomate':            { kcal: 82,  protein: 4.3,  fat: 0.5,  carbs: 18.9, fiber: 4.2,  sugar: 12.2 },
  'Sauce tomate':              { kcal: 29,  protein: 1.5,  fat: 0.2,  carbs: 6.5,  fiber: 1.6,  sugar: 4.5 },
  'Noix de coco râpée':        { kcal: 354, protein: 3.3,  fat: 33.5, carbs: 15.2, fiber: 9.0,  sugar: 6.3 },
  'Gélatine':                  { kcal: 335, protein: 85.6, fat: 0.1,  carbs: 0.0,  fiber: 0.0,  sugar: 0.0 },
  'Levure de bière':           { kcal: 325, protein: 40.4, fat: 7.6,  carbs: 41.2, fiber: 26.9, sugar: 0.0 },
};

export function getMacros(productName: string): Macros | null {
  return NUTRITION_DB[productName] ?? null;
}

// Unit conversion to grams (best-effort for macros)
const UNIT_TO_G: Record<string, number> = {
  'g': 1, 'kg': 1000,
  'ml': 1, 'l': 1000, 'L': 1000,
  'tasse': 240, 'cup': 240,
  'c. à s.': 15, 'tbsp': 15, 'cuillère à soupe': 15,
  'c. à t.': 5,  'tsp': 5,  'cuillère à thé': 5,
  'oz': 28.35, 'lb': 453.6,
  'unit': 100, 'pcs': 100, 'piece': 100,
};

export function computeIngredientMacros(
  productName: string,
  qty: number | null,
  unit: string | null,
): Macros | null {
  const base = getMacros(productName);
  if (!base || qty == null) return base; // return per-100g if no qty

  const factor = UNIT_TO_G[unit ?? 'g'] ?? 1;
  const grams = qty * factor;
  const scale = grams / 100;

  return {
    kcal:    Math.round(base.kcal    * scale),
    protein: Math.round(base.protein * scale * 10) / 10,
    fat:     Math.round(base.fat     * scale * 10) / 10,
    carbs:   Math.round(base.carbs   * scale * 10) / 10,
    fiber:   Math.round(base.fiber   * scale * 10) / 10,
    sugar:   Math.round(base.sugar   * scale * 10) / 10,
  };
}
