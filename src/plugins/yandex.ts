import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { YandexMusicClient, YandexMusicApiError } from '../yandex/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    yandexToken?: string;
  }
  interface FastifyInstance {
    createYandexClient: (request: FastifyRequest) => YandexMusicClient;
  }
}

function extractToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith('OAuth ')) return auth.slice(6).trim();
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return config.yandexToken || undefined;
}

export async function registerYandex(app: FastifyInstance) {
  app.decorate('createYandexClient', (request: FastifyRequest) => {
    const token = extractToken(request);
    if (!token) {
      throw new YandexMusicApiError(
        'Yandex Music token required. Set YANDEX_MUSIC_TOKEN or Authorization: OAuth <token>',
        401,
      );
    }
    return new YandexMusicClient({
      token,
      language: config.yandexLanguage,
    });
  });
}
