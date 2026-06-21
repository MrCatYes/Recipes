import type {
  GetPricesResponse,
  ParseRecipeResponse,
  GetFlyersResponse,
  RecipesByPromosResponse,
  RecipeWithCost,
  GetRecipesResponse,
  AuthResponse,
  User,
  NearbyStoresResponse,
} from '@epicerie/shared-types';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Auth token store (set by auth-context) ───────────────────────────────────

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onTokensRefreshed: ((access: string, refresh: string) => void) | null = null;
let onAuthLost: (() => void) | null = null;

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
}

export function setAuthCallbacks(cb: {
  onTokensRefreshed: (access: string, refresh: string) => void;
  onAuthLost: () => void;
}) {
  onTokensRefreshed = cb.onTokensRefreshed;
  onAuthLost = cb.onAuthLost;
}

async function rawFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await rawFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, 15_000);
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    onTokensRefreshed?.(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  try {
    let res = await rawFetch(path, init, timeoutMs);

    // Auto-refresh once on 401 (skip the auth endpoints themselves)
    if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
      if (await tryRefresh()) {
        res = await rawFetch(path, init, timeoutMs);
      } else {
        onAuthLost?.();
      }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = body || `HTTP ${res.status}`;
      try { msg = JSON.parse(body).message ?? msg; } catch { /* keep */ }
      throw new ApiError(res.status, msg);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Délai dépassé — le serveur met trop de temps à répondre.');
    }
    throw e;
  }
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export function register(email: string, password: string, displayName?: string) {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function login(email: string, password: string) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logoutApi(token: string) {
  return apiFetch<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: token }) });
}

export function getMe() {
  return apiFetch<User>('/auth/me');
}

export function updateMe(patch: Partial<Pick<User, 'displayName' | 'latitude' | 'longitude' | 'postalCode'>>) {
  return apiFetch<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
}

// ─── Stores / geoloc ─────────────────────────────────────────────────────────

export function getNearbyStores(lat: number, lng: number, radiusKm = 10, chains?: string[]) {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radiusKm) });
  if (chains?.length) q.set('chains', chains.join(','));
  return apiFetch<NearbyStoresResponse>(`/stores/nearby?${q.toString()}`);
}

// ─── Recipes / products / flyers ───────────────────────────────────────────────

export function parseRecipe(url: string) {
  return apiFetch<ParseRecipeResponse>('/recipes/parse', { method: 'POST', body: JSON.stringify({ url }) }, 90_000);
}

export function getProductPrices(q: string) {
  return apiFetch<GetPricesResponse>(`/products/prices?q=${encodeURIComponent(q)}`);
}

export function getFlyers(chains?: string[]) {
  const qs = chains?.length ? `?chains=${chains.join(',')}` : '';
  return apiFetch<GetFlyersResponse>(`/flyers${qs}`);
}

export function getRecipesByPromos(chains?: string[]) {
  const qs = chains?.length ? `?chains=${chains.join(',')}` : '';
  return apiFetch<RecipesByPromosResponse>(`/recipes/by-promos${qs}`);
}

export function getRecipeCost(id: string) {
  return apiFetch<RecipeWithCost>(`/recipes/${id}/cost`);
}

export function getRecipes(opts: { category?: string; difficulty?: string; chains?: string[]; sort?: string } = {}) {
  const q = new URLSearchParams();
  if (opts.category) q.set('category', opts.category);
  if (opts.difficulty) q.set('difficulty', opts.difficulty);
  if (opts.chains?.length) q.set('chains', opts.chains.join(','));
  if (opts.sort) q.set('sort', opts.sort);
  const qs = q.toString();
  return apiFetch<GetRecipesResponse>(`/recipes${qs ? `?${qs}` : ''}`);
}
