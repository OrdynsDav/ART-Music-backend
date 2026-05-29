import type { FastifyInstance } from 'fastify';
import { numQuery, strQuery } from '../utils/query.js';
import { trackIdFromShort } from '../utils/track-id.js';
import { YandexMusicApiError } from '../yandex/client.js';

export async function accountRoutes(app: FastifyInstance) {
  app.get('/api/account', async (request) => {
    const client = app.createYandexClient(request);
    const account = await client.getAccountStatus();
    return { account };
  });

  /** «Мои треки» — все лайкнутые треки текущего аккаунта */
  app.get('/api/me/tracks', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const client = app.createYandexClient(request);

    let uid: number;
    const userIdParam = strQuery(q.userId);
    if (userIdParam) {
      uid = Number(userIdParam);
    } else {
      try {
        uid = await client.resolveAccountUid();
      } catch (e) {
        if (e instanceof YandexMusicApiError) {
          return reply.status(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }

    const library = await client.getUserLikedTracks(
      uid,
      numQuery(q.revision, 0),
    );
    const shortTracks = (library?.tracks ?? []) as Array<{
      id?: string | number;
      albumId?: string | number;
      albums?: Array<{ id?: string | number }>;
    }>;

    const full = q.full === 'true' || q.full === true;
    if (full && shortTracks.length > 0) {
      const ids = shortTracks
        .map(trackIdFromShort)
        .filter((id): id is string => id != null);
      const tracks =
        ids.length > 0 ? await client.getTracks(ids) : [];
      return {
        uid,
        revision: library?.revision,
        playlistUuid: library?.playlistUuid,
        trackCount: tracks.length,
        tracks,
      };
    }

    return {
      uid,
      revision: library?.revision,
      playlistUuid: library?.playlistUuid,
      trackCount: shortTracks.length,
      tracks: shortTracks,
    };
  });
}
