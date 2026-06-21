import { describe, it, expect } from 'vitest';
import { haversineKm } from '../store.service';

describe('haversineKm', () => {
  it('same point → 0', () => {
    expect(haversineKm(45.5, -73.6, 45.5, -73.6)).toBeCloseTo(0, 5);
  });

  it('Downtown MTL ↔ Laval ≈ 16 km', () => {
    // Downtown MTL (45.5017,-73.5673) ↔ Laval (45.6066,-73.7124)
    const d = haversineKm(45.5017, -73.5673, 45.6066, -73.7124);
    expect(d).toBeGreaterThan(14);
    expect(d).toBeLessThan(18);
  });

  it('Montréal ↔ Québec City ≈ 233 km', () => {
    const d = haversineKm(45.5017, -73.5673, 46.8139, -71.2080);
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(250);
  });

  it('symmetric', () => {
    const a = haversineKm(45.5, -73.6, 46.8, -71.2);
    const b = haversineKm(46.8, -71.2, 45.5, -73.6);
    expect(a).toBeCloseTo(b, 6);
  });

  it('1 degree latitude ≈ 111 km', () => {
    expect(haversineKm(45, -73, 46, -73)).toBeGreaterThan(110);
    expect(haversineKm(45, -73, 46, -73)).toBeLessThan(112);
  });
});
