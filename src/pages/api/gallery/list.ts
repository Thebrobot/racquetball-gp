import type { APIRoute } from 'astro';
import { readGalleryIndex } from '../../../lib/gallery/store';

export const prerender = false;

export const GET: APIRoute = async () => {
	const index = await readGalleryIndex();
	return new Response(JSON.stringify(index), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store, max-age=0',
		},
	});
};
