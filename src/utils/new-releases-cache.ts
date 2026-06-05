import type { YandexMusicClient } from '../yandex/client.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

type NewReleasesResult = {
  newReleases?: unknown[];
  [key: string]: unknown;
};

type CacheEntry = {
  releases: NewReleasesResult;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export const DEFAULT_NEW_RELEASES_PAGE_SIZE = 10;
export const MAX_NEW_RELEASES_PAGE_SIZE = 10;

function cacheKey(client: YandexMusicClient): string {
  return client.newReleasesCacheKey();
}

async function getAllNewReleases(
  client: YandexMusicClient,
): Promise<NewReleasesResult> {
  const key = cacheKey(client);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.releases;
  }

  const releases = (await client.getNewReleases()) as NewReleasesResult;
  const normalized: NewReleasesResult = {
    ...releases,
    newReleases: Array.isArray(releases?.newReleases)
      ? releases.newReleases
      : [],
  };
  cache.set(key, { releases: normalized, expiresAt: now + CACHE_TTL_MS });
  return normalized;
}

export type NewReleasesPage = {
  releases: NewReleasesResult;
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
};

export async function getNewReleasesPage(
  client: YandexMusicClient,
  options: { offset?: number; limit?: number },
): Promise<NewReleasesPage> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_NEW_RELEASES_PAGE_SIZE, 1),
    MAX_NEW_RELEASES_PAGE_SIZE,
  );

  const all = await getAllNewReleases(client);
  const ids = all.newReleases ?? [];
  const total = ids.length;
  const newReleases = ids.slice(offset, offset + limit);
  const nextOffset = offset + newReleases.length;

  return {
    releases: {
      ...all,
      newReleases,
    },
    pagination: {
      offset,
      limit,
      total,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    },
  };
}
