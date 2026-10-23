import type { APIRoute } from 'astro';
import { createSessionClient, accountsConfigured, json } from '../../../lib/accounts/supabase';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Send a password reset email. Same response whether or not the address exists. */
export const POST: APIRoute = async ({ request, cookies, url }) => {
	if (!accountsConfigured()) return json({ error: 'Accounts are not set up yet.' }, 503);
	const body = (await request.json().catch(() => ({}))) as { email?: string };
	const email = String(body.email ?? '').trim().toLowerCase();
	if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

	const client = createSessionClient(request, cookies)!;
	const { error } = await client.auth.resetPasswordForEmail(email, {
		redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent('/account/password')}`,
	});
	if (error && /rate|limit|seconds/i.test(error.message)) {
		return json({ error: 'Too many reset emails. Wait a minute and try again.' }, 429);
	}
	return json({ ok: true });
};
