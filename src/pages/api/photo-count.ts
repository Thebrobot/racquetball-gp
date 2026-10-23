import type { APIRoute } from 'astro';
import { readGalleryIndex } from '../../lib/gallery/store';

export const prerender = false;

/** Live photo count for prerendered pages. Cached at the edge for five minutes. */
export const GET: APIRoute = async () => {
	const index = await readGalleryIndex().catch(() => ({ photos: [] }));
	return new Response(JSON.stringify({ photos: index.photos.length }), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
	});
};
