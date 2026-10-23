import type { APIRoute } from 'astro';
import { createAdminClient, json } from '../../../lib/accounts/supabase';

export const prerender = false;

/** Public: is this player slug claimed by a verified account? Used by profile pages. */
export const GET: APIRoute = async ({ url }) => {
	const slug = (url.searchParams.get('slug') ?? '').trim();
	if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ verified: false }, 400);
	const admin = createAdminClient();
	if (!admin) return json({ verified: false });
	const { data } = await admin.from('verified_players').select('player_slug, display_name').eq('player_slug', slug).maybeSingle();
	return json(
		{ verified: Boolean(data), displayName: data?.display_name ?? null },
		200,
		{ 'Cache-Control': 'no-store' },
	);
};
