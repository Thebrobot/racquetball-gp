import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../lib/accounts/supabase';
import { accountAfterLink, linkPlayerToAccount } from '../../lib/accounts/player-link';

export const prerender = false;

/** Link the signed-in account to a player profile, or reject if another account already has it. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);
	const wantsJson = (request.headers.get('accept') ?? '').includes('application/json')
		|| (request.headers.get('content-type') ?? '').includes('application/json');
	if (session.profile?.player_slug) {
		return wantsJson ? json({ ok: true, next: '/account' }) : redirect('/account', 303);
	}

	let slug = '';
	let note = '';
	if ((request.headers.get('content-type') ?? '').includes('application/json')) {
		const body = (await request.json().catch(() => ({}))) as { player_slug?: unknown; note?: unknown };
		slug = String(body.player_slug ?? '').trim();
		note = String(body.note ?? '').trim().slice(0, 300);
	} else {
		const form = await request.formData();
		slug = String(form.get('player_slug') ?? '').trim();
		note = String(form.get('note') ?? '').trim().slice(0, 300);
	}

	const result = await linkPlayerToAccount({
		userId: session.user.id,
		slug,
		note: note || 'Claimed from account page',
		sessionClient: createSessionClient(request, cookies),
	});
	if (wantsJson) {
		if (result.status === 'invalid') return json({ error: 'That player was not found. Pick a name from the list.' }, 400);
		if (result.status === 'error') return json({ error: result.message || 'Could not send the claim.' }, 500);
		if (result.status === 'already-claimed') return json({ error: 'That player profile is already claimed by another account.' }, 409);
		return json({ ok: true, next: accountAfterLink(result), status: result.status, player: 'player' in result ? result.player : null });
	}
	if (result.status === 'invalid') return redirect('/account?claim=invalid', 303);
	if (result.status === 'error') return redirect('/account?claim=error', 303);
	return redirect(accountAfterLink(result), 303);
};
