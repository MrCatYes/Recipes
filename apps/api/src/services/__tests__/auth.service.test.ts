import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  sha256,
  generateOpaqueToken,
  toPublicUser,
} from '../auth.service';

describe('hashPassword / verifyPassword', () => {
  it('hash differs from plaintext', async () => {
    const hash = await hashPassword('hunter2pass');
    expect(hash).not.toBe('hunter2pass');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies correct password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('two hashes of same password differ (salted)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});

describe('sha256', () => {
  it('deterministic', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
  });
  it('known vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('different input → different hash', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('generateOpaqueToken', () => {
  it('64 hex chars (32 bytes)', () => {
    expect(generateOpaqueToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('unique across calls', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe('toPublicUser', () => {
  it('omits passwordHash, keeps public fields', () => {
    const pub = toPublicUser({
      id: 'u1', email: 'a@b.ca', displayName: 'Al',
      latitude: 45.5, longitude: -73.6, postalCode: 'H2X1Y4',
    });
    expect(pub).toEqual({
      id: 'u1', email: 'a@b.ca', displayName: 'Al',
      latitude: 45.5, longitude: -73.6, postalCode: 'H2X1Y4',
    });
    expect('passwordHash' in pub).toBe(false);
  });
});
