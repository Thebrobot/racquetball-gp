import { put, del, get, list, type ListBlobResultBlob } from '@vercel/blob';
import { isValidAlbumId } from './albums';
import type { GalleryIndex, GalleryPhoto } from './types';

export const GALLERY_INDEX_PATH = 'gallery/index.json';

const emptyIndex = (): GalleryIndex => ({ version: 1, photos: [] });

function hasBlobToken(): boolean {
	return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function parseIndex(raw: unknown): GalleryIndex | null {
	const data = raw as GalleryIndex;
	if (!data || data.version !== 1 || !Array.isArray(data.photos)) return null;
	return data;
}

async function readStreamText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	if (!stream) return '';
	return new Response(stream).text();
}

async function listAllGalleryBlobs(): Promise<ListBlobResultBlob[]> {
	const blobs: ListBlobResultBlob[] = [];
	let cursor: string | undefined;
	do {
		const result = await list({ prefix: 'gallery/', cursor, limit: 1000 });
		blobs.push(...result.blobs);
		cursor = result.hasMore ? result.cursor : undefined;
	} while (cursor);
	return blobs;
}

function photoFromBlob(blob: ListBlobResultBlob): GalleryPhoto | null {
	if (blob.pathname === GALLERY_INDEX_PATH) return null;
	// gallery/{album}/{id}.jpg
	const parts = blob.pathname.split('/');
	if (parts.length < 3 || parts[0] !== 'gallery') return null;
	const album = parts[1];
	const file = parts.slice(2).join('/');
	if (!/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file)) return null;
	const id = file.replace(/\.[^.]+$/, '');
	if (!id) return null;
	return {
		id,
		url: blob.url,
		pathname: blob.pathname,
		album: isValidAlbumId(album) ? album : album,
		createdAt: (blob.uploadedAt instanceof Date ? blob.uploadedAt : new Date(blob.uploadedAt)).toISOString(),
	};
}

/** Optional caption/album overrides from index.json (not required for photos to appear). */
async function readMetaIndex(): Promise<GalleryIndex> {
	try {
		const fresh = await get(GALLERY_INDEX_PATH, { access: 'public', useCache: false });
		if (fresh?.stream) {
			const parsed = parseIndex(JSON.parse(await readStreamText(fresh.stream)));
			if (parsed) return parsed;
		}
	} catch {
		/* ignore */
	}
	return emptyIndex();
}

/**
 * Source of truth = files actually in Blob under gallery/.
 * That way a successful upload shows up immediately without CDN index lag.
 */
export async function readGalleryIndex(): Promise<GalleryIndex> {
	if (!hasBlobToken()) return emptyIndex();

	try {
		const [blobs, meta] = await Promise.all([listAllGalleryBlobs(), readMetaIndex()]);
		const metaById = new Map(meta.photos.map((p) => [p.id, p]));

		const photos = blobs
			.map(photoFromBlob)
			.filter((p): p is GalleryPhoto => Boolean(p))
			.map((p) => {
				const m = metaById.get(p.id);
				return {
					...p,
					album: m?.album && isValidAlbumId(m.album) ? m.album : p.album,
					caption: m?.caption,
					createdAt: m?.createdAt || p.createdAt,
				};
			})
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

		return { version: 1, photos };
	} catch {
		// Fall back to meta-only if listing fails
		return readMetaIndex();
	}
}

export async function writeGalleryIndex(index: GalleryIndex): Promise<void> {
	await put(GALLERY_INDEX_PATH, JSON.stringify(index), {
		access: 'public',
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: 'application/json',
		cacheControlMaxAge: 60,
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
	const meta = await readMetaIndex();
	meta.photos = [photo, ...meta.photos.filter((p) => p.id !== photo.id)];
	await writeGalleryIndex(meta);
	// Return the live file-based catalog (includes the new blob once listed).
	return readGalleryIndex();
}

export async function removePhoto(id: string): Promise<GalleryPhoto | undefined> {
	const current = await readGalleryIndex();
	const photo = current.photos.find((p) => p.id === id);
	if (!photo) return undefined;

	const meta = await readMetaIndex();
	meta.photos = meta.photos.filter((p) => p.id !== id);
	await writeGalleryIndex(meta);

	try {
		await del(photo.url);
	} catch {
		// Index already updated; blob may already be gone
	}
	return photo;
}
