import type { YandexMusicClient } from '../yandex/client.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  stations: unknown[];
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export const DEFAULT_STATIONS_PAGE_SIZE = 70;
export const MAX_STATIONS_PAGE_SIZE = 100;

function cacheKey(client: YandexMusicClient, language?: string): string {
  return client.rotorStationsCacheKey(language);
}

async function getAllRotorStations(
  client: YandexMusicClient,
  language?: string,
): Promise<unknown[]> {
  const key = cacheKey(client, language);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.stations;
  }

  const stations = await client.getRotorStationsList(language);
  const list = Array.isArray(stations) ? stations : [];
  cache.set(key, { stations: list, expiresAt: now + CACHE_TTL_MS });
  return list;
}

export type RotorStationsPage = {
  stations: unknown[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
};

export async function getRotorStationsPage(
  client: YandexMusicClient,
  options: { language?: string; offset?: number; limit?: number },
): Promise<RotorStationsPage> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_STATIONS_PAGE_SIZE, 1),
    MAX_STATIONS_PAGE_SIZE,
  );

  const all = await getAllRotorStations(client, options.language);
  const total = all.length;
  const stations = all.slice(offset, offset + limit);
  const nextOffset = offset + stations.length;

  return {
    stations,
    pagination: {
      offset,
      limit,
      total,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    },
  };
}
