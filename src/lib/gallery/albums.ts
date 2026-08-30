import { SEASON_STOPS } from '../../data/season-stops';
import type { GalleryAlbum } from './types';

/** Gallery albums = Grand Prix events (stops). Upload must pick one. */
export const GALLERY_ALBUMS: GalleryAlbum[] = SEASON_STOPS.map((stop) => ({
	id: stop.id,
	label: stop.eventName,
}));

export function isValidAlbumId(album: string): boolean {
	return GALLERY_ALBUMS.some((a) => a.id === album);
}

export function albumLabel(albumId: string): string {
	return GALLERY_ALBUMS.find((a) => a.id === albumId)?.label ?? albumId;
}
