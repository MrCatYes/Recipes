import { describe, it, expect } from 'vitest';
import { matchesProduct, ruleMatch, normalize } from '../product-matcher';
import { CATALOG } from '../../data/catalog';

const dbProducts = CATALOG.map((p, i) => ({ id: String(i), name: p.name }));

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Crème ÉPAISSE')).toBe('creme epaisse');
    expect(normalize("Pâté")).toBe('pate');
  });
});

describe('matchesProduct — accepts real flyer names', () => {
  const accept: Array<[string, string]> = [
    ['FARINE ROBIN HOOD OU FIVE ROSES | FLOUR, 2/2,5 KG', 'Farine tout-usage'],
    ['SUCRE GRANULÉ LANTIC, 2 kg', 'Sucre blanc'],
    ['beurre Selection | Selection butter', 'Beurre non salé'],
    ['LAIT HOMOGÉNÉISÉ 3,25 % NATREL', 'Lait 3,25%'],
    ['oeufs blancs Selection | Selection white eggs', 'Oeufs gros'],
    ['HUILE DE CANOLA COMPLIMENTS', 'Huile canola'],
    ["HUILE D'OLIVE EXTRA VIERGE GALLO", "Huile d'olive extra vierge"],
    ['pâtes alimentaires Barilla', 'Pâtes spaghetti'],
    ['poitrines de poulet frais désossées', 'Poitrine de poulet'],
    ['BOEUF HACHÉ MI-MAIGRE | MEDIUM GROUND BEEF', 'Boeuf haché maigre'],
    ['porc haché extra-maigre | extra lean ground pork', 'Porc haché'],
    ['BACON SELECTION | SELECTION BACON', 'Bacon'],
    ['oignons jaunes | yellow onions', 'Oignon jaune'],
  ];

  it.each(accept)('%s → %s', (raw, dbName) => {
    expect(matchesProduct(raw, dbName)).toBe(true);
  });
});

describe('matchesProduct — rejects wrong-category names', () => {
  const reject: Array<[string, string]> = [
    // seen as false positives during scraping
    ['JUS DE TOMATE SELECTION', 'Tomates en dés'],
    ['TOMATES ROUGES DE SERRE', 'Tomates en dés'],
    ['TOAST À L\'AIL FURLANI | GARLIC TOAST', 'Ail'],
    ['GROSSES CREVETTES AIL ET FINES HERBES', 'Ail'],
    ['PORC HACHÉ MAIGRE', 'Boeuf haché maigre'],
    ['ESCALOPES DE POITRINES DE POULET FARCIES ET PANÉES', 'Poitrine de poulet'],
    ['LAIT AU CHOCOLAT QUÉBON', 'Lait 3,25%'],
    ['LAIT SANS LACTOSE NATREL', 'Lait 3,25%'],
    ['CRÈME SURE SELECTION', 'Crème 35%'],
    ['CRÈME À CAFÉ 10 %', 'Crème 35%'],
    ['CASSONADE DORÉE LANTIC', 'Sucre blanc'],
    ['FARINE DE BLÉ ENTIER ROBIN HOOD', 'Farine tout-usage'],
    ['BEURRE D\'ARACHIDE KRAFT', 'Beurre non salé'],
    ['SEL DE MER FLEUR DE SEL', 'Sel'],
  ];

  it.each(reject)('%s ✗ %s', (raw, dbName) => {
    expect(matchesProduct(raw, dbName)).toBe(false);
  });
});

describe('ruleMatch', () => {
  it('returns the matching catalog product', () => {
    const m = ruleMatch('SUCRE GRANULÉ LANTIC, 2 kg', dbProducts);
    expect(m?.name).toBe('Sucre blanc');
  });

  it('returns null for an unmatched item', () => {
    expect(ruleMatch('PAPIER HYGIÉNIQUE CHARMIN', dbProducts)).toBeNull();
  });

  it('does not match boeuf rule to ground pork', () => {
    const m = ruleMatch('PORC HACHÉ MAIGRE', dbProducts);
    expect(m?.name).not.toBe('Boeuf haché maigre');
  });
});

describe('catalog integrity', () => {
  it('every product has unique name', () => {
    const names = CATALOG.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every product has at least one include keyword and one query', () => {
    for (const p of CATALOG) {
      expect(p.include.length, p.name).toBeGreaterThan(0);
      expect(p.queries.length, p.name).toBeGreaterThan(0);
    }
  });

  it('baseline package size is plausible (>1 for weight/volume)', () => {
    for (const p of CATALOG) {
      if (p.defaultUnitType !== 'count') {
        expect(p.pkg.size, p.name).toBeGreaterThan(1);
      }
    }
  });
});
