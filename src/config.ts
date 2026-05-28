import 'dotenv/config';

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8097',
  'http://127.0.0.1:8097',
];

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return defaultCorsOrigins;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export const config = {
  /** 3001 по умолчанию: Neutralino часто занимает 3000 */
  port: Number(process.env.PORT ?? 3001),
  yandexToken: process.env.YANDEX_MUSIC_TOKEN?.trim() ?? '',
  yandexLanguage: process.env.YANDEX_MUSIC_LANGUAGE?.trim() || 'ru',
  corsOrigins: parseCorsOrigins(),
  corsAllowAll: process.env.CORS_ALLOW_ALL === 'true',
};
