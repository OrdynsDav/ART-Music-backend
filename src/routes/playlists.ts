import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const playlistIdsBody = z.object({
  playlistIds: z.array(z.string()).min(1),
});

const kindsBody = z.object({
  kinds: z.array(z.union([z.string(), z.number()])).min(1),
});

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

  app.get<{ Params: { userId: string } }>(
    '/api/users/:userId/playlists',
    async (request) => {
      const client = app.createYandexClient(request);
      const playlists = await client.getUserPlaylistsList(request.params.userId);
      return { playlists };
    },
  );

  app.post<{ Params: { userId: string } }>(
    '/api/users/:userId/playlists',
    async (request) => {
      const body = kindsBody.parse(request.body);
      const client = app.createYandexClient(request);
      const playlists = await client.getUserPlaylistsByKinds(
        request.params.userId,
        body.kinds,
      );
      return { playlists };
    },
  );

  app.get('/api/playlists', async (request, reply) => {
    const q = request.query as { ids?: string };
    if (!q.ids) {
      return reply.status(400).send({
        error: 'Query "ids" required: uid:kind,uid:kind,...',
      });
    }
    const client = app.createYandexClient(request);
    const playlists = await client.getPlaylistsByIds(
      q.ids.split(',').map((s) => s.trim()).filter(Boolean),
    );
    return { playlists };
  });

  app.post('/api/playlists/batch', async (request) => {
    const body = playlistIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const playlists = await client.getPlaylistsListShort(body.playlistIds);
    return { playlists };
  });

  app.get<{ Params: { uuid: string } }>(
    '/api/playlists/uuid/:uuid',
    async (request) => {
      const client = app.createYandexClient(request);
      const playlist = await client.getPlaylistByUuid(request.params.uuid);
      return { playlist };
    },
  );
}
