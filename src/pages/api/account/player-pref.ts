import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../../lib/accounts/supabase';
import { NOT_A_PLAYER_META, shouldShowClaimBanner } from '../../../lib/accounts/claim-banner';

export const prerender = false;

/** Persist "I'm not a player" so the claim banner stays hidden for this account. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);

	const body = (await request.json().catch(() => ({}))) as { notAPlayer?: unknown };
	if (body.notAPlayer !== true) return json({ error: 'Nothing to save.' }, 400);

	const client = createSessionClient(request, cookies);
	if (!client) return json({ error: 'Not configured.' }, 503);

	const { error } = await client.auth.updateUser({ data: { [NOT_A_PLAYER_META]: true } });
	if (error) return json({ error: 'Could not save that preference.' }, 500);

	const next = { ...session, user: { ...session.user, user_metadata: { ...session.user.user_metadata, [NOT_A_PLAYER_META]: true } } };
	return json({ ok: true, showClaimBanner: shouldShowClaimBanner(next) });
};
