import type { FastifyInstance } from 'fastify';

export async function playlistsRoutes(app: FastifyInstance) {
  app.get<{ Params: { userId: string; kind: string } }>(
    '/api/playlists/:userId/:kind',
    async (request) => {
      const client = app.createYandexClient(request);
      const playlist = await client.getPlaylist(
        request.params.userId,
        request.params.kind,
      );
      return { playlist };
    },
  );
}
