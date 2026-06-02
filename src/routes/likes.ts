import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { YandexMusicClient, YandexMusicApiError } from '../yandex/client.js';

const trackIdsBody = z.object({
  trackIds: z.array(z.string()).min(1),
});

const albumIdsBody = z.object({
  albumIds: z.array(z.string()).min(1),
});

const artistIdsBody = z.object({
  artistIds: z.array(z.string()).min(1),
});

async function resolveUid(
  client: YandexMusicClient,
  reply: FastifyReply,
): Promise<number | undefined> {
  try {
    return await client.resolveAccountUid();
  } catch (e) {
    if (e instanceof YandexMusicApiError) {
      reply.status(e.statusCode).send({ error: e.message });
      return undefined;
    }
    throw e;
  }
}

export async function likesRoutes(app: FastifyInstance) {
  app.post('/api/me/likes/tracks', async (request, reply) => {
    const body = trackIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const uid = await resolveUid(client, reply);
    if (uid == null) return;

    const result = await client.likeTracks(uid, body.trackIds);
    return { ok: true, uid, revision: result?.revision, trackIds: body.trackIds };
  });

  app.delete('/api/me/likes/tracks', async (request, reply) => {
    const body = trackIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const uid = await resolveUid(client, reply);
    if (uid == null) return;

    await client.unlikeTracks(uid, body.trackIds);
    return { ok: true, uid, trackIds: body.trackIds };
  });

  app.post('/api/me/likes/albums', async (request, reply) => {
    const body = albumIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const uid = await resolveUid(client, reply);
    if (uid == null) return;

    await client.likeAlbums(uid, body.albumIds);
    return { ok: true, uid, albumIds: body.albumIds };
  });

  app.post('/api/me/likes/artists', async (request, reply) => {
    const body = artistIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const uid = await resolveUid(client, reply);
    if (uid == null) return;

    await client.likeArtists(uid, body.artistIds);
    return { ok: true, uid, artistIds: body.artistIds };
  });
}
