import { createHmac } from 'node:crypto';

const DEFAULT_SIGN_KEY = 'p93jhgh689SBReK6ghtw62';

export function convertTrackIdToNumber(trackId: string | number): number {
  if (typeof trackId === 'number') return trackId;
  return Number.parseInt(trackId.split(':')[0]!, 10);
}

export function getSignRequest(
  trackId: string | number,
  key = DEFAULT_SIGN_KEY,
): { timestamp: number; sign: string } {
  const id = convertTrackIdToNumber(trackId);
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${id}${timestamp}`;
  const sign = createHmac('sha256', key)
    .update(message)
    .digest('base64');
  return { timestamp, sign };
}
