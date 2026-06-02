import type {
  GetPricesResponse,
  ParseRecipeResponse,
  GetFlyersResponse,
  RecipesByPromosResponse,
} from '@epicerie/shared-types';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ApiError(res.status, body || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Délai dépassé — le serveur met trop de temps à répondre.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function parseRecipe(url: string) {
  // 90s: fetch URL + Claude ingredient matching can take 30-60s
  return apiFetch<ParseRecipeResponse>(
    '/recipes/parse',
    { method: 'POST', body: JSON.stringify({ url }) },
    90_000,
  );
}

export function getProductPrices(q: string) {
  return apiFetch<GetPricesResponse>(
    `/products/prices?q=${encodeURIComponent(q)}`,
  );
}

export function getFlyers(chains?: string[]) {
  const qs = chains?.length ? `?chains=${chains.join(',')}` : '';
  return apiFetch<GetFlyersResponse>(`/flyers${qs}`);
}

export function getRecipesByPromos(chains?: string[]) {
  const qs = chains?.length ? `?chains=${chains.join(',')}` : '';
  return apiFetch<RecipesByPromosResponse>(`/recipes/by-promos${qs}`);
}
