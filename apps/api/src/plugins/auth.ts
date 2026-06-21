import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Access-token payload carried in the JWT.
export interface AccessPayload {
  sub: string;   // user id
  email: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessPayload;
    user: AccessPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: verifies the Bearer access token, sets request.user, 401 otherwise. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Registers @fastify/jwt and an `authenticate` preHandler decorator.
 * Access tokens are short-lived JWTs; refresh tokens are opaque (handled in auth.service).
 */
export default fp(async (app) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET missing or too short (need >= 32 chars). Set it in .env');
  }

  await app.register(jwt, {
    secret,
    sign: { expiresIn: process.env.ACCESS_TOKEN_TTL ?? '15m' },
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
});
