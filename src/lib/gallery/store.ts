import { put, del, list } from '@vercel/blob';
import type { GalleryIndex, GalleryPhoto } from './types';

export const GALLERY_INDEX_PATH = 'gallery/index.json';

const emptyIndex = (): GalleryIndex => ({ version: 1, photos: [] });

function hasBlobToken(): boolean {
	return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function readGalleryIndex(): Promise<GalleryIndex> {
	if (!hasBlobToken()) return emptyIndex();

	try {
		const result = await list({ prefix: GALLERY_INDEX_PATH, limit: 10 });
		const match = result.blobs.find((b) => b.pathname === GALLERY_INDEX_PATH);
		if (!match) return emptyIndex();

		const res = await fetch(`${match.url}${match.url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
			cache: 'no-store',
		});
		if (!res.ok) return emptyIndex();
		const data = (await res.json()) as GalleryIndex;
		if (!data || data.version !== 1 || !Array.isArray(data.photos)) return emptyIndex();
		return data;
	} catch {
		return emptyIndex();
	}
}

export async function writeGalleryIndex(index: GalleryIndex): Promise<void> {
	await put(GALLERY_INDEX_PATH, JSON.stringify(index), {
		access: 'public',
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: 'application/json',
	});
}

export async function getPhotoById(id: string): Promise<GalleryPhoto | undefined> {
	const index = await readGalleryIndex();
	return index.photos.find((p) => p.id === id);
}

export async function getPhotosByIds(ids: string[]): Promise<GalleryPhoto[]> {
	const index = await readGalleryIndex();
	const map = new Map(index.photos.map((p) => [p.id, p]));
	return ids.map((id) => map.get(id)).filter((p): p is GalleryPhoto => Boolean(p));
}

export async function addPhoto(photo: GalleryPhoto): Promise<GalleryIndex> {
	const index = await readGalleryIndex();
	index.photos = [photo, ...index.photos.filter((p) => p.id !== photo.id)];
	await writeGalleryIndex(index);
	return index;
}

export async function removePhoto(id: string): Promise<GalleryPhoto | undefined> {
	const index = await readGalleryIndex();
	const photo = index.photos.find((p) => p.id === id);
	if (!photo) return undefined;
	index.photos = index.photos.filter((p) => p.id !== id);
	await writeGalleryIndex(index);
	try {
		await del(photo.url);
	} catch {
		// Index already updated; blob may already be gone
	}
	return photo;
}
