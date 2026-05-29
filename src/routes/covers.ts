import type { FastifyInstance } from 'fastify';
import { buildCoverUrl, COVER_SIZES } from '../utils/cover-url.js';
import { strQuery } from '../utils/query.js';

export async function coversRoutes(app: FastifyInstance) {
  /**
   * Преобразует coverUri из трека/альбома в рабочий URL.
   * ?uri=avatars.yandex.net/.../%%&size=400x400
   * или ?redirect=true → 302 на картинку
   */
  app.get('/api/covers/resolve', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const uri = strQuery(q.uri) ?? strQuery(q.coverUri);
    const size = strQuery(q.size) ?? COVER_SIZES.medium;

    if (!uri) {
      return reply.status(400).send({
        error: 'Query "uri" or "coverUri" is required',
        hint: 'Replace %% with size, e.g. 400x400. Use this endpoint or buildCoverUrl() on client.',
        example: {
          coverUri: 'avatars.yandex.net/get-music-content/.../%%',
          url: 'https://avatars.yandex.net/get-music-content/.../400x400',
        },
      });
    }

    const url = buildCoverUrl(uri, size);
    if (!url) {
      return reply.status(400).send({ error: 'Invalid cover uri' });
    }

    if (q.redirect === 'true' || q.redirect === true) {
      return reply.redirect(url, 302);
    }

    return { url, size, sizes: COVER_SIZES };
  });
}
