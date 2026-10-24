import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../lib/accounts/supabase';
import { accountAfterLink, linkPlayerToAccount } from '../../lib/accounts/player-link';

export const prerender = false;

/** Link the signed-in account to a player profile, or reject if another account already has it. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);
	if (session.profile?.player_slug) return redirect('/account', 303);

	const form = await request.formData();
	const slug = String(form.get('player_slug') ?? '').trim();
	const note = String(form.get('note') ?? '').trim().slice(0, 300);
	const result = await linkPlayerToAccount({
		userId: session.user.id,
		slug,
		note: note || 'Claimed from account page',
		sessionClient: createSessionClient(request, cookies),
	});
	if (result.status === 'invalid') return redirect('/account?claim=invalid', 303);
	if (result.status === 'error') return redirect('/account?claim=error', 303);
	return redirect(accountAfterLink(result), 303);
};
