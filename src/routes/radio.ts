import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const feedbackBody = z.object({
  type: z.enum(['radioStarted', 'trackStarted', 'trackFinished', 'skip']),
  from: z.string().optional(),
  batchId: z.string().optional(),
  trackId: z.string().optional(),
  totalPlayedSeconds: z.number().optional(),
});

export async function radioRoutes(app: FastifyInstance) {
  app.get('/api/radio/stations', async (request) => {
    const client = app.createYandexClient(request);
    const language = (request.query as { language?: string }).language;
    const stations = await client.getRotorStationsList(language);
    return { stations };
  });

  app.get('/api/radio/dashboard', async (request) => {
    const client = app.createYandexClient(request);
    const dashboard = await client.getRotorDashboard();
    return { dashboard };
  });

  app.get<{ Params: { stationId: string } }>(
    '/api/radio/stations/:stationId',
    async (request) => {
      const client = app.createYandexClient(request);
      const station = await client.getRotorStationInfo(
        request.params.stationId,
      );
      return { station };
    },
  );

  app.get<{ Params: { stationId: string } }>(
    '/api/radio/stations/:stationId/tracks',
    async (request) => {
      const client = app.createYandexClient(request);
      const q = request.query as { queue?: string; settings2?: string };
      const tracks = await client.getRotorStationTracks(
        request.params.stationId,
        {
          queue: q.queue,
          settings2: q.settings2 !== 'false',
        },
      );
      return { radio: tracks };
    },
  );

  app.post<{ Params: { stationId: string } }>(
    '/api/radio/stations/:stationId/start',
    async (request) => {
      const client = app.createYandexClient(request);
      const from =
        (request.body as { from?: string } | undefined)?.from ??
        'art-music-backend';
      const radio = await client.startRadio(request.params.stationId, from);
      return { radio };
    },
  );

  app.post<{ Params: { stationId: string } }>(
    '/api/radio/stations/:stationId/feedback',
    async (request) => {
      const body = feedbackBody.parse(request.body);
      const client = app.createYandexClient(request);
      await client.sendRotorFeedback(request.params.stationId, body.type, {
        from: body.from,
        batchId: body.batchId,
        trackId: body.trackId,
        totalPlayedSeconds: body.totalPlayedSeconds,
      });
      return { ok: true };
    },
  );
}
