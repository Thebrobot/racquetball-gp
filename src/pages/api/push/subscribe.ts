import type { APIRoute } from 'astro';
import { createSessionClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

type Sub = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

/** Save this browser's push subscription for the signed-in user. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const body = (await request.json().catch(() => ({}))) as { subscription?: Sub };
	const sub = body.subscription;
	const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
	const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
	const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
	if (!endpoint.startsWith('https://') || !p256dh || !auth) return json({ error: 'Bad subscription.' }, 400);

	const client = createSessionClient(request, cookies)!;
	// Re-subscribing from the same browser replaces the old row.
	await client.from('push_subscriptions').delete().eq('endpoint', endpoint);
	const { error } = await client
		.from('push_subscriptions')
		.insert({ user_id: session.user.id, endpoint, p256dh, auth, user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null });
	if (error) return json({ error: 'Could not save the subscription.' }, 500);
	await client.from('profiles').update({ notify_push: true, updated_at: new Date().toISOString() }).eq('id', session.user.id);
	return json({ ok: true });
};
