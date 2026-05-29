import { describe, it, expect } from 'vitest';
import { parseIngredientRegex, normalizeUnit } from '../ingredient-matcher.service';

// ─── normalizeUnit ────────────────────────────────────────────────────────────

describe('normalizeUnit', () => {
  it('tasses → tasse', () => expect(normalizeUnit('tasses')).toBe('tasse'));
  it('cuillère à soupe → c. à s.', () => expect(normalizeUnit('cuillère à soupe')).toBe('c. à s.'));
  it('cuillères à thé → c. à t.', () => expect(normalizeUnit('cuillères à thé')).toBe('c. à t.'));
  it('c.à.s. → c. à s.', () => expect(normalizeUnit('c.à.s.')).toBe('c. à s.'));
  it('l (lowercase) → L', () => expect(normalizeUnit('l')).toBe('L'));
  it('livre → lb', () => expect(normalizeUnit('livre')).toBe('lb'));
  it('onces → oz', () => expect(normalizeUnit('onces')).toBe('oz'));
  it('unités → unit', () => expect(normalizeUnit('unités')).toBe('unit'));
  it('kg passthrough', () => expect(normalizeUnit('kg')).toBe('kg'));
  it('g passthrough', () => expect(normalizeUnit('g')).toBe('g'));
});

// ─── parseIngredientRegex ─────────────────────────────────────────────────────

describe('parseIngredientRegex — volume', () => {
  it('250 ml de lait 3,25%', () => {
    const r = parseIngredientRegex('250 ml de lait 3,25%');
    expect(r.quantity).toBe(250);
    expect(r.unit).toBe('ml');
    expect(r.productName).toContain('lait');
  });

  it('1 L de bouillon de poulet', () => {
    const r = parseIngredientRegex('1 L de bouillon de poulet');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe('L');
    expect(r.productName).toContain('bouillon');
  });

  it('2 tasses de farine tout usage', () => {
    const r = parseIngredientRegex('2 tasses de farine tout usage');
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe('tasse');
    expect(r.productName).toContain('farine');
  });

  it('2 c. à s. d\'huile d\'olive', () => {
    const r = parseIngredientRegex("2 c. à s. d'huile d'olive");
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe('c. à s.');
    expect(r.productName).toContain('huile');
  });

  it('1 c. à t. de vanille', () => {
    const r = parseIngredientRegex('1 c. à t. de vanille');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe('c. à t.');
    expect(r.productName).toContain('vanille');
  });
});

describe('parseIngredientRegex — weight', () => {
  it('500 g de boeuf haché', () => {
    const r = parseIngredientRegex('500 g de boeuf haché');
    expect(r.quantity).toBe(500);
    expect(r.unit).toBe('g');
    expect(r.productName).toContain('boeuf');
  });

  it('1 kg de poulet', () => {
    const r = parseIngredientRegex('1 kg de poulet');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe('kg');
    expect(r.productName).toContain('poulet');
  });

  it('1 lb de porc', () => {
    const r = parseIngredientRegex('1 lb de porc');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe('lb');
  });
});

describe('parseIngredientRegex — fractions', () => {
  it('½ tasse de beurre', () => {
    const r = parseIngredientRegex('½ tasse de beurre');
    expect(r.quantity).toBeCloseTo(0.5);
    expect(r.unit).toBe('tasse');
    expect(r.productName).toContain('beurre');
  });

  it('¼ tasse de sucre', () => {
    const r = parseIngredientRegex('¼ tasse de sucre');
    expect(r.quantity).toBeCloseTo(0.25);
    expect(r.unit).toBe('tasse');
  });

  it('1/3 tasse de crème sure', () => {
    const r = parseIngredientRegex('1/3 tasse de crème sure');
    expect(r.quantity).toBeCloseTo(1 / 3, 2);
    expect(r.unit).toBe('tasse');
  });

  it('2/3 tasse de flocons', () => {
    const r = parseIngredientRegex('2/3 tasse de flocons d\'avoine');
    expect(r.quantity).toBeCloseTo(2 / 3, 2);
  });
});

describe('parseIngredientRegex — count / no unit', () => {
  it('1 oignon moyen', () => {
    const r = parseIngredientRegex('1 oignon moyen');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBeNull();
    expect(r.productName).toContain('oignon');
  });

  it('3 gousses d\'ail, hachées', () => {
    const r = parseIngredientRegex("3 gousses d'ail, hachées");
    expect(r.quantity).toBe(3);
    expect(r.notes).toBe('hachées');
  });

  it('2 oeufs', () => {
    const r = parseIngredientRegex('2 oeufs');
    expect(r.quantity).toBe(2);
    expect(r.unit).toBeNull();
  });
});

describe('parseIngredientRegex — no quantity', () => {
  it('sel et poivre au goût', () => {
    const r = parseIngredientRegex('sel et poivre au goût');
    expect(r.quantity).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.productName).toBeTruthy();
  });
});

describe('parseIngredientRegex — notes after comma', () => {
  it('500 g de boeuf haché, assaisonné', () => {
    const r = parseIngredientRegex('500 g de boeuf haché, assaisonné');
    expect(r.quantity).toBe(500);
    expect(r.unit).toBe('g');
    expect(r.notes).toBe('assaisonné');
  });

  it('2 carottes, pelées et tranchées', () => {
    const r = parseIngredientRegex('2 carottes, pelées et tranchées');
    expect(r.quantity).toBe(2);
    expect(r.notes).toBe('pelées et tranchées');
  });
});
