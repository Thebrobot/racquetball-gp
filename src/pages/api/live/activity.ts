import type { APIRoute } from 'astro';
import { json } from '../../../lib/accounts/supabase';
import { readLiveActivity } from '../../../lib/live/store';

export const prerender = false;

export const GET: APIRoute = async () => {
	const feed = await readLiveActivity();
	return json(feed, 200, { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' });
};
