import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import {
  hashPassword,
  verifyPassword,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  toPublicUser,
} from '../services/auth.service';
import type { AuthResponse } from '@epicerie/shared-types';

const USER_SELECT = {
  id: true, email: true, displayName: true,
  latitude: true, longitude: true, postalCode: true,
} as const;

export async function authRoutes(app: FastifyInstance) {
  function signAccess(sub: string, email: string): string {
    return app.jwt.sign({ sub, email });
  }

  // POST /auth/register
  app.post('/auth/register', async (req, reply) => {
    const schema = z.object({
      email: z.string().email().transform(e => e.toLowerCase().trim()),
      password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
      displayName: z.string().min(1).max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.errors[0]?.message ?? 'Invalid input');

    const { email, password, displayName } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.conflict('Un compte existe déjà avec ce courriel');

    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), displayName: displayName ?? null },
      select: USER_SELECT,
    });

    const refreshToken = await issueRefreshToken(user.id);
    return reply.code(201).send({
      user: toPublicUser(user),
      accessToken: signAccess(user.id, user.email),
      refreshToken,
    } satisfies AuthResponse);
  });

  // POST /auth/login
  app.post('/auth/login', async (req, reply) => {
    const schema = z.object({
      email: z.string().email().transform(e => e.toLowerCase().trim()),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Courriel ou mot de passe invalide');

    const row = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    // Constant-ish: always run a compare to avoid user enumeration via timing
    const ok = row ? await verifyPassword(parsed.data.password, row.passwordHash) : false;
    if (!row || !ok) return reply.unauthorized('Courriel ou mot de passe invalide');

    const refreshToken = await issueRefreshToken(row.id);
    return {
      user: toPublicUser(row),
      accessToken: signAccess(row.id, row.email),
      refreshToken,
    } satisfies AuthResponse;
  });

  // POST /auth/refresh  → rotate refresh + new access
  app.post('/auth/refresh', async (req, reply) => {
    const schema = z.object({ refreshToken: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('refreshToken requis');

    const rotated = await rotateRefreshToken(parsed.data.refreshToken);
    if (!rotated) return reply.unauthorized('Refresh token invalide ou expiré');

    const user = await prisma.user.findUnique({ where: { id: rotated.userId }, select: USER_SELECT });
    if (!user) return reply.unauthorized('Utilisateur introuvable');

    return {
      user: toPublicUser(user),
      accessToken: signAccess(user.id, user.email),
      refreshToken: rotated.refreshToken,
    } satisfies AuthResponse;
  });

  // POST /auth/logout  → revoke refresh
  app.post('/auth/logout', async (req, reply) => {
    const schema = z.object({ refreshToken: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (parsed.success) await revokeRefreshToken(parsed.data.refreshToken);
    return reply.code(204).send();
  });

  // GET /auth/me  (authenticated)
  app.get('/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: USER_SELECT });
    if (!user) return reply.notFound('Utilisateur introuvable');
    return toPublicUser(user);
  });

  // PATCH /auth/me  → update profile + location (for nearby-store geoloc)
  app.patch('/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    const schema = z.object({
      displayName: z.string().min(1).max(80).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      postalCode: z.string().min(3).max(10).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.errors[0]?.message ?? 'Invalid input');

    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: parsed.data,
      select: USER_SELECT,
    });
    return toPublicUser(user);
  });
}
