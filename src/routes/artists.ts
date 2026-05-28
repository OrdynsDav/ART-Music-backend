import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
}
