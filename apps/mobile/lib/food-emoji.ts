const EMOJI_MAP: Array<[RegExp, string]> = [
  // Proteins
  [/\b(poulet|chicken|volaille)\b/i, '🍗'],
  [/\b(boeuf|beef|steak|bifteck|viande hach)/i, '🥩'],
  [/\b(porc|pork|bacon|lard|pancetta|jambon)\b/i, '🥓'],
  [/\b(saumon|salmon)\b/i, '🐟'],
  [/\b(crevette|shrimp|prawn)\b/i, '🦐'],
  [/\b(thon|tuna)\b/i, '🐠'],
  [/\b(oeuf|œuf|egg)\b/i, '🥚'],
  [/\b(tofu)\b/i, '🟨'],
  [/\b(crevette|fruits de mer|seafood)\b/i, '🦑'],

  // Dairy
  [/\b(lait|milk)\b/i, '🥛'],
  [/\b(beurre|butter)\b/i, '🧈'],
  [/\b(fromage|cheese|parmesan|cheddar|mozzarella|ricotta|feta)\b/i, '🧀'],
  [/\b(crème|cream|crème sure|sour cream)\b/i, '🫙'],
  [/\b(yogourt|yogurt)\b/i, '🥛'],

  // Vegetables
  [/\b(tomate|tomato)\b/i, '🍅'],
  [/\b(ail|garlic)\b/i, '🧄'],
  [/\b(oignon|onion|échalote|shallot)\b/i, '🧅'],
  [/\b(poivron|pepper|capsicum)\b/i, '🫑'],
  [/\b(carotte|carrot)\b/i, '🥕'],
  [/\b(brocoli|broccoli)\b/i, '🥦'],
  [/\b(épinard|spinach)\b/i, '🥬'],
  [/\b(laitue|lettuce|salade)\b/i, '🥬'],
  [/\b(maïs|corn)\b/i, '🌽'],
  [/\b(pomme de terre|potato|patate)\b/i, '🥔'],
  [/\b(piment|chili|chile)\b/i, '🌶️'],
  [/\b(champignon|mushroom)\b/i, '🍄'],
  [/\b(concombre|cucumber)\b/i, '🥒'],
  [/\b(courgette|zucchini)\b/i, '🥒'],
  [/\b(aubergine|eggplant)\b/i, '🍆'],
  [/\b(asperge|asparagus)\b/i, '🌿'],
  [/\b(céleri|celery)\b/i, '🌿'],
  [/\b(avocat|avocado)\b/i, '🥑'],
  [/\b(patate douce|sweet potato)\b/i, '🍠'],

  // Fruits
  [/\b(citron|lemon)\b/i, '🍋'],
  [/\b(lime)\b/i, '🍋'],
  [/\b(orange)\b/i, '🍊'],
  [/\b(pomme|apple)\b/i, '🍎'],
  [/\b(banane|banana)\b/i, '🍌'],
  [/\b(fraise|strawberry)\b/i, '🍓'],
  [/\b(framboise|raspberry)\b/i, '🍓'],
  [/\b(mangue|mango)\b/i, '🥭'],
  [/\b(ananas|pineapple)\b/i, '🍍'],
  [/\b(raisin|grape)\b/i, '🍇'],

  // Grains & pasta
  [/\b(riz|rice)\b/i, '🍚'],
  [/\b(pâtes|pasta|spaghetti|penne|linguine|fusilli|fettuccine)\b/i, '🍝'],
  [/\b(pain|bread|baguette)\b/i, '🍞'],
  [/\b(farine|flour)\b/i, '🌾'],
  [/\b(avoine|oat|gruau)\b/i, '🌾'],
  [/\b(quinoa)\b/i, '🌾'],
  [/\b(couscous)\b/i, '🌾'],

  // Legumes
  [/\b(haricot|bean|lentille|lentil|pois chiche|chickpea)\b/i, '🫘'],

  // Nuts & seeds
  [/\b(amande|almond)\b/i, '🥜'],
  [/\b(noix|walnut|pecan|cashew|noisette)\b/i, '🥜'],
  [/\b(arachide|peanut|beurre d.arachide)\b/i, '🥜'],
  [/\b(sésame|sesame)\b/i, '🌱'],

  // Condiments & oils
  [/\b(huile|oil)\b/i, '🫒'],
  [/\b(vinaigre|vinegar)\b/i, '🧴'],
  [/\b(sauce soja|soy sauce|tamari)\b/i, '🫙'],
  [/\b(miel|honey)\b/i, '🍯'],
  [/\b(ketchup|mayonnaise|moutarde|mustard)\b/i, '🧃'],
  [/\b(tahini)\b/i, '🫙'],

  // Herbs & spices
  [/\b(sel|salt)\b/i, '🧂'],
  [/\b(poivre|pepper noir|black pepper)\b/i, '🌶️'],
  [/\b(cannelle|cinnamon|cumin|curcuma|turmeric|paprika|origan|oregano|thym|thyme|basilic|basil|persil|parsley|coriandre|cilantro|gingembre|ginger)\b/i, '🌿'],
  [/\b(vanille|vanilla)\b/i, '🌿'],

  // Baking
  [/\b(sucre|sugar)\b/i, '🍬'],
  [/\b(chocolat|chocolate)\b/i, '🍫'],
  [/\b(cacao|cocoa)\b/i, '🍫'],
  [/\b(levure|yeast|poudre à pâte|baking powder|baking soda)\b/i, '🧪'],
  [/\b(sirop d.érable|maple syrup)\b/i, '🍁'],
  [/\b(sirop de maïs|corn syrup)\b/i, '🫙'],

  // Beverages
  [/\b(café|coffee)\b/i, '☕'],
  [/\b(thé|tea)\b/i, '🍵'],
  [/\b(bouillon|broth|stock)\b/i, '🍲'],
  [/\b(vin|wine)\b/i, '🍷'],
  [/\b(bière|beer)\b/i, '🍺'],

  // Misc
  [/\b(noix de coco|coconut)\b/i, '🥥'],
  [/\b(tomate en conserve|tomato paste|coulis de tomate)\b/i, '🥫'],
];

export function getFoodEmoji(text: string): string {
  for (const [re, emoji] of EMOJI_MAP) {
    if (re.test(text)) return emoji;
  }
  return '🥄';
}
