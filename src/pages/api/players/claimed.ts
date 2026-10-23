import type { APIRoute } from 'astro';
import { createAdminClient, json } from '../../../lib/accounts/supabase';
import { getAllPlayers } from '../../../data/players';
import { getPlayerImageForDisplay } from '../../../data/player-images';

export const prerender = false;

/** Public: players who have claimed their profile, with their photos, for the welcome pop-up. */
export const GET: APIRoute = async () => {
	const admin = createAdminClient();
	const total = getAllPlayers().length;
	if (!admin) return json({ total, count: 0, players: [] }, 200, { 'Cache-Control': 'no-store' });
	const { data } = await admin.from('verified_players').select('player_slug');
	const slugs = new Set(((data ?? []) as { player_slug: string }[]).map((r) => r.player_slug));
	const players = getAllPlayers()
		.filter((p) => slugs.has(p.slug))
		.map((p) => ({ slug: p.slug, name: p.name, photo: getPlayerImageForDisplay(p.name, 56) ?? null }))
		.slice(0, 12);
	return json({ total, count: slugs.size, players }, 200, { 'Cache-Control': 'no-store' });
};
