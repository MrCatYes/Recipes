import { describe, it, expect, beforeEach } from 'vitest';
import { ConversionService, type ConversionRecord } from '../conversion.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FLOUR_ID   = 'prod_farine';
const MILK_ID    = 'prod_lait';
const ONION_ID   = 'prod_oignon';
const BUTTER_ID  = 'prod_beurre';

const BASE_CONVERSIONS: ConversionRecord[] = [
  // Volume → ml
  { fromUnit: 'L',        toUnit: 'ml',   productId: null, factor: 1000 },
  { fromUnit: 'ml',       toUnit: 'L',    productId: null, factor: 0.001 },
  { fromUnit: 'tasse',    toUnit: 'ml',   productId: null, factor: 250 },
  { fromUnit: 'c. à s.',  toUnit: 'ml',   productId: null, factor: 15 },
  { fromUnit: 'c. à t.',  toUnit: 'ml',   productId: null, factor: 5 },
  { fromUnit: 'oz fl',    toUnit: 'ml',   productId: null, factor: 29.5735 },
  { fromUnit: 'pinte',    toUnit: 'ml',   productId: null, factor: 946.353 },
  // Weight → g
  { fromUnit: 'kg',       toUnit: 'g',    productId: null, factor: 1000 },
  { fromUnit: 'g',        toUnit: 'kg',   productId: null, factor: 0.001 },
  { fromUnit: 'lb',       toUnit: 'g',    productId: null, factor: 453.592 },
  { fromUnit: 'oz',       toUnit: 'g',    productId: null, factor: 28.3495 },
  // Density: farine (1 ml ≈ 0.528g, so 1 tasse = 132g but common QC recipe standard is 120g)
  { fromUnit: 'ml',       toUnit: 'g',    productId: FLOUR_ID, factor: 0.528 },
  { fromUnit: 'tasse',    toUnit: 'g',    productId: FLOUR_ID, factor: 132 },
  // Density: lait (≈ water, 1 ml = 1.03g — use 1 for simplicity)
  { fromUnit: 'ml',       toUnit: 'g',    productId: MILK_ID,  factor: 1.03 },
  // Density: beurre (1 tasse = 227g)
  { fromUnit: 'tasse',    toUnit: 'g',    productId: BUTTER_ID, factor: 227 },
  // Count conversions
  { fromUnit: 'unit',     toUnit: 'g',    productId: ONION_ID,  factor: 110 }, // 1 oignon moyen ≈ 110g
];

let svc: ConversionService;

beforeEach(() => {
  svc = new ConversionService(BASE_CONVERSIONS);
});

// ─── convert() ────────────────────────────────────────────────────────────────

describe('convert — same unit', () => {
  it('identity: 1 g → g = 1', () => {
    expect(svc.convert(1, 'g', 'g')).toBe(1);
  });
  it('identity: 3.5 tasse → tasse = 3.5', () => {
    expect(svc.convert(3.5, 'tasse', 'tasse')).toBe(3.5);
  });
});

describe('convert — weight', () => {
  it('1 kg → g', () => expect(svc.convert(1, 'kg', 'g')).toBe(1000));
  it('500 g → kg', () => expect(svc.convert(500, 'g', 'kg')).toBeCloseTo(0.5));
  it('1 lb → g', () => expect(svc.convert(1, 'lb', 'g')).toBeCloseTo(453.592));
  it('1 oz → g', () => expect(svc.convert(1, 'oz', 'g')).toBeCloseTo(28.3495));
  it('16 oz → g ≈ 1 lb', () => expect(svc.convert(16, 'oz', 'g')).toBeCloseTo(453.592));
});

describe('convert — volume', () => {
  it('1 L → ml', () => expect(svc.convert(1, 'L', 'ml')).toBe(1000));
  it('250 ml → L', () => expect(svc.convert(250, 'ml', 'L')).toBeCloseTo(0.25));
  it('1 tasse → ml', () => expect(svc.convert(1, 'tasse', 'ml')).toBe(250));
  it('2 tasses → ml', () => expect(svc.convert(2, 'tasse', 'ml')).toBe(500));
  it('1 c. à s. → ml', () => expect(svc.convert(1, 'c. à s.', 'ml')).toBe(15));
  it('1 c. à t. → ml', () => expect(svc.convert(1, 'c. à t.', 'ml')).toBe(5));
  it('3 c. à t. ≈ 1 c. à s.', () => expect(svc.convert(3, 'c. à t.', 'ml')).toBe(15));
  it('1 pinte → ml', () => expect(svc.convert(1, 'pinte', 'ml')).toBeCloseTo(946.353));
  it('1 oz fl → ml', () => expect(svc.convert(1, 'oz fl', 'ml')).toBeCloseTo(29.5735));
});

describe('convert — 2-step (via base)', () => {
  it('1 tasse → L (via ml)', () => expect(svc.convert(1, 'tasse', 'L')).toBeCloseTo(0.25));
  it('2.5 kg → lb (via g)', () => expect(svc.convert(2.5, 'kg', 'lb')).toBeCloseTo(5.512, 2));
});

describe('convert — cross-domain density', () => {
  it('1 tasse farine → g (product-specific)', () => {
    expect(svc.convert(1, 'tasse', 'g', FLOUR_ID)).toBe(132);
  });
  it('2 tasses farine → g', () => {
    expect(svc.convert(2, 'tasse', 'g', FLOUR_ID)).toBe(264);
  });
  it('1 ml farine → g', () => {
    expect(svc.convert(1, 'ml', 'g', FLOUR_ID)).toBeCloseTo(0.528);
  });
  it('1 tasse beurre → g', () => {
    expect(svc.convert(1, 'tasse', 'g', BUTTER_ID)).toBe(227);
  });
  it('tasse without productId falls back to generic (no density)', () => {
    // No density for generic tasse→g, should return null
    expect(svc.convert(1, 'tasse', 'g')).toBeNull();
  });
});

describe('convert — count/unit', () => {
  it('1 unit oignon → g', () => {
    expect(svc.convert(1, 'unit', 'g', ONION_ID)).toBe(110);
  });
  it('3 oignons → g', () => {
    expect(svc.convert(3, 'unit', 'g', ONION_ID)).toBe(330);
  });
});

describe('convert — no path', () => {
  it('tasse → g without product = null', () => {
    expect(svc.convert(1, 'tasse', 'g')).toBeNull();
  });
  it('unknown unit = null', () => {
    expect(svc.convert(1, 'cuillère magique', 'g')).toBeNull();
  });
});

// ─── costForPortion() ─────────────────────────────────────────────────────────

describe('costForPortion — same domain weight', () => {
  it('500g of a 1kg bag at 400¢', () => {
    // 500/1000 * 400 = 200¢
    expect(svc.costForPortion(500, 'g', 1, 'kg', 400)).toBe(200);
  });

  it('1 lb from a 2kg bag at 600¢', () => {
    // 453.592g / 2000g * 600 ≈ 136¢
    const cost = svc.costForPortion(1, 'lb', 2, 'kg', 600);
    expect(cost).toBeCloseTo(136, 0);
  });

  it('200g from 500g bag at 299¢', () => {
    expect(svc.costForPortion(200, 'g', 500, 'g', 299)).toBeCloseTo(120, 0);
  });
});

describe('costForPortion — same domain volume', () => {
  it('1 tasse (250ml) from 1L at 200¢', () => {
    // 250/1000 * 200 = 50¢
    expect(svc.costForPortion(1, 'tasse', 1, 'L', 200)).toBe(50);
  });

  it('2 tasses from 2L at 399¢', () => {
    // 500/2000 * 399 ≈ 100¢
    expect(svc.costForPortion(2, 'tasse', 2, 'L', 399)).toBeCloseTo(100, 0);
  });

  it('1 c. à s. from 500ml bottle at 549¢', () => {
    // 15/500 * 549 ≈ 16¢
    expect(svc.costForPortion(1, 'c. à s.', 500, 'ml', 549)).toBeCloseTo(16, 0);
  });
});

describe('costForPortion — cross-domain farine (tasse recipe → kg package)', () => {
  it('1 tasse farine from 2.5kg bag at 499¢', () => {
    // 1 tasse farine = 132g, bag = 2500g
    // 132/2500 * 499 ≈ 26¢
    const cost = svc.costForPortion(1, 'tasse', 2.5, 'kg', 499, FLOUR_ID);
    expect(cost).toBeCloseTo(26, 0);
  });

  it('2 tasses farine from 2.5kg bag at 499¢', () => {
    // 264/2500 * 499 ≈ 53¢
    const cost = svc.costForPortion(2, 'tasse', 2.5, 'kg', 499, FLOUR_ID);
    expect(cost).toBeCloseTo(53, 0);
  });

  it('1 tasse farine from 1kg bag at 299¢', () => {
    // 132/1000 * 299 = 39.468 → rounds to 39¢
    const cost = svc.costForPortion(1, 'tasse', 1, 'kg', 299, FLOUR_ID);
    expect(cost).toBe(39);
  });
});

describe('costForPortion — cross-domain lait (tasse recipe → L package)', () => {
  it('1 tasse lait from 2L at 499¢', () => {
    // 1 tasse = 250ml, 2L = 2000ml, 250/2000 * 499 ≈ 62¢
    const cost = svc.costForPortion(1, 'tasse', 2, 'L', 499, MILK_ID);
    expect(cost).toBeCloseTo(62, 0);
  });
});

describe('costForPortion — count (oignon)', () => {
  it('2 oignons from 3kg bag at 399¢', () => {
    // 2 units = 220g, bag = 3000g
    // 220/3000 * 399 ≈ 29¢
    const cost = svc.costForPortion(2, 'unit', 3, 'kg', 399, ONION_ID);
    expect(cost).toBeCloseTo(29, 0);
  });

  it('1 oignon from bag of 6 (sold by unit) at 249¢', () => {
    // 1/6 * 249 ≈ 42¢
    const cost = svc.costForPortion(1, 'unit', 6, 'unit', 249);
    expect(cost).toBeCloseTo(42, 0);
  });
});

describe('costForPortion — edge cases', () => {
  it('returns null when no cross-domain density available', () => {
    // Recipe in tasse, package in kg, no productId
    expect(svc.costForPortion(1, 'tasse', 1, 'kg', 400)).toBeNull();
  });

  it('returns null for unknown unit', () => {
    expect(svc.costForPortion(1, 'poignée', 500, 'g', 300)).toBeNull();
  });

  it('handles zero package size gracefully', () => {
    expect(svc.costForPortion(1, 'g', 0, 'g', 500)).toBeNull();
  });
});

// ─── pricePerBaseUnit() ───────────────────────────────────────────────────────

describe('pricePerBaseUnit', () => {
  it('1kg at 499¢ → 0.499¢/g', () => {
    const r = svc.pricePerBaseUnit(1, 'kg', 499);
    expect(r).not.toBeNull();
    expect(r!.cents).toBeCloseTo(0.499);
    expect(r!.unit).toBe('g');
  });

  it('2L at 399¢ → 0.1995¢/ml', () => {
    const r = svc.pricePerBaseUnit(2, 'L', 399);
    expect(r!.cents).toBeCloseTo(0.1995);
    expect(r!.unit).toBe('ml');
  });

  it('12 units at 499¢ → ~41.6¢/unit', () => {
    const r = svc.pricePerBaseUnit(12, 'unit', 499);
    expect(r!.cents).toBeCloseTo(41.58);
    expect(r!.unit).toBe('unit');
  });
});
