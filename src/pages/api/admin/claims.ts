import type { APIRoute } from 'astro';
import { createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { notify } from '../../../lib/notify/events';
import { getAllPlayers } from '../../../data/players';

export const prerender = false;

/** Approve or reject a profile claim. Admins only. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session?.isAdmin) return json({ error: 'Admins only.' }, 403);
	const admin = createAdminClient();
	if (!admin) return json({ error: 'Admin client is not configured.' }, 503);

	const form = await request.formData();
	const id = String(form.get('id') ?? '');
	const action = String(form.get('action') ?? '');
	const junior = form.get('junior') === 'on';
	if (!id || !['approve', 'reject'].includes(action)) return json({ error: 'Bad request.' }, 400);

	const { data: claim, error: readErr } = await admin
		.from('profile_claims')
		.select('id, user_id, player_slug, status')
		.eq('id', id)
		.maybeSingle();
	if (readErr || !claim) return json({ error: 'Claim not found.' }, 404);
	if (claim.status !== 'pending') return redirect('/admin?claims=already', 303);

	const now = new Date().toISOString();
	if (action === 'approve') {
		// Release the slug if another profile holds it, then assign.
		await admin.from('profiles').update({ player_slug: null }).eq('player_slug', claim.player_slug);
		const { error: profErr } = await admin
			.from('profiles')
			.update({ player_slug: claim.player_slug, is_junior: junior, updated_at: now })
			.eq('id', claim.user_id);
		if (profErr) return json({ error: 'Could not link the profile.' }, 500);
		const playerName = getAllPlayers().find((p) => p.slug === claim.player_slug)?.name ?? claim.player_slug;
		await notify(admin, { userId: claim.user_id, kind: 'claim_approved', actorId: session.user.id, payload: { playerSlug: claim.player_slug, playerName } });
	}
	await admin
		.from('profile_claims')
		.update({ status: action === 'approve' ? 'approved' : 'rejected', decided_at: now, decided_by: session.user.email ?? 'admin' })
		.eq('id', id);
	return redirect(`/admin?claims=${action}d`, 303);
};
