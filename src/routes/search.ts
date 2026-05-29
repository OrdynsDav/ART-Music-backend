import type { FastifyInstance } from 'fastify';
import { numQuery } from '../utils/query.js';

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/search', async (request, reply) => {
    const q = request.query as {
      q?: string;
      text?: string;
      type?: string;
      page?: string;
      nocorrect?: string;
    };
    const text = q.q ?? q.text;
    if (!text) {
      return reply.status(400).send({ error: 'Query "q" or "text" is required' });
    }
    const client = app.createYandexClient(request);
    const result = await client.search(text, {
      type: q.type ?? 'all',
      page: numQuery(q.page, 0),
      nocorrect: q.nocorrect === 'true',
    });
    return { search: result };
  });

  app.get('/api/search/suggest', async (request, reply) => {
    const q = request.query as { part?: string; q?: string };
    const part = q.part ?? q.q;
    if (!part) {
      return reply.status(400).send({ error: 'Query "part" or "q" is required' });
    }
    const client = app.createYandexClient(request);
    const suggestions = await client.searchSuggest(part);
    return { suggestions };
  });
}
