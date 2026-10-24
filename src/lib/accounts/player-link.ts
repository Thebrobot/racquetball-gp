import { createAdminClient, type Profile } from './supabase';
import { getAllPlayers } from '../../data/players';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LinkedPlayer = { name: string; slug: string };

export type LinkPlayerResult =
	| { status: 'linked'; player: LinkedPlayer }
	| { status: 'already-linked'; player: LinkedPlayer }
	| { status: 'already-claimed'; player: LinkedPlayer }
	| { status: 'pending'; player: LinkedPlayer }
	| { status: 'invalid' }
	| { status: 'error'; message: string };

/** Slugs already attached to an account (verified_players, else profiles). */
export async function loadClaimedSlugs(admin: SupabaseClient | null = createAdminClient()): Promise<Set<string>> {
	if (!admin) return new Set();
	const verified = await admin.from('verified_players').select('player_slug');
	if (!verified.error && verified.data) {
		return new Set(((verified.data ?? []) as { player_slug: string }[]).map((r) => r.player_slug).filter(Boolean));
	}
	const { data } = await admin.from('profiles').select('player_slug').not('player_slug', 'is', null);
	return new Set(((data ?? []) as { player_slug: string | null }[]).map((r) => r.player_slug).filter((s): s is string => Boolean(s)));
}

/**
 * Link a signed-in account to an existing player profile.
 * Reuses the same profiles.player_slug + profile_claims write as admin approval,
 * but never steals a slug another account already holds.
 */
export async function linkPlayerToAccount(input: {
	userId: string;
	slug: string;
	note?: string;
	/** Session client used only when the admin client is missing (pending claim fallback). */
	sessionClient?: SupabaseClient | null;
}): Promise<LinkPlayerResult> {
	const player = getAllPlayers().find((p) => p.slug === input.slug);
	if (!player) return { status: 'invalid' };
	const info = { name: player.name, slug: player.slug };
	const admin = createAdminClient();
	const now = new Date().toISOString();

	if (admin) {
		const { data: holders } = await admin.from('profiles').select('id').eq('player_slug', player.slug);
		const rows = (holders ?? []) as { id: string }[];
		if (rows.some((r) => r.id !== input.userId)) return { status: 'already-claimed', player: info };
		if (rows.some((r) => r.id === input.userId)) return { status: 'already-linked', player: info };

		const { error: profErr } = await admin
			.from('profiles')
			.update({ player_slug: player.slug, updated_at: now })
			.eq('id', input.userId);
		if (profErr) return { status: 'error', message: 'Could not link the profile.' };

		const { data: linked } = await admin.from('profiles').select('player_slug').eq('id', input.userId).maybeSingle();
		if ((linked as Pick<Profile, 'player_slug'> | null)?.player_slug !== player.slug) {
			// Profile row may not exist yet (trigger lag). Keep a pending claim so they can finish from /account.
			await insertClaim(admin, input.userId, info, input.note, 'pending', now);
			return { status: 'pending', player: info };
		}

		await insertClaim(admin, input.userId, info, input.note, 'approved', now, 'signup');
		return { status: 'linked', player: info };
	}

	if (!input.sessionClient) return { status: 'error', message: 'Could not link the profile.' };
	const { data: profile } = await input.sessionClient.from('profiles').select('player_slug').eq('id', input.userId).maybeSingle();
	if ((profile as Pick<Profile, 'player_slug'> | null)?.player_slug) {
		const mine = (profile as Pick<Profile, 'player_slug'>).player_slug;
		if (mine === player.slug) return { status: 'already-linked', player: info };
	}
	const { error } = await insertClaim(input.sessionClient, input.userId, info, input.note, 'pending', now);
	if (error) {
		const dup = /duplicate|unique/i.test(error.message);
		return dup ? { status: 'pending', player: info } : { status: 'error', message: 'Could not send the claim.' };
	}
	return { status: 'pending', player: info };
}

async function insertClaim(
	client: SupabaseClient,
	userId: string,
	player: LinkedPlayer,
	note: string | undefined,
	status: 'pending' | 'approved',
	now: string,
	decidedBy?: string,
) {
	return client.from('profile_claims').insert({
		user_id: userId,
		player_slug: player.slug,
		player_name: player.name,
		note: note || null,
		status,
		...(status === 'approved' ? { decided_at: now, decided_by: decidedBy ?? 'signup' } : {}),
	});
}

export function accountAfterLink(result: LinkPlayerResult, fallback = '/account'): string {
	if (result.status === 'linked' || result.status === 'already-linked') {
		return `/account?linked=${encodeURIComponent(result.player.slug)}`;
	}
	if (result.status === 'already-claimed') return '/account?claim=taken';
	if (result.status === 'pending') return '/account?claim=sent';
	return fallback;
}
