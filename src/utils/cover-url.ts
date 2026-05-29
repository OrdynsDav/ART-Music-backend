const DEFAULT_COVER_SIZE = '400x400';

/** coverUri / ogImage из API → рабочий URL обложки */
export function buildCoverUrl(
  coverUri: string | null | undefined,
  size = DEFAULT_COVER_SIZE,
): string | null {
  if (!coverUri?.trim()) return null;

  let uri = coverUri.trim();
  if (uri.startsWith('https://')) uri = uri.slice(8);
  else if (uri.startsWith('http://')) uri = uri.slice(7);

  return `https://${uri.replace('%%', size)}`;
}

export const COVER_SIZES = {
  thumb: '100x100',
  small: '200x200',
  medium: '400x400',
  large: '600x600',
} as const;
