import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../lib/accounts/supabase';
import { getAllPlayers } from '../../data/players';

export const prerender = false;

/** Request to link the signed-in account to a player profile (pending admin approval). */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);
	if (session.profile?.player_slug) return redirect('/account', 303);

	const form = await request.formData();
	const slug = String(form.get('player_slug') ?? '').trim();
	const note = String(form.get('note') ?? '').trim().slice(0, 300);
	const player = getAllPlayers().find((p) => p.slug === slug);
	if (!player) return redirect('/account?claim=invalid', 303);

	const client = createSessionClient(request, cookies)!;
	const { error } = await client.from('profile_claims').insert({
		user_id: session.user.id,
		player_slug: player.slug,
		player_name: player.name,
		note: note || null,
		status: 'pending',
	});
	if (error) {
		// Unique index: one pending claim per user.
		const dup = /duplicate|unique/i.test(error.message);
		return redirect(dup ? '/account?claim=pending' : '/account?claim=error', 303);
	}
	return redirect('/account?claim=sent', 303);
};
