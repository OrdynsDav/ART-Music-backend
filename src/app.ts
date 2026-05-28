import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { registerYandex } from './plugins/yandex.js';
import { YandexMusicApiError } from './yandex/client.js';
import { tracksRoutes } from './routes/tracks.js';
import { albumsRoutes } from './routes/albums.js';
import { playlistsRoutes } from './routes/playlists.js';
import { artistsRoutes } from './routes/artists.js';
import { radioRoutes } from './routes/radio.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
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
        'GET /api/tracks/:trackId/lyrics': 'Lyrics',
      },
      albums: {
        'GET /api/albums/:albumId': 'Album (?withTracks=false for metadata only)',
      },
      playlists: {
        'GET /api/playlists/:userId/:kind': 'Playlist with tracks',
      },
      artists: {
        'GET /api/artists/:artistId': 'Artist (?brief=false for short card)',
        'POST /api/artists': 'Batch artists (body: { artistIds })',
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

  return app;
}
