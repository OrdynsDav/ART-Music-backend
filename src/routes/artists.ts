import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { numQuery, strQuery } from '../utils/query.js';

const artistIdsBody = z.object({
  artistIds: z.array(z.string()).min(1),
});

export async function artistsRoutes(app: FastifyInstance) {
  app.get<{ Params: { artistId: string } }>(
    '/api/artists/:artistId',
    async (request) => {
      const client = app.createYandexClient(request);
      const brief =
        (request.query as { brief?: string }).brief !== 'false';
      if (brief) {
        const info = await client.getArtistBriefInfo(request.params.artistId);
        return { artist: info };
      }
      const artists = await client.getArtists([request.params.artistId]);
      return { artist: artists[0] ?? null, artists };
    },
  );

  app.post('/api/artists', async (request) => {
    const body = artistIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const artists = await client.getArtists(body.artistIds);
    return { artists };
  });

  app.get<{ Params: { artistId: string } }>(
    '/api/artists/:artistId/tracks',
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const client = app.createYandexClient(request);
      const tracks = await client.getArtistTracks(
        request.params.artistId,
        numQuery(q.page, 0),
        numQuery(q.pageSize, 20),
      );
      return { tracks };
    },
  );

  app.get<{ Params: { artistId: string } }>(
    '/api/artists/:artistId/albums',
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const client = app.createYandexClient(request);
      const albums = await client.getArtistDirectAlbums(
        request.params.artistId,
        {
          page: numQuery(q.page, 0),
          pageSize: numQuery(q.pageSize, 20),
          sortBy: strQuery(q.sortBy) ?? 'year',
        },
      );
      return { albums };
    },
  );

  app.get<{ Params: { artistId: string } }>(
    '/api/artists/:artistId/similar',
    async (request) => {
      const client = app.createYandexClient(request);
      const similar = await client.getArtistSimilar(request.params.artistId);
      return { similar };
    },
  );
}
