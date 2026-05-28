import type { FastifyInstance } from 'fastify';

export async function albumsRoutes(app: FastifyInstance) {
  app.get<{ Params: { albumId: string } }>(
    '/api/albums/:albumId',
    async (request) => {
      const client = app.createYandexClient(request);
      const withTracks =
        (request.query as { withTracks?: string }).withTracks !== 'false';
      if (withTracks) {
        const album = await client.getAlbumWithTracks(request.params.albumId);
        return { album };
      }
      const albums = await client.getAlbum(request.params.albumId);
      return { album: albums[0] ?? null, albums };
    },
  );
}
