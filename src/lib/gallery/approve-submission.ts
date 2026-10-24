import { copy, del } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionInfo } from '../accounts/supabase';
import { notify } from '../notify/events';
import { addPhoto } from './store';

export type PhotoSubmission = {
	id: string;
	user_id: string;
	album: string;
	caption: string | null;
	pathname: string;
	url: string;
	content_type: string | null;
	width: number | null;
	height: number | null;
	status: string;
};

export type ApproveSession = Pick<SessionInfo, 'user'>;

/**
 * Copy submissions/ → gallery/, add the photo to the catalog, tag the uploader's
 * player profile when they have one, mark the row approved, and optionally notify.
 * Callers that approve many photos must await this one at a time: addPhoto rewrites
 * gallery/index.json and concurrent writes would clobber each other.
 */
export async function approveOne(
	admin: SupabaseClient,
	sub: PhotoSubmission,
	session: ApproveSession,
	opts: { notify: boolean; note?: string | null },
): Promise<'ok' | 'error'> {
	const now = new Date().toISOString();
	const ext = sub.pathname.split('.').pop() ?? 'jpg';
	const target = `gallery/${sub.album}/${sub.id}.${ext}`;
	let url = '';
	try {
		const moved = await copy(sub.url, target, { access: 'public', addRandomSuffix: false, contentType: sub.content_type ?? 'image/jpeg' });
		url = moved.url;
		await del(sub.url).catch(() => undefined);
	} catch {
		return 'error';
	}
	const { data: uploader } = await admin.from('profiles').select('display_name, player_slug').eq('id', sub.user_id).maybeSingle();
	const who = uploader as { display_name: string | null; player_slug: string | null } | null;
	await addPhoto({
		id: sub.id,
		url,
		pathname: target,
		album: sub.album,
		caption: sub.caption ?? undefined,
		createdAt: now,
		...(sub.width && sub.height ? { width: sub.width, height: sub.height } : {}),
		...(who?.display_name ? { photographer: who.display_name } : {}),
	});
	if (who?.player_slug) {
		await admin.from('photo_tags').upsert({ photo_id: sub.id, player_slug: who.player_slug, tagged_by: session.user.id }, { onConflict: 'photo_id,player_slug', ignoreDuplicates: true });
	}
	await admin
		.from('photo_submissions')
		.update({ status: 'approved', photo_id: sub.id, decided_at: now, decided_by: session.user.email ?? 'admin', note: opts.note ?? null })
		.eq('id', sub.id);
	if (opts.notify) {
		await notify(admin, { userId: sub.user_id, kind: 'photo_approved', photoId: sub.id, actorId: session.user.id, payload: { album: sub.album } });
	}
	return 'ok';
}
