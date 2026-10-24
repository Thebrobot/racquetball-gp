import type { User } from '@supabase/supabase-js';
import type { SessionInfo } from './supabase';

/** Auth metadata key: this account is a spectator / family, not a player. */
export const NOT_A_PLAYER_META = 'not_a_player';

export function isNotAPlayer(user: Pick<User, 'user_metadata'> | null | undefined): boolean {
	return user?.user_metadata?.[NOT_A_PLAYER_META] === true;
}

/** Show the claim prompt only for signed-in accounts with no linked player. */
export function shouldShowClaimBanner(session: SessionInfo | null | undefined): boolean {
	if (!session) return false;
	if (session.profile?.player_slug) return false;
	if (isNotAPlayer(session.user)) return false;
	return true;
}
