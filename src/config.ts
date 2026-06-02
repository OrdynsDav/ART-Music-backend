import 'dotenv/config';

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8097',
  'http://127.0.0.1:8097',
];

function selfOrigins(port: number): string[] {
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

function parseCorsOrigins(port: number): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  const configured = raw
    ? raw.split(',').map((o) => o.trim()).filter(Boolean)
    : defaultCorsOrigins;
  return [...new Set([...configured, ...selfOrigins(port)])];
}

const port = Number(process.env.PORT ?? 3001);

export const config = {
  /** 3001 по умолчанию: Neutralino часто занимает 3000 */
  port,
  yandexToken: process.env.YANDEX_MUSIC_TOKEN?.trim() ?? '',
  yandexLanguage: process.env.YANDEX_MUSIC_LANGUAGE?.trim() || 'ru',
  corsOrigins: parseCorsOrigins(port),
  corsAllowAll: process.env.CORS_ALLOW_ALL === 'true',
  sessionSecret:
    process.env.SESSION_SECRET?.trim() || 'dev-change-me-in-production',
  sessionMaxAge: Number(process.env.SESSION_MAX_AGE ?? 60 * 60 * 24 * 30),
  cookieSecure:
    process.env.COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production',
  /** OAuth client_id для обмена x-token → music token (опционально). */
  musicOAuthClientId:
    process.env.MUSIC_OAUTH_CLIENT_ID?.trim() || '23cabbbdc6cd418abb4b39c32c41195d',
  /** Если не задан — Device Flow не сможет обменять x-token; используйте /auth/login. */
  musicOAuthClientSecret: process.env.MUSIC_OAUTH_CLIENT_SECRET?.trim() ?? '',
  musicAppId: process.env.MUSIC_APP_ID?.trim() || 'ru.yandex.mobile.music',
  musicDeviceId:
    process.env.MUSIC_DEVICE_ID?.trim() || '377c5ae26b09fccd72deae0a95425559',
  musicAmVersionName:
    process.env.MUSIC_AM_VERSION_NAME?.trim() || '7.33.2(733022870)',
  musicAppVersion: process.env.MUSIC_APP_VERSION?.trim() || '24023131',
  musicAuthUserAgent:
    process.env.MUSIC_AUTH_USER_AGENT?.trim() ||
    'com.yandex.mobile.auth.sdk/7.33.2.733022870',
  musicDevicePlatform: process.env.MUSIC_DEVICE_PLATFORM?.trim() || 'ios',
  /** Своё OAuth-приложение на oauth.yandex.ru (рекомендуется для redirect на localhost). */
  yandexOAuthClientId: process.env.YANDEX_OAUTH_CLIENT_ID?.trim() ?? '',
  yandexOAuthClientSecret: process.env.YANDEX_OAUTH_CLIENT_SECRET?.trim() ?? '',
  yandexOAuthRedirectUri: process.env.YANDEX_OAUTH_REDIRECT_URI?.trim() ?? '',
};
