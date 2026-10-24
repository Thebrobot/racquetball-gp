import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { User } from '@supabase/supabase-js';
import { isNotAPlayer, shouldShowClaimBanner } from './claim-banner';
import type { Profile, SessionInfo } from './supabase';

function user(meta: Record<string, unknown> = {}): User {
	return { id: 'u1', user_metadata: meta } as User;
}

function session(partial: { slug?: string | null; meta?: Record<string, unknown> }): SessionInfo {
	const profile = {
		id: 'u1',
		email: 'fan@example.com',
		display_name: 'Fan',
		player_slug: partial.slug ?? null,
		is_junior: false,
		created_at: '2026-01-01T00:00:00.000Z',
	} as Profile;
	return { user: user(partial.meta), profile, isAdmin: false };
}

describe('isNotAPlayer', () => {
	it('is true only when metadata is the boolean true', () => {
		assert.equal(isNotAPlayer(user({ not_a_player: true })), true);
		assert.equal(isNotAPlayer(user({ not_a_player: 'true' })), false);
		assert.equal(isNotAPlayer(user({})), false);
		assert.equal(isNotAPlayer(null), false);
	});
});

describe('shouldShowClaimBanner', () => {
	it('shows for signed-in accounts with no linked player', () => {
		assert.equal(shouldShowClaimBanner(session({ slug: null })), true);
		assert.equal(shouldShowClaimBanner(session({ slug: '' })), true);
	});

	it('hides once a player profile is linked', () => {
		assert.equal(shouldShowClaimBanner(session({ slug: 'annie-sanchez' })), false);
	});

	it('hides permanently after I\'m not a player', () => {
		assert.equal(shouldShowClaimBanner(session({ slug: null, meta: { not_a_player: true } })), false);
	});

	it('hides when signed out', () => {
		assert.equal(shouldShowClaimBanner(null), false);
	});
});
