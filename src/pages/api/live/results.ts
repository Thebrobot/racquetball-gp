import type { APIRoute } from 'astro';
import { json } from '../../../lib/accounts/supabase';
import { LIVE_EVENT_BY_SLUG } from '../../../lib/live/config';
import { readLiveResults } from '../../../lib/live/store';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const slug = url.searchParams.get('event') ?? 'port-st-lucie-open';
	if (!LIVE_EVENT_BY_SLUG[slug]) return json({ error: 'Unknown event' }, 404);
	const results = await readLiveResults(slug);
	return json(results, 200, { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' });
};
