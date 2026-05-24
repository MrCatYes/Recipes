export interface ConversionRecord {
  fromUnit: string;
  toUnit: string;
  productId: string | null;
  factor: number;
}

type UnitDomain = 'weight' | 'volume' | 'count' | 'unknown';

const WEIGHT_UNITS = new Set(['g', 'kg', 'lb', 'oz']);
const VOLUME_UNITS = new Set(['ml', 'L', 'l', 'tasse', 'c. à s.', 'c. à t.', 'oz fl', 'pinte']);
const COUNT_UNITS  = new Set(['unit', 'unité', 'pièce', 'tranche']);

function domain(unit: string): UnitDomain {
  const u = unit.toLowerCase();
  if (WEIGHT_UNITS.has(unit) || u.endsWith('g') || u.endsWith('kg')) return 'weight';
  if (VOLUME_UNITS.has(unit)) return 'volume';
  if (COUNT_UNITS.has(unit)) return 'count';
  return 'unknown';
}

export class ConversionService {
  // productId → (fromUnit → (toUnit → factor))
  private productIndex = new Map<string, Map<string, Map<string, number>>>();
  // universal: fromUnit → (toUnit → factor)
  private universalIndex = new Map<string, Map<string, number>>();

  constructor(conversions: ConversionRecord[]) {
    for (const c of conversions) {
      if (c.productId) {
        if (!this.productIndex.has(c.productId))
          this.productIndex.set(c.productId, new Map());
        const byFrom = this.productIndex.get(c.productId)!;
        if (!byFrom.has(c.fromUnit)) byFrom.set(c.fromUnit, new Map());
        byFrom.get(c.fromUnit)!.set(c.toUnit, c.factor);
      } else {
        if (!this.universalIndex.has(c.fromUnit))
          this.universalIndex.set(c.fromUnit, new Map());
        this.universalIndex.get(c.fromUnit)!.set(c.toUnit, c.factor);
      }
    }
  }

  // Direct 1-step lookup: productId-specific first, then universal
  private directFactor(from: string, to: string, productId?: string): number | null {
    if (from === to) return 1;

    if (productId) {
      const f = this.productIndex.get(productId)?.get(from)?.get(to);
      if (f != null) return f;
    }

    const f = this.universalIndex.get(from)?.get(to);
    if (f != null) return f;

    // Try inverse
    if (productId) {
      const inv = this.productIndex.get(productId)?.get(to)?.get(from);
      if (inv != null) return 1 / inv;
    }
    const inv = this.universalIndex.get(to)?.get(from);
    if (inv != null) return 1 / inv;

    return null;
  }

  /**
   * Convert `quantity fromUnit` → `toUnit`.
   * Tries: direct → 2-step via base unit (g or ml).
   * Returns null if no conversion path found.
   */
  convert(quantity: number, fromUnit: string, toUnit: string, productId?: string): number | null {
    const direct = this.directFactor(fromUnit, toUnit, productId);
    if (direct != null) return quantity * direct;

    // 2-step via base: try weight base (g) and volume base (ml)
    for (const base of ['g', 'ml']) {
      const step1 = this.directFactor(fromUnit, base, productId);
      const step2 = this.directFactor(base, toUnit, productId);
      if (step1 != null && step2 != null) return quantity * step1 * step2;
    }

    return null;
  }

  /**
   * Cost (cents) of using `recipeQty recipeUnit` of a product
   * sold as `packageSize packageUnit` at `priceCents`.
   *
   * Returns null when unit conversion is impossible.
   */
  costForPortion(
    recipeQty: number,
    recipeUnit: string,
    packageSize: number,
    packageUnit: string,
    priceCents: number,
    productId?: string
  ): number | null {
    // Same unit domain — normalize both to base
    const recipeDomain  = domain(recipeUnit);
    const packageDomain = domain(packageUnit);

    let recipeBase: number | null;
    let packageBase: number | null;

    if (recipeDomain === 'count' || packageDomain === 'count') {
      // Count: pass-through (1 oignon = 1 unit)
      recipeBase  = this.convert(recipeQty,   recipeUnit,  'unit', productId) ?? recipeQty;
      packageBase = this.convert(packageSize, packageUnit, 'unit', productId) ?? packageSize;
    } else if (recipeDomain === packageDomain) {
      // Both weight or both volume — pick common base
      const base = recipeDomain === 'weight' ? 'g' : 'ml';
      recipeBase  = this.convert(recipeQty,   recipeUnit,  base, productId);
      packageBase = this.convert(packageSize, packageUnit, base, productId);
    } else {
      // Cross-domain (e.g., recipe in tasse, package in kg)
      // Try converting recipe unit → package base
      const pkgBase  = packageDomain === 'weight' ? 'g' : 'ml';
      const recBase  = recipeDomain  === 'weight' ? 'g' : 'ml';

      // First normalize each to their own base, then cross-convert with density
      const rBase = this.convert(recipeQty,   recipeUnit,  recBase, productId);
      const pBase = this.convert(packageSize, packageUnit, pkgBase, productId);

      if (rBase == null || pBase == null) return null;

      // Cross: try recBase → pkgBase
      const crossFactor = this.directFactor(recBase, pkgBase, productId);
      if (crossFactor == null) return null;

      recipeBase  = rBase * crossFactor;
      packageBase = pBase;
    }

    if (recipeBase == null || packageBase == null || packageBase === 0) return null;

    return Math.round((recipeBase / packageBase) * priceCents);
  }

  /**
   * Price per base unit (g or ml) in cents.
   * Useful for the comparator "price per 100g" display.
   */
  pricePerBaseUnit(
    packageSize: number,
    packageUnit: string,
    priceCents: number,
    productId?: string
  ): { cents: number; unit: string } | null {
    const d = domain(packageUnit);
    const base = d === 'weight' ? 'g' : d === 'volume' ? 'ml' : 'unit';
    const baseSize = this.convert(packageSize, packageUnit, base, productId);
    if (baseSize == null || baseSize === 0) return null;
    return { cents: priceCents / baseSize, unit: base };
  }
}
