import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { put } from '@vercel/blob';
import { isValidAlbumId } from '../../../lib/gallery/albums';
import { isGalleryAuthorized } from '../../../lib/gallery/auth';
import { readImageSize } from '../../../lib/gallery/image-size';
import { addPhoto } from '../../../lib/gallery/store';
import type { GalleryPhoto } from '../../../lib/gallery/types';

export const prerender = false;

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

function extFor(type: string, name: string): string {
	const fromName = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
	if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
	if (type === 'image/png') return 'png';
	if (type === 'image/webp') return 'webp';
	if (type === 'image/gif') return 'gif';
	if (type === 'image/heic' || type === 'image/heif') return 'heic';
	return 'jpg';
}

export const POST: APIRoute = async ({ request, cookies }) => {
	if (!(await isGalleryAuthorized(request, cookies))) {
		return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
		return new Response(JSON.stringify({ error: 'Blob storage is not configured.' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const form = await request.formData();
	const album = String(form.get('album') ?? '');
	const captionRaw = String(form.get('caption') ?? '').trim();
	const caption = captionRaw.slice(0, 200) || undefined;
	const file = form.get('file');

	if (!isValidAlbumId(album)) {
		return new Response(JSON.stringify({ error: 'Select a valid event.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!(file instanceof File)) {
		return new Response(JSON.stringify({ error: 'Missing file.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!ALLOWED.has(file.type) && !file.type.startsWith('image/')) {
		return new Response(JSON.stringify({ error: 'Only image uploads are allowed.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (file.size > MAX_BYTES) {
		return new Response(JSON.stringify({ error: 'File too large (max 12MB).' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const id = randomUUID();
	const ext = extFor(file.type, file.name);
	const pathname = `gallery/${album}/${id}.${ext}`;
	const bytes = new Uint8Array(await file.arrayBuffer());
	const size = readImageSize(bytes);

	const blob = await put(pathname, Buffer.from(bytes), {
		access: 'public',
		addRandomSuffix: false,
		contentType: file.type || 'image/jpeg',
	});

	const photo: GalleryPhoto = {
		id,
		url: blob.url,
		pathname: blob.pathname,
		album,
		caption,
		createdAt: new Date().toISOString(),
		...(size ? { width: size.width, height: size.height } : {}),
	};

	await addPhoto(photo);

	return new Response(JSON.stringify({ ok: true, photo }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
