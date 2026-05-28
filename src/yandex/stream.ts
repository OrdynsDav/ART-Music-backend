import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA';

export interface DownloadInfoItem {
  codec: string;
  bitrateInKbps: number;
  gain: boolean;
  preview: boolean;
  downloadInfoUrl: string;
  direct: boolean;
}

function textFromXml(doc: Record<string, unknown>, tag: string): string | undefined {
  const node = doc[tag];
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && '#text' in node) {
    return String((node as { '#text': string })['#text']);
  }
  return undefined;
}

function downloadInfoRoot(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const nested = parsed['download-info'];
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>;
  }
  return parsed;
}

/** Если API уже вернул готовую ссылку (direct или get-mp3 в downloadInfoUrl). */
export function resolveStreamUrlFromDownloadInfo(
  item: DownloadInfoItem,
  xml?: string,
): string {
  if (
    item.direct &&
    item.downloadInfoUrl.includes('/get-mp3/') &&
    !item.downloadInfoUrl.endsWith('/download-info')
  ) {
    return item.downloadInfoUrl;
  }
  if (!xml) {
    throw new Error('Download info XML is required');
  }
  return buildDirectLinkFromXml(xml);
}

export function buildDirectLinkFromXml(xml: string): string {
  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const doc = downloadInfoRoot(parsed);
  const host = textFromXml(doc, 'host');
  const path = textFromXml(doc, 'path');
  const ts = textFromXml(doc, 'ts');
  const s = textFromXml(doc, 's');
  if (!host || !path || !ts || !s) {
    throw new Error('Invalid download info XML');
  }
  const sign = createHash('md5')
    .update(SIGN_SALT + path.replace(/^\//, '') + s)
    .digest('hex');
  return `https://${host}/get-mp3/${sign}/${ts}${path}`;
}

export function pickBestDownloadInfo(
  items: DownloadInfoItem[],
  preferCodec = 'mp3',
): DownloadInfoItem {
  const mp3 = items.filter((i) => i.codec === preferCodec && !i.preview);
  const pool = mp3.length > 0 ? mp3 : items.filter((i) => !i.preview);
  const list = pool.length > 0 ? pool : items;
  return list.reduce((best, cur) =>
    cur.bitrateInKbps > best.bitrateInKbps ? cur : best,
  );
}
