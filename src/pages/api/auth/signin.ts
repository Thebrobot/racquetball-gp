import type { APIRoute } from 'astro';
import { createSessionClient, accountsConfigured, json } from '../../../lib/accounts/supabase';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sends a magic sign-in link to an existing account. Sign-up has its own page, so unknown emails are told to create one. */
export const POST: APIRoute = async ({ request, cookies, url }) => {
	if (!accountsConfigured()) return json({ error: 'Accounts are not set up yet.' }, 503);

	let email = '';
	let next = '/account';
	const ct = request.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		const body = (await request.json().catch(() => ({}))) as { email?: string; next?: string };
		email = String(body.email ?? '');
		next = String(body.next ?? next);
	} else {
		const form = await request.formData();
		email = String(form.get('email') ?? '');
		next = String(form.get('next') ?? next);
	}
	email = email.trim().toLowerCase();
	if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
	if (!next.startsWith('/') || next.startsWith('//')) next = '/account';

	const client = createSessionClient(request, cookies)!;
	const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`;
	const { error } = await client.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
	});
	if (error) {
		if (/signups? not allowed/i.test(error.message)) {
			return json({ error: 'No account with that email yet.', code: 'no-account' }, 404);
		}
		const tooMany = /rate|limit|seconds/i.test(error.message);
		return json(
			{ error: tooMany ? 'Too many sign-in emails. Wait a minute and try again.' : 'Could not send the sign-in link.' },
			tooMany ? 429 : 500,
		);
	}
	return json({ ok: true });
};
