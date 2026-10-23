import type { APIRoute } from 'astro';
import { createSessionClient, accountsConfigured, json } from '../../../lib/accounts/supabase';
import { getAllPlayers } from '../../../data/players';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;

/**
 * Create an account with email + password. Sends a verification email; the
 * optional player pick is stored in user metadata and turned into a claim
 * when the verification link is opened.
 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
	if (!accountsConfigured()) return json({ error: 'Accounts are not set up yet.' }, 503);

	const body = (await request.json().catch(() => ({}))) as {
		email?: string;
		password?: string;
		display_name?: string;
		player_slug?: string;
		marketing_opt_in?: unknown;
		next?: string;
	};
	const email = String(body.email ?? '').trim().toLowerCase();
	const password = String(body.password ?? '');
	const displayName = String(body.display_name ?? '').trim().slice(0, 60);
	const playerSlug = String(body.player_slug ?? '').trim();
	let next = String(body.next ?? '/account');
	if (!next.startsWith('/') || next.startsWith('//')) next = '/account';

	if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
	if (password.length < PASSWORD_MIN) return json({ error: `Password must be at least ${PASSWORD_MIN} characters.` }, 400);
	if (displayName.length < 2) return json({ error: 'Enter the name you want shown on the site.' }, 400);
	const player = playerSlug ? getAllPlayers().find((p) => p.slug === playerSlug) : null;
	if (playerSlug && !player) return json({ error: 'Pick your name from the player list, or leave it blank.' }, 400);

	const client = createSessionClient(request, cookies)!;
	const { data, error } = await client.auth.signUp({
		email,
		password,
		options: {
			emailRedirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
			data: {
				display_name: displayName,
				marketing_opt_in: body.marketing_opt_in === true,
				...(player ? { claim_player_slug: player.slug, claim_player_name: player.name } : {}),
			},
		},
	});
	if (error) {
		if (/already registered|already exists/i.test(error.message)) {
			return json({ error: 'That email already has an account. Sign in instead, or use “Forgot password”.' }, 409);
		}
		if (/rate|limit|seconds/i.test(error.message)) {
			return json({ error: 'Too many sign-up emails right now. Wait a minute and try again.' }, 429);
		}
		if (/password/i.test(error.message)) return json({ error: error.message }, 400);
		return json({ error: 'Could not create the account.' }, 500);
	}

	// With email confirmation on, no session yet: the verification link finishes it.
	// Supabase returns a user with an empty identities list when the email already exists.
	const existing = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
	if (existing) {
		return json({ error: 'That email already has an account. Sign in instead, or use “Forgot password”.' }, 409);
	}
	return json({ ok: true, needsVerification: !data.session, next });
};
