// ─── Users & Auth ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  latitude: number | null;
  longitude: number | null;
  postalCode: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

// ─── Stores / Geolocation ─────────────────────────────────────────────────────

export interface NearbyStore {
  id: string;
  chain: StoreChain;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface NearbyStoresResponse {
  stores: NearbyStore[];
}

// ─── Shopping Lists (P2) ──────────────────────────────────────────────────────

export interface ShoppingListItem {
  id: string;
  listId: string;
  productId: string | null;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  recipeId: string | null;
  sortOrder: number;
}

export interface ShoppingListItemWithCost extends ShoppingListItem {
  cheapestCostCents: number | null;
  cheapestStore: StoreChain | null;
}

/** List summary for the index screen. */
export interface ShoppingListSummary {
  id: string;
  name: string;
  itemCount: number;
  checkedCount: number;
  updatedAt: string;
}

export interface ShoppingListWithCost {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: ShoppingListItemWithCost[];
  // Per-store total of the items each store carries (shop-all-at-one-store).
  totalCostByStore: Partial<Record<StoreChain, number>>;
  cheapestStore: StoreChain | null;       // best single store
  cheapestTotalCents: number | null;      // that store's basket total
  // Theoretical minimum if you split across stores (sum of per-item cheapest).
  estimatedTotalCents: number | null;
  itemCount: number;
  checkedCount: number;
}

export interface AddListItemRequest {
  rawText: string;
  productId?: string;
  quantity?: number;
  unit?: string;
  category?: string;
}

// ─── Meal Planning + Budget (P2) ──────────────────────────────────────────────

export interface MealPlanEntry {
  id: string;
  planId: string;
  recipeId: string;
  servings: number;
  dayOfWeek: number | null; // 0=Mon .. 6=Sun
  sortOrder: number;
}

export interface MealPlanEntryWithCost extends MealPlanEntry {
  recipe: {
    id: string;
    title: string;
    imageUrl: string | null;
    category: string | null;
    difficulty: RecipeDifficulty | null;
    baseServings: number;
  };
  costCents: number | null;        // cheapest, scaled to entry.servings
  cheapestStore: StoreChain | null;
}

export interface MealPlanSummary {
  id: string;
  name: string;
  weekOf: string | null;
  budgetCents: number | null;
  recipeCount: number;
  updatedAt: string;
}

export interface MealPlanBudget {
  targetCents: number;
  spentCents: number;        // cheapest single-store basket
  remainingCents: number;    // target - spent (negative = over)
  overBudget: boolean;
}

export interface MealPlanWithCost {
  id: string;
  name: string;
  weekOf: string | null;
  budgetCents: number | null;
  entries: MealPlanEntryWithCost[];
  totalCostByStore: Partial<Record<StoreChain, number>>;
  cheapestStore: StoreChain | null;
  cheapestTotalCents: number | null;   // single best store
  estimatedTotalCents: number | null;  // split-shopping minimum
  budget: MealPlanBudget | null;
  recipeCount: number;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type StoreChain = 'IGA' | 'Metro' | 'Maxi' | 'Walmart' | 'Costco' | 'SuperC';

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

export type RecipeDifficulty = 'débutant' | 'confirmé' | 'expert';

export type DietaryTag = 'vegetarien' | 'vegetalien' | 'halal' | 'sans-gluten' | 'sans-lactose' | 'low-calories' | 'casher';

export interface Recipe {
  id: string;
  sourceUrl: string | null;
  title: string;
  category: string | null;
  difficulty: RecipeDifficulty | null;
  servings: number;
  imageUrl: string | null;
  description: string | null;
  dietaryTags: string[];
  instructions: string[];
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
}

export interface RecipeSummary {
  id: string;
  title: string;
  category: string | null;
  difficulty: RecipeDifficulty | null;
  imageUrl: string | null;
  servings: number;
  totalTimeMinutes: number | null;
  cheapestStore: StoreChain | null;
  cheapestTotalCents: number | null;
  promoIngredientCount: number;
  ingredientCount: number;
  matchedIngredientCount: number;
  dietaryTags: string[];
}

export interface GetRecipesResponse {
  recipes: RecipeSummary[];
  categories: string[];
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
  parsedQuantity: number | null;
  parsedUnit: string | null;
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
