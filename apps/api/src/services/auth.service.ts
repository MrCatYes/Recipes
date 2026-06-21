import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../db';
import type { User as PublicUser } from '@epicerie/shared-types';

const BCRYPT_ROUNDS = 10;
const REFRESH_TTL_DAYS = 30;

// ─── Pure helpers (testable without DB) ───────────────────────────────────────

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  latitude: number | null;
  longitude: number | null;
  postalCode: string | null;
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    latitude: u.latitude,
    longitude: u.longitude,
    postalCode: u.postalCode,
  };
}

// ─── Refresh-token lifecycle (opaque, revocable, rotating) ────────────────────

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  return token;
}

/** Validate + rotate: revoke the presented token, mint a fresh one. Null if invalid. */
export async function rotateRefreshToken(oldToken: string): Promise<{ userId: string; refreshToken: string } | null> {
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(oldToken) } });
  if (!rec || rec.revokedAt || rec.expiresAt < new Date()) return null;
  await prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
  const refreshToken = await issueRefreshToken(rec.userId);
  return { userId: rec.userId, refreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
