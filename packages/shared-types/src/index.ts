// ─── Enums ────────────────────────────────────────────────────────────────────

export type StoreChain = 'IGA' | 'Metro' | 'Maxi' | 'Walmart' | 'Costco';

export type UnitType = 'weight' | 'volume' | 'count';

export type PriceSource = 'scrape' | 'flyer' | 'manual';

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  gtin: string | null;
  defaultUnit: string; // g | ml | unit
  defaultUnitType: UnitType;
}

export interface StoreProduct {
  id: string;
  productId: string;
  storeId: string;
  sku: string | null;
  packageSize: number;
  packageUnit: string;
  lastSeenAt: string; // ISO date
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export interface Price {
  id: string;
  storeProductId: string;
  priceCents: number;
  currency: string;
  source: PriceSource;
  capturedAt: string; // ISO date
  validFrom: string | null;
  validTo: string | null;
}

export interface PriceWithStore {
  chain: StoreChain;
  storeName: string;
  priceCents: number;        // cost for the portion used in recipe
  packagePriceCents: number; // full package price
  packageSize: number;
  packageUnit: string;
  pricePerUnit: number; // cents per base unit (g or ml)
  capturedAt: string;
  isPromo: boolean;
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export interface Recipe {
  id: string;
  sourceUrl: string | null;
  title: string;
  servings: number;
  imageUrl: string | null;
  instructions: string[];
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
}

export interface Ingredient {
  id: string;
  recipeId: string;
  rawText: string;
  parsedQuantity: number | null;
  parsedUnit: string | null;
  productId: string | null;
  notes: string | null;
}

export interface IngredientWithCost extends Ingredient {
  product: Product | null;
  costByStore: PriceWithStore[];
  cheapestCostCents: number | null;
  cheapestStore: StoreChain | null;
}

export interface RecipeWithCost extends Recipe {
  ingredients: IngredientWithCost[];
  totalCostByStore: Record<StoreChain, number>; // cents
  cheapestStore: StoreChain | null;
  cheapestTotalCents: number | null;
  costPerServingCents: number | null;
}

// ─── Flyers ───────────────────────────────────────────────────────────────────

export interface FlyerItem {
  id: string;
  storeId: string;
  productId: string | null;
  productName: string | null; // matched canonical product name
  category: string | null;    // product category (Viandes, Produits laitiers...)
  rawText: string;
  promoPriceCents: number;
  regularPriceCents: number | null;
  weekOf: string; // ISO date (Monday of the week)
  chain: StoreChain;
}

// ─── Unit Conversion ──────────────────────────────────────────────────────────

export interface UnitConversion {
  fromUnit: string;
  toUnit: string;
  productId: string | null; // null = universal, set = product-specific (density)
  factor: number;
}

// ─── API DTOs ─────────────────────────────────────────────────────────────────

export interface ParseRecipeRequest {
  url: string;
}

export interface ParseRecipeResponse {
  recipe: RecipeWithCost;
  matchConfidence: Record<string, number>; // ingredientId → 0-1
  warnings: string[];
}

export interface SearchProductsRequest {
  q: string;
  category?: string;
  limit?: number;
}

export interface SearchProductsResponse {
  products: Product[];
  total: number;
}

export interface GetPricesResponse {
  product: Product;
  prices: PriceWithStore[];
  cheapestChain: StoreChain | null;
}

export interface GetFlyersResponse {
  weekOf: string;
  items: FlyerItem[];
}

export interface RecipesByPromosRequest {
  weekOf?: string; // defaults to current week
  chains?: StoreChain[];
  maxRecipes?: number;
}

export interface RecipesByPromosResponse {
  weekOf: string;
  recipes: Array<{
    recipe: RecipeWithCost;
    promoIngredients: string[]; // ingredient ids on promo this week
    savings: number; // cents saved vs regular price
  }>;
}
