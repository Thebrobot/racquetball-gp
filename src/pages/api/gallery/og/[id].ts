import type { APIRoute } from 'astro';
import { getPhotoById } from '../../../../lib/gallery/store';

export const prerender = false;

/** Same-origin image for link previews (iMessage/Facebook often skip cross-origin Blob URLs). */
export const GET: APIRoute = async ({ params }) => {
	const id = params.id?.trim();
	if (!id) {
		return new Response('Not found', { status: 404 });
	}

	const photo = await getPhotoById(id);
	if (!photo?.url) {
		return new Response('Not found', { status: 404 });
	}

	try {
		const upstream = await fetch(photo.url);
		if (!upstream.ok || !upstream.body) {
			return new Response('Not found', { status: 404 });
		}

		const contentType = upstream.headers.get('content-type') || 'image/jpeg';
		return new Response(upstream.body, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
			},
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
};
