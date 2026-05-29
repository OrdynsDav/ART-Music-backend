/** trackId:albumId из TrackShort (лайки, радио, плейлисты) */
export function trackIdFromShort(track: {
  id?: string | number;
  albumId?: string | number;
  albums?: Array<{ id?: string | number }>;
}): string | null {
  if (track.id == null) return null;
  const albumId = track.albums?.[0]?.id ?? track.albumId;
  return albumId != null ? `${track.id}:${albumId}` : String(track.id);
}
