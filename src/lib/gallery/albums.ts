import { SEASON_STOPS } from '../../data/season-stops';
import type { GalleryAlbum } from './types';

/** Gallery URLs only. Kept off the events data so tour-stop pages stay unchanged. */
const GALLERY_SLUGS: Record<string, string> = {
	'stop-1': 'ocala-open',
	'stop-2': 'sarasota-open',
	'stop-3': 'port-st-lucie-open',
	'stop-4': 'eustis-outdoor-open',
};

function yearFrom(dateFull: string): number {
	const match = dateFull.match(/\b(20\d{2})\b/);
	return match ? Number(match[1]) : new Date().getFullYear();
}

function dateLabel(dateFull: string): string {
	return dateFull.split('·')[0]?.trim() || dateFull;
}

/** Gallery albums = Grand Prix events (stops). Upload must pick one. */
export const GALLERY_ALBUMS: GalleryAlbum[] = SEASON_STOPS.map((stop) => ({
	id: stop.id,
	slug: GALLERY_SLUGS[stop.id] ?? stop.id,
	label: stop.eventName,
	name: stop.eventName,
	date: dateLabel(stop.dateFull),
	location: stop.cityLine,
	coverImage: stop.image,
	description: stop.teaser,
	year: yearFrom(stop.dateFull),
}));

export function isValidAlbumId(album: string): boolean {
	return GALLERY_ALBUMS.some((a) => a.id === album);
}

export function albumLabel(albumId: string): string {
	return GALLERY_ALBUMS.find((a) => a.id === albumId)?.label ?? albumId;
}

export function albumById(id: string): GalleryAlbum | undefined {
	return GALLERY_ALBUMS.find((a) => a.id === id);
}

export function albumBySlug(slug: string): GalleryAlbum | undefined {
	return GALLERY_ALBUMS.find((a) => a.slug === slug);
}
