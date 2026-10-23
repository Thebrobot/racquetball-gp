/**
 * Comment rules shared by the API routes: whether a photo holds comments
 * for review (junior) and how a comment row is shaped for the client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAllPlayers } from '../../data/players';

export const COMMENT_MAX = 500;

export type CommentView = {
	id: string;
	body: string;
	createdAt: string;
	status: 'visible' | 'pending' | 'hidden';
	mine: boolean;
	author: { name: string; slug: string | null; verified: boolean };
};

export type PhotoModeration = { isJunior: boolean; commentsOff: boolean };

/** A photo holds comments when an admin flagged it or any tagged player is marked junior. */
export async function getPhotoModeration(admin: SupabaseClient, photoId: string): Promise<PhotoModeration> {
	const [{ data: flag }, { data: tags }] = await Promise.all([
		admin.from('photo_flags').select('is_junior, comments_off').eq('photo_id', photoId).maybeSingle(),
		admin.from('photo_tags').select('player_slug').eq('photo_id', photoId),
	]);
	let isJunior = Boolean(flag?.is_junior);
	const commentsOff = Boolean(flag?.comments_off);
	const slugs = ((tags ?? []) as { player_slug: string }[]).map((t) => t.player_slug);
	if (!isJunior && slugs.length) {
		const { data: juniors } = await admin.from('profiles').select('player_slug').in('player_slug', slugs).eq('is_junior', true);
		isJunior = Boolean(juniors?.length);
	}
	return { isJunior, commentsOff };
}

const PLAYER_NAMES = new Map(getAllPlayers().map((p) => [p.slug, p.name]));

export function toCommentView(
	row: { id: string; body: string; created_at: string; status?: string; user_id: string; display_name: string | null; player_slug: string | null },
	viewerId: string | null,
): CommentView {
	const slug = row.player_slug ?? null;
	return {
		id: row.id,
		body: row.body,
		createdAt: row.created_at,
		status: (row.status as CommentView['status']) ?? 'visible',
		mine: Boolean(viewerId && row.user_id === viewerId),
		author: {
			name: slug && PLAYER_NAMES.has(slug) ? PLAYER_NAMES.get(slug)! : row.display_name || 'A fan',
			slug,
			verified: Boolean(slug),
		},
	};
}
