import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../lib/accounts/supabase';

export const prerender = false;

/** Update the signed-in user's display name. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);

	const form = await request.formData();
	const displayName = String(form.get('display_name') ?? '').trim().slice(0, 60);
	if (displayName.length < 2) return json({ error: 'Display name must be at least 2 characters.' }, 400);

	const client = createSessionClient(request, cookies)!;
	const { error } = await client
		.from('profiles')
		.update({ display_name: displayName, updated_at: new Date().toISOString() })
		.eq('id', session.user.id);
	if (error) return json({ error: 'Could not save your name.' }, 500);
	return redirect('/account?saved=1', 303);
};
