import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

const PASSWORD_MIN = 8;

/** Set or change the signed-in user's password (used after a reset link, or from the account page). */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return redirect('/account?next=/account/password', 303);

	const form = await request.formData();
	const password = String(form.get('password') ?? '');
	const confirm = String(form.get('confirm') ?? '');
	if (password.length < PASSWORD_MIN) return redirect('/account/password?error=short', 303);
	if (password !== confirm) return redirect('/account/password?error=match', 303);

	const client = createSessionClient(request, cookies)!;
	const { error } = await client.auth.updateUser({ password });
	if (error) {
		const same = /different from the old|same password/i.test(error.message);
		return redirect(`/account/password?error=${same ? 'same' : 'failed'}`, 303);
	}
	return redirect('/account?password=saved', 303);
};
