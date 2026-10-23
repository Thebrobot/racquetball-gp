/**
 * Supabase access for player accounts. Everything talks to Supabase from the
 * server: pages and API routes use a cookie-backed client for the signed-in
 * user, and an admin client (service role) for counters and moderation.
 * When the env vars are missing (local build without keys) the helpers return
 * null and callers render a "not configured" state instead of throwing.
 */
import { createServerClient, parseCookieHeader, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

/** Reads the first defined name; the Vercel project uses the un-prefixed spellings. */
export function env(...names: string[]): string {
	for (const name of names) {
		const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
		if (v && v.trim()) return v.trim();
	}
	return '';
}

export const SUPABASE_URL = env('PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
const ANON_KEY = env('PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY');

export function accountsConfigured(): boolean {
	return Boolean(SUPABASE_URL && ANON_KEY);
}
export function adminConfigured(): boolean {
	return Boolean(SUPABASE_URL && SERVICE_KEY);
}

export function adminEmails(): string[] {
	return env('ADMIN_EMAILS')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}
export function isAdminEmail(email: string | null | undefined): boolean {
	return Boolean(email) && adminEmails().includes(String(email).toLowerCase());
}

export interface Profile {
	id: string;
	email: string;
	display_name: string | null;
	player_slug: string | null;
	is_junior: boolean;
	notify_email?: boolean;
	notify_push?: boolean;
	created_at: string;
}

export interface SessionInfo {
	user: User;
	profile: Profile | null;
	isAdmin: boolean;
}

/** Cookie-backed client for the current request (anon key + user session). */
export function createSessionClient(request: Request, cookies: AstroCookies): SupabaseClient | null {
	if (!accountsConfigured()) return null;
	return createServerClient(SUPABASE_URL, ANON_KEY, {
		cookies: {
			getAll() {
				return parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({
					name: c.name,
					value: c.value ?? '',
				}));
			},
			setAll(list: { name: string; value: string; options: CookieOptions }[]) {
				for (const { name, value, options } of list) {
					cookies.set(name, value, {
						...options,
						path: options.path ?? '/',
						sameSite: (options.sameSite as 'lax' | 'strict' | 'none' | undefined) ?? 'lax',
						httpOnly: options.httpOnly ?? true,
						secure: options.secure ?? import.meta.env.PROD,
					});
				}
			},
		},
	});
}

/** Service-role client: bypasses RLS. Server only. */
export function createAdminClient(): SupabaseClient | null {
	if (!adminConfigured()) return null;
	return createClient(SUPABASE_URL, SERVICE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

/** Current user + profile, or null when signed out / not configured. */
export async function getSession(request: Request, cookies: AstroCookies): Promise<SessionInfo | null> {
	const client = createSessionClient(request, cookies);
	if (!client) return null;
	const { data, error } = await client.auth.getUser();
	if (error || !data.user) return null;
	const { data: profile } = await client
		.from('profiles')
		.select('id, email, display_name, player_slug, is_junior, notify_email, notify_push, created_at')
		.eq('id', data.user.id)
		.maybeSingle();
	return {
		user: data.user,
		profile: (profile as Profile | null) ?? null,
		isAdmin: isAdminEmail(data.user.email),
	};
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
	});
}
