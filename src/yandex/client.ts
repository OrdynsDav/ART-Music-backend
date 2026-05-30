import {
  pickBestDownloadInfo,
  resolveStreamUrlFromDownloadInfo,
  type DownloadInfoItem,
} from './stream.js';
import { getSignRequest } from './sign.js';

const BASE_URL = 'https://api.music.yandex.net';

function yandexClipEmbedUrl(playerId: string | number): string {
  return `https://frontend.vh.yandex.ru/player/${playerId}?no_ad=true&service=ya-video&from=ya-music-android`;
}

function normalizeTrackClip(raw: Record<string, unknown>) {
  const playerId =
    raw.playerId ?? raw.providerVideoId ?? raw.provider_video_id;
  const embedUrl =
    raw.embedUrl ??
    raw.embed_url ??
    (playerId != null ? yandexClipEmbedUrl(String(playerId)) : undefined);

  return {
    clipId: raw.clipId,
    title: raw.title,
    thumbnail: raw.thumbnail ?? raw.cover,
    previewUrl: raw.previewUrl,
    duration: raw.duration,
    playerId,
    uuid: raw.uuid,
    embedUrl,
    url: raw.url,
    provider: raw.provider,
    trackIds: raw.trackIds,
    artists: raw.artists,
  };
}

/** Сегмент пути с `:` (например `user:onyourwave`) нужно кодировать. */
function apiPath(...segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join('/');
}

/** Формат timestamp для rotor/feedback (см. OpenAPI yandex-music-open-api). */
export function formatRotorTimestamp(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

export class YandexMusicApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'YandexMusicApiError';
  }
}

export interface YandexClientOptions {
  token: string;
  language?: string;
}

type ApiResult<T> = T;

interface ApiEnvelope {
  result?: unknown;
  error?: string;
  errorDescription?: string;
}

export class YandexMusicClient {
  private readonly headers: Record<string, string>;

  constructor(private readonly options: YandexClientOptions) {
    this.headers = {
      Authorization: `OAuth ${options.token}`,
      'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621',
      'User-Agent': 'Yandex-Music-API',
      'Accept-Language': options.language ?? 'ru',
    };
  }

  private buildUrl(
    path: string,
    searchParams?: Record<string, string | undefined>,
  ): URL {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, BASE_URL);
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    return url;
  }

  private async request<T>(
    method: string,
    path: string,
    init?: {
      searchParams?: Record<string, string | undefined>;
      body?: URLSearchParams | Record<string, string>;
      json?: Record<string, unknown>;
    },
  ): Promise<ApiResult<T>> {
    const url = this.buildUrl(path, init?.searchParams);
    const headers: Record<string, string> = { ...this.headers };
    let body: string | undefined;

    if (init?.json) {
      headers['Content-Type'] = 'application/json';
      headers.Accept = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init?.body instanceof URLSearchParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = init.body.toString();
    } else if (init?.body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(init.body).toString();
    }

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Network request failed';
      throw new YandexMusicApiError(message, 502, { cause: String(cause) });
    }
    const text = await res.text();

    if (!res.ok) {
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* raw */
      }
      const msg =
        typeof parsed === 'object' &&
          parsed !== null &&
          'errorDescription' in parsed
          ? String((parsed as ApiEnvelope).errorDescription)
          : `Yandex API error ${res.status}`;
      throw new YandexMusicApiError(msg, res.status, parsed);
    }

    if (!text) return undefined as ApiResult<T>;

    const json = JSON.parse(text) as ApiEnvelope & { result?: T };
    if (json.result !== undefined) return json.result as ApiResult<T>;
    return json as ApiResult<T>;
  }

  private async requestRaw(url: string): Promise<string> {
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new YandexMusicApiError(
        `Failed to fetch resource: ${res.status}`,
        res.status,
      );
    }
    return res.text();
  }

  // ——— Tracks ———

  async getTracks(trackIds: string[], withPositions = true) {
    const body = new URLSearchParams();
    for (const id of trackIds) {
      body.append('track-ids', id);
    }
    body.set('with-positions', String(withPositions));
    return this.request<unknown[]>('POST', '/tracks/', { body });
  }

  async getTrackFullInfo(trackId: string) {
    return this.request<unknown>(
      'GET',
      `/tracks/${apiPath(trackId)}/full-info`,
    );
  }

  async getTracksDownloadInfo(trackId: string) {
    const raw = await this.request<Record<string, unknown>[]>(
      'GET',
      `/tracks/${apiPath(trackId)}/download-info`,
    );
    return raw.map(
      (item): DownloadInfoItem => ({
        codec: String(item.codec ?? ''),
        bitrateInKbps: Number(item.bitrateInKbps ?? item.bitrate_in_kbps ?? 0),
        gain: Boolean(item.gain),
        preview: Boolean(item.preview),
        downloadInfoUrl: String(
          item.downloadInfoUrl ?? item.download_info_url ?? '',
        ),
        direct: Boolean(item.direct),
      }),
    );
  }

  async getTrackStreamUrl(trackId: string, codec = 'mp3'): Promise<string> {
    const infos = await this.getTracksDownloadInfo(trackId);
    const picked = pickBestDownloadInfo(infos, codec);
    const xml = await this.requestRaw(picked.downloadInfoUrl);
    return resolveStreamUrlFromDownloadInfo(picked, xml);
  }

  async getTrackLyrics(trackId: string, format: 'TEXT' | 'LRC' = 'TEXT') {
    const { timestamp, sign } = getSignRequest(trackId);
    return this.request<unknown>('GET', `/tracks/${apiPath(trackId)}/lyrics`, {
      searchParams: {
        format,
        timeStamp: String(timestamp),
        sign,
      },
    });
  }

  async getTrackSupplement(trackId: string) {
    return this.request<unknown>(
      'GET',
      `/tracks/${apiPath(trackId)}/supplement`,
    );
  }

  async getClipsByIds(clipIds: Array<string | number>) {
    if (clipIds.length === 0) return [];
    return this.request<Record<string, unknown>[]>('GET', '/clips', {
      searchParams: { 'clip-ids': clipIds.map(String).join(',') },
    });
  }

  /** Клипы трека: supplement.clips → supplement.videos → track.clipIds */
  async getTrackClips(trackId: string) {
    const supplement = (await this.getTrackSupplement(trackId)) as
      | Record<string, unknown>
      | null
      | undefined;

    const fromSupplement = supplement?.clips ?? supplement?.videos;
    if (Array.isArray(fromSupplement) && fromSupplement.length > 0) {
      return fromSupplement.map((item) =>
        normalizeTrackClip(item as Record<string, unknown>),
      );
    }

    const tracks = await this.getTracks([trackId]);
    const track = tracks[0] as Record<string, unknown> | undefined;
    const clipIds = track?.clipIds;
    if (!Array.isArray(clipIds) || clipIds.length === 0) return [];

    const clips = await this.getClipsByIds(
      clipIds.filter((id): id is string | number => id != null),
    );
    return clips.map((item) => normalizeTrackClip(item));
  }

  // ——— Albums ———

  async getAlbum(albumIds: string | number | string[]) {
    const ids = Array.isArray(albumIds)
      ? albumIds
      : [String(albumIds)];
    const body = new URLSearchParams();
    for (const id of ids) body.append('album-ids', id);
    return this.request<unknown[]>('POST', '/albums', { body });
  }

  async getAlbumWithTracks(albumId: string | number) {
    return this.request<unknown>('GET', `/albums/${albumId}/with-tracks`);
  }

  // ——— Playlists ———

  async getPlaylist(userId: string | number, kind: string | number) {
    return this.request<unknown>(
      'GET',
      `/users/${userId}/playlists/${kind}`,
    );
  }

  async getUserPlaylistsList(userId: string | number) {
    return this.request<unknown[]>('GET', `/users/${userId}/playlists/list`);
  }

  async getUserPlaylistsByKinds(
    userId: string | number,
    kinds: Array<string | number>,
  ) {
    const body = new URLSearchParams();
    for (const kind of kinds) body.append('kinds', String(kind));
    return this.request<unknown[]>('POST', `/users/${userId}/playlists`, {
      body,
    });
  }

  async getPlaylistsByIds(playlistIds: string | string[]) {
    const ids = Array.isArray(playlistIds) ? playlistIds.join(',') : playlistIds;
    return this.request<unknown>('GET', '/playlists', {
      searchParams: { playlistIds: ids },
    });
  }

  async getPlaylistsListShort(playlistIds: string[]) {
    const body = new URLSearchParams();
    for (const id of playlistIds) body.append('playlist-ids', id);
    return this.request<unknown[]>('POST', '/playlists/list', { body });
  }

  async getPlaylistByUuid(playlistUuid: string) {
    return this.request<unknown>('GET', `/playlist/${playlistUuid}`);
  }

  // ——— Artists ———

  async getArtists(artistIds: string[]) {
    const body = new URLSearchParams();
    for (const id of artistIds) body.append('artist-ids', id);
    return this.request<unknown[]>('POST', '/artists', { body });
  }

  async getArtistBriefInfo(artistId: string | number) {
    return this.request<unknown>('GET', `/artists/${artistId}/brief-info`);
  }

  async getArtistTracks(
    artistId: string | number,
    page = 0,
    pageSize = 20,
  ) {
    return this.request<unknown>('GET', `/artists/${artistId}/tracks`, {
      searchParams: { page: String(page), 'page-size': String(pageSize) },
    });
  }

  async getArtistDirectAlbums(
    artistId: string | number,
    options?: { page?: number; pageSize?: number; sortBy?: string },
  ) {
    const page = options?.page ?? 0;
    const pageSize = options?.pageSize ?? 20;
    return this.request<unknown>(
      'GET',
      `/artists/${artistId}/direct-albums`,
      {
        searchParams: {
          page: String(page),
          'page-size': String(pageSize),
          'sort-by': options?.sortBy ?? 'year',
        },
      },
    );
  }

  async getArtistSimilar(artistId: string | number) {
    return this.request<unknown>('GET', `/artists/${artistId}/similar`);
  }

  // ——— Genres, tags, metatags ———

  async getGenres() {
    return this.request<unknown[]>('GET', '/genres');
  }

  async getTag(tagId: string) {
    return this.request<unknown>('GET', `/tags/${apiPath(tagId)}/playlist-ids`);
  }

  async getMetatags() {
    return this.request<unknown>('GET', '/landing3/metatags');
  }

  async getMetatag(
    metatagId: string,
    params?: {
      tracksCount?: number;
      artistsCount?: number;
      albumsCount?: number;
      playlistsCount?: number;
      tracksSortBy?: string;
      albumsSortBy?: string;
    },
  ) {
    const searchParams: Record<string, string | undefined> = {};
    if (params?.tracksCount !== undefined) {
      searchParams.tracksCount = String(params.tracksCount);
    }
    if (params?.artistsCount !== undefined) {
      searchParams.artistsCount = String(params.artistsCount);
    }
    if (params?.albumsCount !== undefined) {
      searchParams.albumsCount = String(params.albumsCount);
    }
    if (params?.playlistsCount !== undefined) {
      searchParams.playlistsCount = String(params.playlistsCount);
    }
    if (params?.tracksSortBy) searchParams.tracksSortBy = params.tracksSortBy;
    if (params?.albumsSortBy) searchParams.albumsSortBy = params.albumsSortBy;
    return this.request<unknown>('GET', `/metatags/${apiPath(metatagId)}`, {
      searchParams,
    });
  }

  async getMetatagAlbums(
    metatagId: string,
    options?: { offset?: number; limit?: number; sortBy?: string; period?: string },
  ) {
    const searchParams: Record<string, string | undefined> = {
      offset: String(options?.offset ?? 0),
      limit: String(options?.limit ?? 25),
    };
    if (options?.sortBy) searchParams.sortBy = options.sortBy;
    if (options?.period) searchParams.period = options.period;
    return this.request<unknown>(
      'GET',
      `/metatags/${apiPath(metatagId)}/albums`,
      { searchParams },
    );
  }

  async getMetatagArtists(
    metatagId: string,
    options?: {
      period?: string;
      offset?: number;
      limit?: number;
      sortBy?: string;
    },
  ) {
    const searchParams: Record<string, string | undefined> = {
      period: options?.period ?? 'week',
      offset: String(options?.offset ?? 0),
      limit: String(options?.limit ?? 25),
    };
    if (options?.sortBy) searchParams.sortBy = options.sortBy;
    return this.request<unknown>(
      'GET',
      `/metatags/${apiPath(metatagId)}/artists`,
      { searchParams },
    );
  }

  async getMetatagPlaylists(
    metatagId: string,
    options?: { offset?: number; limit?: number; sortBy?: string },
  ) {
    const searchParams: Record<string, string | undefined> = {
      offset: String(options?.offset ?? 0),
      limit: String(options?.limit ?? 25),
    };
    if (options?.sortBy) searchParams.sortBy = options.sortBy;
    return this.request<unknown>(
      'GET',
      `/metatags/${apiPath(metatagId)}/playlists`,
      { searchParams },
    );
  }

  // ——— Landing & feed ———

  async getLanding(blocks: string | string[]) {
    const value = Array.isArray(blocks) ? blocks.join(',') : blocks;
    return this.request<unknown>('GET', '/landing3', {
      searchParams: { blocks: value },
    });
  }

  async getChart(chartType: 'russia' | 'world' | '' = '') {
    const path =
      chartType && chartType.length > 0
        ? `/landing3/chart/${chartType}`
        : '/landing3/chart';
    return this.request<unknown>('GET', path);
  }

  async getNewReleases() {
    return this.request<unknown>('GET', '/landing3/new-releases');
  }

  async getNewPlaylistsLanding() {
    return this.request<unknown>('GET', '/landing3/new-playlists');
  }

  async getPodcastsLanding() {
    return this.request<unknown>('GET', '/landing3/podcasts');
  }

  async getFeed() {
    return this.request<unknown>('GET', '/feed');
  }

  // ——— Search ———

  async search(
    text: string,
    options?: {
      type?: string;
      page?: number;
      nocorrect?: boolean;
      playlistInBest?: boolean;
    },
  ) {
    return this.request<unknown>('GET', '/search', {
      searchParams: {
        text,
        type: options?.type ?? 'all',
        page: String(options?.page ?? 0),
        nocorrect: String(options?.nocorrect ?? false),
        'playlist-in-best': String(options?.playlistInBest ?? true),
      },
    });
  }

  async searchSuggest(part: string) {
    return this.request<unknown>('GET', '/search/suggest', {
      searchParams: { part },
    });
  }

  // ——— Account & library ———

  async getAccountStatus() {
    return this.request<unknown>('GET', '/account/status');
  }

  async resolveAccountUid(): Promise<number> {
    const status = (await this.getAccountStatus()) as {
      account?: { uid?: number };
    };
    const uid = status?.account?.uid;
    if (uid == null) {
      throw new YandexMusicApiError('Cannot resolve account uid', 401);
    }
    return uid;
  }

  /** «Мои треки» / «Мне нравится» — лайкнутые треки пользователя */
  async getUserLikedTracks(
    userId: string | number,
    ifModifiedSinceRevision = 0,
  ) {
    const result = await this.request<{
      library?: {
        tracks?: unknown[];
        revision?: number;
        uid?: number;
        playlistUuid?: string;
      };
    }>('GET', `/users/${userId}/likes/tracks`, {
      searchParams: {
        'if-modified-since-revision': String(ifModifiedSinceRevision),
      },
    });
    return result?.library ?? { tracks: [], revision: 0 };
  }

  // ——— Radio (rotor) ———

  async getRotorStationsList(language?: string) {
    return this.request<unknown[]>('GET', '/rotor/stations/list', {
      searchParams: { language: language ?? this.options.language },
    });
  }

  async getRotorDashboard() {
    return this.request<unknown>('GET', '/rotor/stations/dashboard');
  }

  async getRotorStationInfo(stationId: string) {
    return this.request<unknown[]>(
      'GET',
      `/rotor/station/${apiPath(stationId)}/info`,
    );
  }

  async getRotorStationTracks(
    stationId: string,
    options?: { queue?: string; settings2?: boolean },
  ) {
    const searchParams: Record<string, string | undefined> = {};
    if (options?.settings2 !== false) searchParams.settings2 = 'true';
    if (options?.queue) searchParams.queue = options.queue;
    return this.request<unknown>(
      'GET',
      `/rotor/station/${apiPath(stationId)}/tracks`,
      { searchParams },
    );
  }

  async sendRotorFeedback(
    stationId: string,
    type: 'radioStarted' | 'trackStarted' | 'trackFinished' | 'skip',
    data: {
      from?: string;
      batchId?: string;
      trackId?: string;
      totalPlayedSeconds?: number;
    } = {},
  ) {
    const searchParams: Record<string, string | undefined> = {};
    if (data.batchId) searchParams['batch-id'] = data.batchId;

    const json: Record<string, unknown> = {
      type,
      timestamp: formatRotorTimestamp(),
    };
    if (data.from) json.from = data.from;
    if (data.trackId) json.trackId = data.trackId;
    if (data.totalPlayedSeconds !== undefined) {
      json.totalPlayedSeconds = data.totalPlayedSeconds;
    }

    return this.request<string>(
      'POST',
      `/rotor/station/${apiPath(stationId)}/feedback`,
      { searchParams, json },
    );
  }

  async startRadio(stationId: string, from = 'art-music-backend') {
    await this.sendRotorFeedback(stationId, 'radioStarted', { from });
    return this.getRotorStationTracks(stationId);
  }
}
