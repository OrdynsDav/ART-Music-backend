import {
  pickBestDownloadInfo,
  resolveStreamUrlFromDownloadInfo,
  type DownloadInfoItem,
} from './stream.js';
import { getSignRequest } from './sign.js';

const BASE_URL = 'https://api.music.yandex.net';

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

  // ——— Albums ———

  async getAlbum(albumId: string | number) {
    const ids = Array.isArray(albumId) ? albumId : [String(albumId)];
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

  // ——— Artists ———

  async getArtists(artistIds: string[]) {
    const body = new URLSearchParams();
    for (const id of artistIds) body.append('artist-ids', id);
    return this.request<unknown[]>('POST', '/artists', { body });
  }

  async getArtistBriefInfo(artistId: string | number) {
    return this.request<unknown>('GET', `/artists/${artistId}/brief-info`);
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
