import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

/** Forget this browser's subscription (and, with all=true, every browser's). */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown; all?: unknown };
	const client = createSessionClient(request, cookies)!;
	if (body.all === true) {
		await client.from('push_subscriptions').delete().eq('user_id', session.user.id);
		await client.from('profiles').update({ notify_push: false, updated_at: new Date().toISOString() }).eq('id', session.user.id);
	} else if (typeof body.endpoint === 'string') {
		await client.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', session.user.id);
	}
	return json({ ok: true });
};
