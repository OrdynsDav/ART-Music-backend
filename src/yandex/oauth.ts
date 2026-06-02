import { config } from '../config.js';

const OAUTH_BASE_URL = 'https://oauth.yandex.ru';
const OAUTH_MOBILE_URL = 'https://oauth.mobile.yandex.net';
const PASSPORT_MOBILE_URL = 'https://mobileproxy.passport.yandex.net';

/** Implicit OAuth (браузер) — client_id официального Android-приложения. */
export const DEFAULT_CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d';

/** Device Flow — те же креды, что yandex-music-api (MarshalX). */
const MUSIC_DEVICE_CLIENT_SECRET = '53bc75238f0c4d08a118e51fe9203300';

/** Passport SDK — только для обмена x-token → music token (fallback). */
export const DEVICE_CLIENT_ID = 'c0ebe342af7d48fbbbfcf2d2eedb8f9e';
const DEVICE_CLIENT_SECRET = 'ad0a908f0aa341a182a37ecd75bc319e';

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export function resolveOAuthClientCredentials(): OAuthClientCredentials {
  if (config.yandexOAuthClientId && config.yandexOAuthClientSecret) {
    return {
      clientId: config.yandexOAuthClientId,
      clientSecret: config.yandexOAuthClientSecret,
    };
  }
  return {
    clientId: DEVICE_CLIENT_ID,
    clientSecret: DEVICE_CLIENT_SECRET,
  };
}

/** localhost → 127.0.0.1 для стабильного redirect_uri в OAuth. */
export function normalizeOAuthOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    return url.origin;
  } catch {
    return origin.replace('://localhost:', '://127.0.0.1:');
  }
}

export function oauthCallbackUri(origin: string): string {
  const configured = config.yandexOAuthRedirectUri?.trim();
  if (configured) return configured;
  return `${normalizeOAuthOrigin(origin)}/auth/callback`;
}

export function buildAuthorizationCodeUrl(
  redirectUri: string,
  state?: string,
  credentials = resolveOAuthClientCredentials(),
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
  });
  if (state) params.set('state', state);
  return `${OAUTH_BASE_URL}/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
  credentials = resolveOAuthClientCredentials(),
): Promise<OAuthTokenResponse> {
  const result = await oauthPost(OAUTH_BASE_URL, '/token', {
    grant_type: 'authorization_code',
    code,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: redirectUri,
  });

  if (!result.ok) {
    const msg =
      (result.data.error_description as string | undefined) ??
      (result.data.error as string | undefined) ??
      'Authorization code exchange failed';
    throw new DeviceAuthError(msg, result.data.error as string | undefined);
  }

  return result.data as unknown as OAuthTokenResponse;
}

export function buildImplicitOAuthUrl(
  redirectUri: string,
  state?: string,
): string {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: DEFAULT_CLIENT_ID,
    redirect_uri: redirectUri,
  });
  if (state) params.set('state', state);
  return `${OAUTH_BASE_URL}/authorize?${params.toString()}`;
}

/** Implicit OAuth без redirect_uri — редирект на music.yandex.ru#access_token=… */
export function buildMusicImplicitOAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: DEFAULT_CLIENT_ID,
  });
  if (state) params.set('state', state);
  return `${OAUTH_BASE_URL}/authorize?${params.toString()}`;
}

export function requestOrigin(
  headers: Record<string, string | string[] | undefined>,
  fallbackPort: number,
): string {
  const protoHeader = headers['x-forwarded-proto'];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) ?? 'http';
  const hostHeader = headers.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) ??
    `localhost:${fallbackPort}`;
  return `${proto}://${host}`;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  interval: number;
  expires_in: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export class DeviceAuthError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DeviceAuthError';
  }
}

function randomDeviceId(): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function oauthPost(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  init?: { query?: Record<string, string>; userAgent?: string },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const query = init?.query
    ? `?${new URLSearchParams(init.query).toString()}`
    : '';
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (init?.userAgent) headers['User-Agent'] = init.userAgent;

  const res = await fetch(`${baseUrl}${path}${query}`, {
    method: 'POST',
    headers,
    body,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/** x-token / OAuth-токен → music token (y0_…). */
export async function exchangeXTokenForMusicToken(
  xToken: string,
): Promise<OAuthTokenResponse> {
  const credentialSets: Array<OAuthClientCredentials & { label: string }> = [];

  if (config.yandexOAuthClientSecret) {
    credentialSets.push({
      label: 'music-oauth',
      clientId: config.musicOAuthClientId,
      clientSecret: config.musicOAuthClientSecret,
    });
  }

  if (config.yandexOAuthClientId && config.yandexOAuthClientSecret) {
    credentialSets.push({
      label: 'web-oauth',
      clientId: config.yandexOAuthClientId,
      clientSecret: config.yandexOAuthClientSecret,
    });
  }

  credentialSets.push({
    label: 'passport-sdk',
    clientId: DEVICE_CLIENT_ID,
    clientSecret: DEVICE_CLIENT_SECRET,
  });

  credentialSets.push({
    label: 'music-client+passport-sdk',
    clientId: DEFAULT_CLIENT_ID,
    clientSecret: DEVICE_CLIENT_SECRET,
  });

  const attempts: Array<{
    baseUrl: string;
    path: string;
    query?: Record<string, string>;
    userAgent?: string;
  }> = [
      {
        baseUrl: PASSPORT_MOBILE_URL,
        path: '/1/token',
        query: {
          app_id: config.musicAppId,
          am_version_name: config.musicAmVersionName,
          app_version_name: config.musicAppVersion,
          am_app: `${config.musicAppId}+${config.musicAppVersion}`,
          manufacturer: 'Apple',
          deviceid: config.musicDeviceId,
          device_id: config.musicDeviceId,
          app_platform: config.musicDevicePlatform,
        },
        userAgent: config.musicAuthUserAgent,
      },
      { baseUrl: OAUTH_MOBILE_URL, path: '/1/token' },
      { baseUrl: OAUTH_BASE_URL, path: '/token' },
    ];

  let lastError = 'Failed to exchange token for Yandex Music token';
  let lastCode: string | undefined;

  for (const credentials of credentialSets) {
    const body: Record<string, string> = {
      grant_type: 'x-token',
      access_token: xToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      payment_auth_retpath: 'https://passport.yandex.ru/closewebview',
    };

    for (const attempt of attempts) {
      const result = await oauthPost(attempt.baseUrl, attempt.path, body, {
        query: attempt.query,
        userAgent: attempt.userAgent,
      });
      if (result.ok) {
        return result.data as unknown as OAuthTokenResponse;
      }
      lastError =
        (result.data.error_description as string | undefined) ??
        (result.data.error as string | undefined) ??
        lastError;
      lastCode = result.data.error as string | undefined;
      if (lastCode !== 'invalid_client' && lastCode !== 'unauthorized_client') {
        break;
      }
    }
  }

  throw new DeviceAuthError(lastError, lastCode);
}

export function buildDeviceVerificationUrl(userCode: string): string {
  const params = new URLSearchParams({ user_code: userCode });
  return `${OAUTH_BASE_URL}/device?${params.toString()}`;
}

/** OAuth в браузере: своё приложение (redirect на localhost) или implicit Яндекс.Музыки. */
export function buildBrowserOAuthUrl(origin: string, state?: string): string {
  const clientId = config.yandexOAuthClientId?.trim();
  const clientSecret = config.yandexOAuthClientSecret?.trim();
  const redirectUri =
    config.yandexOAuthRedirectUri?.trim() || oauthCallbackUri(origin);

  if (clientId && clientSecret && redirectUri) {
    return buildAuthorizationCodeUrl(redirectUri, state, {
      clientId,
      clientSecret,
    });
  }

  return buildMusicImplicitOAuthUrl(state);
}

export async function requestDeviceCode(
  deviceName = 'ART Music',
): Promise<DeviceCodeResponse> {
  const result = await oauthPost(OAUTH_BASE_URL, '/device/code', {
    client_id: DEFAULT_CLIENT_ID,
    device_id: randomDeviceId(),
    device_name: deviceName,
  });

  if (!result.ok) {
    const msg =
      (result.data.error_description as string | undefined) ??
      (result.data.error as string | undefined) ??
      'Device code request failed';
    throw new DeviceAuthError(msg, result.data.error as string | undefined);
  }

  return result.data as unknown as DeviceCodeResponse;
}

export type PollDeviceTokenResult =
  | { status: 'pending' }
  | { status: 'success'; token: OAuthTokenResponse };

export async function pollDeviceToken(
  deviceCode: string,
): Promise<PollDeviceTokenResult> {
  const result = await oauthPost(OAUTH_BASE_URL, '/token', {
    grant_type: 'device_code',
    code: deviceCode,
    client_id: DEFAULT_CLIENT_ID,
    client_secret: MUSIC_DEVICE_CLIENT_SECRET,
  });

  if (result.ok) {
    return {
      status: 'success',
      token: result.data as unknown as OAuthTokenResponse,
    };
  }

  const error = result.data.error as string | undefined;
  if (error === 'authorization_pending' || error === 'slow_down') {
    return { status: 'pending' };
  }

  const msg =
    (result.data.error_description as string | undefined) ??
    error ??
    'OAuth token request failed';
  throw new DeviceAuthError(msg, error);
}
