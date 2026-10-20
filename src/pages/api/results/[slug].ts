import type { APIRoute } from 'astro';
import { readSnapshot } from '../../../lib/results/store';
import { fallbackResultsFor } from '../../../lib/results/live';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
	const slug = params.slug;
	if (!slug) return new Response(JSON.stringify({ error: 'missing slug' }), { status: 400 });
	const snapshot = await readSnapshot(slug);
	if (snapshot) {
		return new Response(JSON.stringify(snapshot), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
			},
		});
	}
	const fallback = fallbackResultsFor(slug);
	return new Response(
		JSON.stringify({
			version: 1,
			slug,
			source: 'fallback',
			divisions: fallback,
		}),
		{
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
			},
		},
	);
};
