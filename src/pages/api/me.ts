import type { APIRoute } from 'astro';
import { accountsConfigured, getSession, json } from '../../lib/accounts/supabase';

export const prerender = false;

/** Lightweight "who am I" for prerendered pages (nav state, announcement). */
export const GET: APIRoute = async ({ request, cookies }) => {
	if (!accountsConfigured()) return json({ configured: false, signedIn: false });
	const session = await getSession(request, cookies);
	if (!session) return json({ configured: true, signedIn: false });
	const name = session.profile?.display_name || session.user.email?.split('@')[0] || 'Account';
	const initials = name
		.split(' ')
		.slice(0, 2)
		.map((w) => w[0] ?? '')
		.join('')
		.toUpperCase();
	return json({
		configured: true,
		signedIn: true,
		name,
		initials,
		isAdmin: session.isAdmin,
		verified: Boolean(session.profile?.player_slug),
	});
};
