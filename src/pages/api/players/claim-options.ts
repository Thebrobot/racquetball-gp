import type { APIRoute } from 'astro';
import { json } from '../../../lib/accounts/supabase';
import { claimPlayerOptions } from '../../../lib/accounts/player-search';
import { loadClaimedSlugs } from '../../../lib/accounts/player-link';

export const prerender = false;

/** Public roster for the "This is me" claim search (names, city, claimed flag). */
export const GET: APIRoute = async () => {
	const claimed = await loadClaimedSlugs();
	return json({ players: claimPlayerOptions(claimed) }, 200, { 'Cache-Control': 'no-store' });
};
