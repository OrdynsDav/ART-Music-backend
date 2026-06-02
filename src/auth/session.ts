import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export const SESSION_COOKIE = 'art_session';

export interface AuthSession {
  token: string;
  uid: number;
  login?: string;
  displayName?: string;
}

export function setSessionCookie(
  reply: FastifyReply,
  session: AuthSession,
): void {
  reply.setCookie(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    signed: true,
    maxAge: config.sessionMaxAge,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function readSessionCookie(
  request: FastifyRequest,
): AuthSession | undefined {
  const signed = request.cookies[SESSION_COOKIE];
  if (!signed) return undefined;

  const unsigned = request.unsignCookie(signed);
  if (!unsigned.valid || !unsigned.value) return undefined;

  try {
    return JSON.parse(unsigned.value) as AuthSession;
  } catch {
    return undefined;
  }
}

export function accountFromStatus(status: unknown): {
  uid: number;
  login?: string;
  displayName?: string;
} {
  const data = status as {
    account?: {
      uid?: number;
      login?: string;
      displayName?: string;
    };
  };
  const uid = data.account?.uid;
  if (uid == null) {
    throw new Error('Invalid account status');
  }
  return {
    uid,
    login: data.account?.login,
    displayName: data.account?.displayName,
  };
}
