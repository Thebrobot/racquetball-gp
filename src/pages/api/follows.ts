import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../lib/accounts/supabase';
import { getAllPlayers } from '../../data/players';
import { EVENTS } from '../../data/events';

export const prerender = false;

type Row = { kind: 'player' | 'event'; key: string };

/** The signed-in user's follows, with names for display. */
export const GET: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const client = createSessionClient(request, cookies)!;
	const { data } = await client.from('follows').select('kind, key').eq('user_id', session.user.id);
	const players = getAllPlayers();
	const rows = ((data ?? []) as Row[]).map((r) => ({
		...r,
		name: r.kind === 'player' ? (players.find((p) => p.slug === r.key)?.name ?? r.key) : (EVENTS.find((e) => e.slug === r.key)?.name ?? r.key),
	}));
	return json({ follows: rows });
};

/** Follow or unfollow a player or a tournament. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const body = (await request.json().catch(() => ({}))) as { kind?: unknown; key?: unknown; action?: unknown };
	const kind = body.kind === 'event' ? 'event' : body.kind === 'player' ? 'player' : null;
	const key = typeof body.key === 'string' ? body.key.trim() : '';
	if (!kind || !key) return json({ error: 'Bad request.' }, 400);
	const valid = kind === 'player' ? getAllPlayers().some((p) => p.slug === key) : EVENTS.some((e) => e.slug === key);
	if (!valid) return json({ error: kind === 'player' ? 'Pick a player from the list.' : 'Unknown tournament.' }, 400);
	const client = createSessionClient(request, cookies)!;
	if (body.action === 'remove') {
		await client.from('follows').delete().eq('user_id', session.user.id).eq('kind', kind).eq('key', key);
		return json({ ok: true, following: false });
	}
	const { count } = await client.from('follows').select('key', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('kind', 'player');
	if (kind === 'player' && (count ?? 0) >= 25) return json({ error: 'You can follow up to 25 players.' }, 400);
	await client.from('follows').upsert({ user_id: session.user.id, kind, key }, { onConflict: 'user_id,kind,key', ignoreDuplicates: true });
	return json({ ok: true, following: true });
};
