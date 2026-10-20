import type { APIRoute } from 'astro';
import { getLiveActivity } from '../../../lib/results/live';

export const prerender = false;

export const GET: APIRoute = async () => {
	const feed = await getLiveActivity();
	return new Response(JSON.stringify(feed), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
		},
	});
};
