import type { APIRoute } from 'astro';
import { createSessionClient } from '../../../lib/accounts/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const client = createSessionClient(request, cookies);
	if (client) await client.auth.signOut().catch(() => undefined);
	const ct = request.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
	}
	return redirect('/account', 303);
};
