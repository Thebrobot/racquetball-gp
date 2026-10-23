import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

/** Save the signed-in user's email notification switch. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'Sign in first.' }, 401);
	const form = await request.formData();
	const notifyEmail = form.get('notify_email') === 'on';
	const marketing = form.get('marketing_opt_in') === 'on';
	const results = form.get('notify_results') === 'on';
	const wasOptedIn = session.profile?.marketing_opt_in === true;
	const client = createSessionClient(request, cookies)!;
	const { error } = await client
		.from('profiles')
		.update({
			notify_email: notifyEmail,
			marketing_opt_in: marketing,
			notify_results: results,
			...(marketing && !wasOptedIn ? { marketing_opt_in_at: new Date().toISOString() } : {}),
			...(!marketing ? { marketing_opt_in_at: null } : {}),
			updated_at: new Date().toISOString(),
		})
		.eq('id', session.user.id);
	if (error) return json({ error: 'Could not save.' }, 500);
	return redirect('/account?notify=saved#notifications', 303);
};
