import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { config } from './config.js';
import { registerYandex } from './plugins/yandex.js';
import { YandexMusicApiError } from './yandex/client.js';
import { tracksRoutes } from './routes/tracks.js';
import { albumsRoutes } from './routes/albums.js';
import { playlistsRoutes } from './routes/playlists.js';
import { artistsRoutes } from './routes/artists.js';
import { radioRoutes } from './routes/radio.js';
import { catalogRoutes } from './routes/catalog.js';
import { searchRoutes } from './routes/search.js';
import { accountRoutes } from './routes/account.js';
import { coversRoutes } from './routes/covers.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (config.corsAllowAll || !origin) {
        callback(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin not allowed: ${origin}`), false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Range',
      'Origin',
    ],
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Type',
    ],
    credentials: true,
    preflight: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  await registerYandex(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation error',
        details: error.flatten(),
      });
    }
    if (error instanceof YandexMusicApiError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        details: error.body,
      });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api', async () => ({
    name: 'ART Music Backend',
    docs: 'https://ym.marshal.dev',
    endpoints: {
      tracks: {
        'POST /api/tracks': 'Batch track metadata (body: { trackIds })',
        'GET /api/tracks/:trackId': 'Full track info',
        'GET /api/tracks/:trackId/stream': 'Audio stream (proxy)',
        'GET /api/tracks/:trackId/stream-url': 'Direct MP3 URL (~1 min TTL)',
        'GET /api/tracks/:trackId/lyrics': 'Lyrics (separate request)',
        'GET /api/tracks/:trackId/clips': 'Video clips (separate request)',
      },
      albums: {
        'GET /api/albums/:albumId': 'Album (?withTracks=false for metadata only)',
        'POST /api/albums': 'Batch albums (body: { albumIds })',
      },
      playlists: {
        'GET /api/playlists/:userId/:kind': 'Playlist with tracks',
        'GET /api/users/:userId/playlists': 'User playlist list',
        'POST /api/users/:userId/playlists': 'Playlists by kinds (body: { kinds })',
        'GET /api/playlists?ids=uid:kind,...': 'Playlists by ids',
        'POST /api/playlists/batch': 'Short playlists (body: { playlistIds })',
        'GET /api/playlists/uuid/:uuid': 'Playlist by UUID',
      },
      artists: {
        'GET /api/artists/:artistId': 'Artist (?brief=false for short card)',
        'POST /api/artists': 'Batch artists (body: { artistIds })',
        'GET /api/artists/:artistId/tracks': 'Artist tracks',
        'GET /api/artists/:artistId/albums': 'Artist albums',
        'GET /api/artists/:artistId/similar': 'Similar artists',
      },
      catalog: {
        'GET /api/genres': 'Music genres',
        'GET /api/tags/:tagId': 'Tag / mix playlists',
        'GET /api/metatags': 'Metatags tree (moods, activities)',
        'GET /api/metatags/:id': 'Metatag page',
        'GET /api/metatags/:id/albums|artists|playlists': 'Metatag lists',
        'GET /api/landing': 'Landing blocks',
        'GET /api/landing/chart': 'Chart (?type=russia|world)',
        'GET /api/landing/new-releases': 'New albums',
        'GET /api/landing/new-playlists': 'New playlists',
        'GET /api/feed': 'Smart playlists feed',
      },
      search: {
        'GET /api/search': 'Search (?q=&type=all|track|album|artist|playlist)',
        'GET /api/search/suggest': 'Search suggestions',
      },
      account: {
        'GET /api/account': 'Current account (uid, plus, …)',
        'GET /api/me/tracks': 'My liked tracks («Мои треки»). ?full=true for full metadata',
      },
      covers: {
        'GET /api/covers/resolve': 'coverUri → URL (?uri=&size=400x400, ?redirect=true)',
      },
      radio: {
        'GET /api/radio/stations': 'All rotor stations',
        'GET /api/radio/dashboard': 'Recommended stations',
        'GET /api/radio/stations/:stationId': 'Station info',
        'GET /api/radio/stations/:stationId/tracks': 'Station track queue',
        'POST /api/radio/stations/:stationId/start': 'Start radio + first tracks',
        'POST /api/radio/stations/:stationId/feedback': 'Playback feedback',
      },
    },
    auth:
      'Authorization: OAuth <token> or env YANDEX_MUSIC_TOKEN (see https://ym.marshal.dev)',
  }));

  await app.register(tracksRoutes);
  await app.register(albumsRoutes);
  await app.register(playlistsRoutes);
  await app.register(artistsRoutes);
  await app.register(radioRoutes);
  await app.register(catalogRoutes);
  await app.register(searchRoutes);
  await app.register(accountRoutes);
  await app.register(coversRoutes);

  return app;
}
