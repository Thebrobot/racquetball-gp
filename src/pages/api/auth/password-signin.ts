import type { APIRoute } from 'astro';
import { createSessionClient, accountsConfigured, json } from '../../../lib/accounts/supabase';

export const prerender = false;

/** Email + password sign-in. Sets the session cookies on success. */
export const POST: APIRoute = async ({ request, cookies }) => {
	if (!accountsConfigured()) return json({ error: 'Accounts are not set up yet.' }, 503);

	const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; next?: string };
	const email = String(body.email ?? '').trim().toLowerCase();
	const password = String(body.password ?? '');
	let next = String(body.next ?? '/account');
	if (!next.startsWith('/') || next.startsWith('//')) next = '/account';
	if (!email || !password) return json({ error: 'Enter your email and password.' }, 400);

	const client = createSessionClient(request, cookies)!;
	const { error } = await client.auth.signInWithPassword({ email, password });
	if (error) {
		if (/not confirmed/i.test(error.message)) {
			return json({ error: 'unverified', message: 'Verify your email first. Check your inbox for the link we sent.' }, 403);
		}
		if (/invalid/i.test(error.message)) {
			return json({ error: 'Wrong email or password.' }, 401);
		}
		if (/rate|limit/i.test(error.message)) return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429);
		return json({ error: 'Could not sign in.' }, 500);
	}
	return json({ ok: true, next });
};
