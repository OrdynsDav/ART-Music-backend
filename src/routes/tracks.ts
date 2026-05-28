import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const trackIdsBody = z.object({
  trackIds: z.array(z.string()).min(1),
  withPositions: z.boolean().optional(),
});

export async function tracksRoutes(app: FastifyInstance) {
  app.post('/api/tracks', async (request) => {
    const body = trackIdsBody.parse(request.body);
    const client = app.createYandexClient(request);
    const tracks = await client.getTracks(
      body.trackIds,
      body.withPositions ?? true,
    );
    return { tracks };
  });

  app.get<{ Params: { trackId: string } }>(
    '/api/tracks/:trackId',
    async (request) => {
      const client = app.createYandexClient(request);
      const track = await client.getTrackFullInfo(request.params.trackId);
      return { track };
    },
  );

  app.get<{ Params: { trackId: string } }>(
    '/api/tracks/:trackId/stream-url',
    async (request) => {
      const client = app.createYandexClient(request);
      const codec =
        (request.query as { codec?: string }).codec ?? 'mp3';
      const url = await client.getTrackStreamUrl(
        request.params.trackId,
        codec,
      );
      return {
        url,
        expiresInSeconds: 60,
        note: 'Direct URL expires in ~1 minute. Use /stream for playback.',
      };
    },
  );

  app.get<{ Params: { trackId: string } }>(
    '/api/tracks/:trackId/stream',
    async (request, reply) => {
      const client = app.createYandexClient(request);
      const codec =
        (request.query as { codec?: string }).codec ?? 'mp3';
      const url = await client.getTrackStreamUrl(
        request.params.trackId,
        codec,
      );

      const range = request.headers.range;
      const upstream = await fetch(url, {
        headers: range ? { Range: range } : undefined,
      });
      if (!upstream.ok && upstream.status !== 206) {
        return reply.status(502).send({
          error: 'Upstream stream failed',
          status: upstream.status,
        });
      }
      if (!upstream.body) {
        return reply.status(502).send({ error: 'Upstream stream empty' });
      }

      const contentType =
        upstream.headers.get('content-type') ?? 'audio/mpeg';
      reply.header('Content-Type', contentType);
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) reply.header('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) reply.header('Content-Range', contentRange);
      reply.header('Accept-Ranges', 'bytes');
      if (upstream.status === 206) reply.status(206);

      return reply.send(upstream.body);
    },
  );

  app.get<{ Params: { trackId: string } }>(
    '/api/tracks/:trackId/lyrics',
    async (request) => {
      const client = app.createYandexClient(request);
      const format =
        ((request.query as { format?: string }).format as 'TEXT' | 'LRC') ??
        'TEXT';
      const lyrics = await client.getTrackLyrics(
        request.params.trackId,
        format,
      );
      return { lyrics };
    },
  );
}
