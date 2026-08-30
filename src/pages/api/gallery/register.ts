import type { APIRoute } from 'astro';
import { isValidAlbumId } from '../../../lib/gallery/albums';
import { isGalleryAuthenticated } from '../../../lib/gallery/auth';
import { addPhoto } from '../../../lib/gallery/store';

export const prerender = false;

/** Register a photo in the gallery index after a client-side Blob upload. */
export const POST: APIRoute = async ({ request }) => {
	if (!isGalleryAuthenticated(request)) {
		return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const body = (await request.json()) as {
		id?: string;
		url?: string;
		pathname?: string;
		album?: string;
		caption?: string;
	};

	const id = body.id?.trim();
	const url = body.url?.trim();
	const pathname = body.pathname?.trim();
	const album = body.album?.trim() || '';
	const caption = body.caption?.trim().slice(0, 200) || undefined;

	if (!id || !url || !pathname) {
		return new Response(JSON.stringify({ error: 'Missing photo fields.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!isValidAlbumId(album)) {
		return new Response(JSON.stringify({ error: 'Select a valid event.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!url.includes('blob.vercel-storage.com')) {
		return new Response(JSON.stringify({ error: 'Invalid blob URL.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	await addPhoto({
		id,
		url,
		pathname,
		album,
		caption,
		createdAt: new Date().toISOString(),
	});

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
