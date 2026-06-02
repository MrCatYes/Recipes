/**
 * Shared product matcher.
 * Maps a scraped/flyer product name → our canonical DB product via keyword rules.
 * Strict: rejects wrong-category items (jus de tomate ≠ tomates en dés, porc ≠ boeuf).
 */

import { CATALOG } from '../data/catalog';

export interface MatchRule {
  mustInclude: string[];
  mustExclude: string[];
}

// Derived from the canonical catalog (single source of truth)
export const MATCH_RULES: Record<string, MatchRule> = Object.fromEntries(
  CATALOG.map((p) => [p.name, { mustInclude: p.include, mustExclude: p.exclude }]),
);

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
