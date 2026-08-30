import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { isValidAlbumId } from '../../../lib/gallery/albums';
import { isGalleryAuthenticated } from '../../../lib/gallery/auth';
import { addPhoto } from '../../../lib/gallery/store';

export const prerender = false;

/** Client uploads bypass the 4.5MB Vercel Function body limit. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const ALLOWED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif',
];

type UploadMeta = {
	album: string;
	caption?: string;
	id: string;
};

function parseMeta(raw: string | null | undefined): UploadMeta | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { album?: string; caption?: string; id?: string };
		const album = parsed.album?.trim() ?? '';
		if (!isValidAlbumId(album)) return null;
		const caption = parsed.caption ? String(parsed.caption).trim().slice(0, 200) || undefined : undefined;
		const id = parsed.id && typeof parsed.id === 'string' ? parsed.id : randomUUID();
		return { album, caption, id };
	} catch {
		return null;
	}
}

export const POST: APIRoute = async ({ request }) => {
	if (!isGalleryAuthenticated(request)) {
		return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (_pathname, clientPayload) => {
				const meta = parseMeta(clientPayload);
				if (!meta) {
					throw new Error('Select a valid event for this upload.');
				}
				return {
					allowedContentTypes: ALLOWED_TYPES,
					maximumSizeInBytes: MAX_UPLOAD_BYTES,
					addRandomSuffix: false,
					tokenPayload: JSON.stringify(meta),
				};
			},
			onUploadCompleted: async ({ blob, tokenPayload }) => {
				const meta = parseMeta(tokenPayload);
				if (!meta) return;
				await addPhoto({
					id: meta.id,
					url: blob.url,
					pathname: blob.pathname,
					album: meta.album,
					caption: meta.caption,
					createdAt: new Date().toISOString(),
				});
			},
		});

		return new Response(JSON.stringify(jsonResponse), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Upload failed.';
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
