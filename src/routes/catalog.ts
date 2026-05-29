import type { FastifyInstance } from 'fastify';
import { numQuery, strQuery } from '../utils/query.js';

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/api/genres', async (request) => {
    const client = app.createYandexClient(request);
    const genres = await client.getGenres();
    return { genres };
  });

  app.get<{ Params: { tagId: string } }>(
    '/api/tags/:tagId',
    async (request) => {
      const client = app.createYandexClient(request);
      const tag = await client.getTag(request.params.tagId);
      return { tag };
    },
  );

  app.get('/api/metatags', async (request) => {
    const client = app.createYandexClient(request);
    const metatags = await client.getMetatags();
    return { metatags };
  });

  app.get<{ Params: { metatagId: string } }>(
    '/api/metatags/:metatagId',
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const client = app.createYandexClient(request);
      const metatag = await client.getMetatag(request.params.metatagId, {
        tracksCount: q.tracksCount !== undefined ? numQuery(q.tracksCount, 0) : undefined,
        artistsCount: q.artistsCount !== undefined ? numQuery(q.artistsCount, 0) : undefined,
        albumsCount: q.albumsCount !== undefined ? numQuery(q.albumsCount, 0) : undefined,
        playlistsCount:
          q.playlistsCount !== undefined ? numQuery(q.playlistsCount, 0) : undefined,
        tracksSortBy: strQuery(q.tracksSortBy),
        albumsSortBy: strQuery(q.albumsSortBy),
      });
      return { metatag };
    },
  );

  app.get<{ Params: { metatagId: string } }>(
    '/api/metatags/:metatagId/albums',
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const client = app.createYandexClient(request);
      const albums = await client.getMetatagAlbums(request.params.metatagId, {
        offset: numQuery(q.offset, 0),
        limit: numQuery(q.limit, 25),
        sortBy: strQuery(q.sortBy),
        period: strQuery(q.period),
      });
      return { albums };
    },
  );

  app.get<{ Params: { metatagId: string } }>(
    '/api/metatags/:metatagId/artists',
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const client = app.createYandexClient(request);
      const artists = await client.getMetatagArtists(request.params.metatagId, {
        period: strQuery(q.period) ?? 'week',
        offset: numQuery(q.offset, 0),
        limit: numQuery(q.limit, 25),
        sortBy: strQuery(q.sortBy),
      });
      return { artists };
    },
  );

  app.get<{ Params: { metatagId: string } }>(
    '/api/metatags/:metatagId/playlists',
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const client = app.createYandexClient(request);
      const playlists = await client.getMetatagPlaylists(
        request.params.metatagId,
        {
          offset: numQuery(q.offset, 0),
          limit: numQuery(q.limit, 25),
          sortBy: strQuery(q.sortBy),
        },
      );
      return { playlists };
    },
  );

  app.get('/api/landing', async (request) => {
    const q = request.query as { blocks?: string };
    const blocks =
      q.blocks ??
      'personalplaylists,promotions,new-releases,new-playlists,mixes,chart,artists,albums,playlists';
    const client = app.createYandexClient(request);
    const landing = await client.getLanding(blocks);
    return { landing };
  });

  app.get('/api/landing/chart', async (request) => {
    const q = request.query as { type?: string };
    const type = (q.type === 'world' ? 'world' : 'russia') as 'russia' | 'world';
    const client = app.createYandexClient(request);
    const chart = await client.getChart(type);
    return { chart };
  });

  app.get('/api/landing/new-releases', async (request) => {
    const client = app.createYandexClient(request);
    const releases = await client.getNewReleases();
    return { releases };
  });

  app.get('/api/landing/new-playlists', async (request) => {
    const client = app.createYandexClient(request);
    const playlists = await client.getNewPlaylistsLanding();
    return { playlists };
  });

  app.get('/api/landing/podcasts', async (request) => {
    const client = app.createYandexClient(request);
    const podcasts = await client.getPodcastsLanding();
    return { podcasts };
  });

  app.get('/api/feed', async (request) => {
    const client = app.createYandexClient(request);
    const feed = await client.getFeed();
    return { feed };
  });
}
