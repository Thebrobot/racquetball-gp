import type { APIRoute } from 'astro';
import { isGalleryAuthenticated } from '../../../lib/gallery/auth';
import { removePhoto } from '../../../lib/gallery/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	if (!isGalleryAuthenticated(request)) {
		return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	let id = '';
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		const body = (await request.json()) as { id?: string };
		id = body.id ?? '';
	} else {
		const form = await request.formData();
		id = String(form.get('id') ?? '');
	}

	if (!id) {
		return new Response(JSON.stringify({ error: 'Missing photo id.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const removed = await removePhoto(id);
	if (!removed) {
		return new Response(JSON.stringify({ error: 'Photo not found.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
