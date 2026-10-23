import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

/** Save the signed-in user's email notification switch. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);
	const form = await request.formData();
	const notifyEmail = form.get('notify_email') === 'on';
	const client = createSessionClient(request, cookies)!;
	const { error } = await client.from('profiles').update({ notify_email: notifyEmail, updated_at: new Date().toISOString() }).eq('id', session.user.id);
	if (error) return json({ error: 'Could not save.' }, 500);
	return redirect('/account?notify=saved#notifications', 303);
};
