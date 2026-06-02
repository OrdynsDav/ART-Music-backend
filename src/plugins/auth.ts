import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import type { AuthSession } from '../auth/session.js';
import { readSessionCookie } from '../auth/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
  }
}

export async function registerAuth(app: FastifyInstance) {
  await app.register(cookie, {
    secret: config.sessionSecret,
    hook: 'onRequest',
  });

  app.addHook('onRequest', async (request) => {
    request.authSession = readSessionCookie(request);
  });
}
