import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderCallbackPage, renderOAuthResultPage } from '../auth/callback-page.js';
import {
  attachDesktopTicketDevice,
  completeDesktopTicket,
  consumeDesktopTicketSession,
  createDesktopTicket,
  desktopTicketTtlMs,
  getDesktopTicket,
} from '../auth/desktop-ticket.js';
import { renderDesktopVerifyPage } from '../auth/desktop-verify-page.js';
import { renderLoginPage } from '../auth/login-page.js';
import {
  accountFromStatus,
  clearSessionCookie,
  setSessionCookie,
  type AuthSession,
} from '../auth/session.js';
import { config } from '../config.js';
import { YandexMusicClient, YandexMusicApiError } from '../yandex/client.js';
import {
  buildBrowserOAuthUrl,
  buildDeviceVerificationUrl,
  buildMusicImplicitOAuthUrl,
  DeviceAuthError,
  exchangeAuthorizationCode,
  exchangeXTokenForMusicToken,
  oauthCallbackUri,
  normalizeOAuthOrigin,
  pollDeviceToken,
  requestDeviceCode,
  requestOrigin,
} from '../yandex/oauth.js';

function publicUser(session: {
  uid: number;
  login?: string;
  displayName?: string;
}) {
  return {
    uid: session.uid,
    login: session.login,
    displayName: session.displayName,
  };
}

/** Ответ poll для десктопа: токен нужен в Authorization (cookie в Neutralino часто не сохраняется). */
function desktopPollSuccess(session: AuthSession) {
  return {
    status: 'success' as const,
    user: publicUser(session),
    accessToken: session.token,
  };
}

async function validateMusicToken(token: string) {
  const client = new YandexMusicClient({ token });
  const status = await client.getAccountStatus();
  return accountFromStatus(status);
}

async function resolveAccountToken(rawToken: string): Promise<string> {
  try {
    await validateMusicToken(rawToken);
    return rawToken;
  } catch (e) {
    if (e instanceof YandexMusicApiError && e.statusCode === 401) {
      /* not a Yandex Music account token — try exchange below */
    } else if (!(e instanceof Error && e.message === 'Invalid account status')) {
      throw e;
    }
  }

  try {
    const exchanged = await exchangeXTokenForMusicToken(rawToken);
    return exchanged.access_token;
  } catch (e) {
    if (e instanceof DeviceAuthError) {
      throw new DeviceAuthError(
        'Token is not valid for api.music.yandex.net. ' +
        (e.message || 'Exchange failed'),
        e.code ?? 'account_token_exchange_failed',
      );
    }
    throw e;
  }
}

async function createSessionFromToken(
  token: string,
  reply: Parameters<typeof setSessionCookie>[0],
) {
  const account = await validateMusicToken(token);

  const session = {
    token,
    uid: account.uid,
    login: account.login,
    displayName: account.displayName,
  };
  setSessionCookie(reply, session);
  return session;
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/login', async (_request, reply) => {
    return reply
      .type('text/html; charset=utf-8')
      .send(renderLoginPage());
  });

  app.get('/auth/yandex', async (request, reply) => {
    const origin = normalizeOAuthOrigin(
      requestOrigin(request.headers, config.port),
    );
    const q = request.query as Record<string, unknown>;
    const ticket = typeof q.ticket === 'string' ? q.ticket : undefined;

    if (ticket) {
      const entry = getDesktopTicket(ticket);
      if (!entry || entry.status !== 'pending') {
        return reply.status(400).send({
          error: 'Invalid or expired desktop login ticket',
        });
      }
    }

    return reply.redirect(buildBrowserOAuthUrl(origin, ticket));
  });

  app.get('/auth/callback', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const code = typeof q.code === 'string' ? q.code : undefined;
    const state = typeof q.state === 'string' ? q.state : undefined;
    const oauthError = typeof q.error === 'string' ? q.error : undefined;
    const oauthErrorDescription =
      typeof q.error_description === 'string' ? q.error_description : undefined;

    if (oauthError) {
      return reply
        .type('text/html; charset=utf-8')
        .send(
          renderOAuthResultPage({
            success: false,
            message: oauthErrorDescription || oauthError,
            desktop: Boolean(state && getDesktopTicket(state)),
          }),
        );
    }

    if (code) {
      const redirectUri =
        config.yandexOAuthRedirectUri?.trim() ||
        oauthCallbackUri(requestOrigin(request.headers, config.port));
      const credentials =
        config.yandexOAuthClientId && config.yandexOAuthClientSecret
          ? {
            clientId: config.yandexOAuthClientId,
            clientSecret: config.yandexOAuthClientSecret,
          }
          : undefined;

      try {
        const tokens = await exchangeAuthorizationCode(
          code,
          redirectUri,
          credentials,
        );
        const accountToken = await resolveAccountToken(tokens.access_token);
        const session = await createSessionFromToken(accountToken, reply);

        const desktopTicket =
          state && getDesktopTicket(state) ? state : undefined;
        if (desktopTicket) {
          completeDesktopTicket(desktopTicket, session);
        }

        const name =
          session.displayName || session.login || String(session.uid);
        return reply
          .type('text/html; charset=utf-8')
          .send(
            renderOAuthResultPage({
              success: true,
              message: `Добро пожаловать, ${name}.`,
              desktop: Boolean(desktopTicket),
            }),
          );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return reply
          .type('text/html; charset=utf-8')
          .send(
            renderOAuthResultPage({
              success: false,
              message,
              desktop: Boolean(state),
            }),
          );
      }
    }

    return reply
      .type('text/html; charset=utf-8')
      .send(renderCallbackPage());
  });

  /** Рекомендуемый способ для десктопа без WebView: ticket + poll. */
  app.get('/auth/oauth-url', async (request) => {
    const origin = normalizeOAuthOrigin(
      requestOrigin(request.headers, config.port),
    );
    return {
      /** Открыть в WebView — cookie сохранится автоматически. */
      webviewLoginUrl: `${origin}/auth/login`,
      /** Neutralino / системный браузер: POST start → os.open(browserUrl) → poll. */
      desktopLogin: {
        start: 'POST /auth/desktop/start',
        poll: 'GET /auth/desktop/poll?ticket=...',
      },
      /** Устаревший implicit OAuth на music.yandex.ru (без handoff в приложение). */
      implicitOAuthUrl: buildMusicImplicitOAuthUrl(),
      /** Redirect через бэкенд (authorization code flow). */
      backendOAuthUrl: `${origin}/auth/yandex`,
      oauthRedirectUri: oauthCallbackUri(origin),
    };
  });

  app.post('/auth/desktop/start', async (request, reply) => {
    const origin = normalizeOAuthOrigin(
      requestOrigin(request.headers, config.port),
    );
    const ticket = createDesktopTicket();

    try {
      const device = await requestDeviceCode('ART Music');
      attachDesktopTicketDevice(
        ticket,
        device.device_code,
        device.user_code,
        device.interval,
      );

      const verificationUrl = buildDeviceVerificationUrl(device.user_code);

      return {
        ticket,
        browserUrl: `${origin}/auth/desktop/verify?ticket=${ticket}`,
        verificationUrl,
        userCode: device.user_code,
        pollUrl: `${origin}/auth/desktop/poll?ticket=${ticket}`,
        expiresIn: Math.min(
          device.expires_in,
          Math.floor(desktopTicketTtlMs / 1000),
        ),
        pollInterval: device.interval,
      };
    } catch (e) {
      if (e instanceof DeviceAuthError) {
        return reply.status(502).send({ error: e.message, code: e.code });
      }
      throw e;
    }
  });

  app.get('/auth/desktop/verify', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const ticket = z.string().min(1).parse(q.ticket);
    const entry = getDesktopTicket(ticket);

    if (!entry || entry.status !== 'pending' || !entry.userCode) {
      return reply.status(400).send({
        error: 'Invalid or expired desktop login ticket',
      });
    }

    const verificationUrl = buildDeviceVerificationUrl(entry.userCode);
    return reply
      .type('text/html; charset=utf-8')
      .send(renderDesktopVerifyPage(entry.userCode, verificationUrl));
  });

  app.get('/auth/desktop/poll', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const ticket = z.string().min(1).parse(q.ticket);

    const entry = getDesktopTicket(ticket);
    if (!entry) {
      return reply.status(404).send({
        status: 'expired',
        error: 'Ticket not found or expired',
      });
    }

    if (entry.status === 'complete') {
      const session = consumeDesktopTicketSession(ticket);
      if (!session) {
        return reply.status(404).send({
          status: 'expired',
          error: 'Ticket already used or expired',
        });
      }

      setSessionCookie(reply, session);
      return desktopPollSuccess(session);
    }

    if (!entry.deviceCode) {
      return { status: 'pending' };
    }

    try {
      const result = await pollDeviceToken(entry.deviceCode);

      if (result.status === 'pending') {
        return { status: 'pending' };
      }

      const accountToken = result.token.access_token;
      const session = await createSessionFromToken(accountToken, reply);
      completeDesktopTicket(ticket, session);

      return desktopPollSuccess(session);
    } catch (e) {
      if (e instanceof DeviceAuthError) {
        return reply.status(401).send({
          status: 'error',
          error: e.message,
          code: e.code,
        });
      }
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(401).send({
        status: 'error',
        error: message,
        code: 'session_failed',
      });
    }
  });

  app.post('/auth/desktop/complete', async (request, reply) => {
    const body = z
      .object({ ticket: z.string().min(1) })
      .parse(request.body ?? {});

    if (!request.authSession) {
      return reply.status(401).send({
        error: 'Not authenticated in browser',
      });
    }

    const ok = completeDesktopTicket(body.ticket, request.authSession);
    if (!ok) {
      return reply.status(400).send({
        error: 'Invalid or expired desktop login ticket',
      });
    }

    return { ok: true };
  });

  app.post('/auth/session', async (request, reply) => {
    const body = z.object({ token: z.string().min(1) }).parse(request.body ?? {});

    try {
      const session = await createSessionFromToken(body.token, reply);
      return {
        authenticated: true,
        user: publicUser(session),
      };
    } catch (e) {
      return reply.status(401).send({
        error: 'Invalid Yandex Music token',
        details: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.get('/auth/me', async (request, reply) => {
    if (!request.authSession) {
      return reply.status(401).send({
        authenticated: false,
        error: 'Not authenticated. Open /auth/login',
      });
    }

    return {
      authenticated: true,
      user: publicUser(request.authSession),
    };
  });

  app.post('/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post('/auth/device/start', async (request, reply) => {
    const body = z
      .object({ deviceName: z.string().min(1).max(64).optional() })
      .parse(request.body ?? {});

    try {
      const code = await requestDeviceCode(body.deviceName ?? 'ART Music');
      return {
        deviceCode: code.device_code,
        userCode: code.user_code,
        verificationUrl: code.verification_url,
        interval: code.interval,
        expiresIn: code.expires_in,
      };
    } catch (e) {
      if (e instanceof DeviceAuthError) {
        return reply.status(502).send({ error: e.message, code: e.code });
      }
      throw e;
    }
  });

  app.get('/auth/device/poll', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const deviceCode = z.string().min(1).parse(q.deviceCode);

    try {
      const result = await pollDeviceToken(deviceCode);

      if (result.status === 'pending') {
        return { status: 'pending' };
      }

      const session = await createSessionFromToken(
        result.token.access_token,
        reply,
      );

      return {
        status: 'success',
        user: publicUser(session),
        expiresIn: result.token.expires_in,
      };
    } catch (e) {
      if (e instanceof DeviceAuthError) {
        const status =
          e.code === 'music_token_exchange_unavailable' ? 503 : 400;
        return reply.status(status).send({
          error: e.message,
          code: e.code,
          hint:
            e.code === 'music_token_exchange_unavailable'
              ? 'Use POST /auth/desktop/start for Neutralino, or open webviewLoginUrl in WebView.'
              : undefined,
        });
      }
      if (e instanceof Error && e.message === 'Invalid account status') {
        return reply.status(401).send({
          error: 'OAuth token is not valid for Yandex Music',
          details: e.message,
        });
      }
      throw e;
    }
  });
}
