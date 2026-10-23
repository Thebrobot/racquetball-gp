import type { APIRoute } from 'astro';
import { createAdminClient, createSessionClient, getSession, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId } from '../../../lib/accounts/visitor';
import { getAllPlayers } from '../../../data/players';
import { getPhotoById } from '../../../lib/gallery/store';
import { notify } from '../../../lib/notify/events';

export const prerender = false;

/**
 * Add or remove a tag. Verified players tag/untag themselves; admins may tag
 * or untag any player by slug.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown; playerSlug?: unknown; action?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);
	const photoId = body.photoId;
	const action = body.action === 'remove' ? 'remove' : 'add';
	const requestedSlug = typeof body.playerSlug === 'string' && body.playerSlug ? body.playerSlug : null;
	const mySlug = session.profile?.player_slug ?? null;

	// Who is being tagged?
	let slug: string | null;
	if (requestedSlug && requestedSlug !== mySlug) {
		if (!session.isAdmin) return json({ error: 'Only verified players can tag themselves; admins can tag others.' }, 403);
		slug = requestedSlug;
	} else {
		if (!mySlug) return json({ error: 'claim-required', message: 'Claim your player profile first, then you can tag yourself.' }, 403);
		slug = mySlug;
	}
	const player = getAllPlayers().find((p) => p.slug === slug);
	if (!player) return json({ error: 'Unknown player.' }, 400);

	const photo = await getPhotoById(photoId).catch(() => undefined);
	if (!photo) return json({ error: 'Photo not found.' }, 404);

	const useAdmin = session.isAdmin && slug !== mySlug;
	const client = useAdmin ? createAdminClient() : createSessionClient(request, cookies);
	if (!client) return json({ error: 'Not configured.' }, 503);

	if (action === 'add') {
		const { error } = await client
			.from('photo_tags')
			.upsert({ photo_id: photoId, player_slug: slug, tagged_by: session.user.id }, { onConflict: 'photo_id,player_slug', ignoreDuplicates: true });
		if (error) return json({ error: 'Could not add the tag.' }, 500);
		// Someone else tagged this player: let them know (self-tags stay quiet).
		if (useAdmin) {
			const admin = createAdminClient();
			const { data: owner } = admin ? await admin.from('profiles').select('id').eq('player_slug', slug).maybeSingle() : { data: null };
			const ownerId = (owner as { id: string } | null)?.id;
			if (admin && ownerId && ownerId !== session.user.id) {
				await notify(admin, { userId: ownerId, kind: 'tagged', photoId, actorId: session.user.id, payload: { playerSlug: slug } });
			}
		}
	} else {
		const { error } = await client.from('photo_tags').delete().eq('photo_id', photoId).eq('player_slug', slug);
		if (error) return json({ error: 'Could not remove the tag.' }, 500);
	}
	return json({ ok: true, slug, name: player.name, action });
};
