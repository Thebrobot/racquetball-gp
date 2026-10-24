import type { APIRoute } from 'astro';
import { createAdminClient, createSessionClient, getSession, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId } from '../../../lib/accounts/visitor';
import { getAllPlayers } from '../../../data/players';
import { getPhotoById } from '../../../lib/gallery/store';
import { notify } from '../../../lib/notify/events';
import { canAddPhotoTag, canRemovePhotoTag } from '../../../lib/accounts/photo-tags';

export const prerender = false;

/**
 * Add or remove a player tag on a photo.
 * Any signed-in user may tag one or more players. Remove is allowed for the
 * tagger, the tagged player's account owner, or an admin.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown; playerSlug?: unknown; action?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);
	const photoId = body.photoId;
	const action = body.action === 'remove' ? 'remove' : 'add';
	const slug = typeof body.playerSlug === 'string' ? body.playerSlug.trim() : '';
	if (!slug) return json({ error: 'Pick a player to tag.' }, 400);

	const actor = {
		signedIn: true,
		userId: session.user.id,
		isAdmin: session.isAdmin,
		playerSlug: session.profile?.player_slug ?? null,
	};
	if (action === 'add' && !canAddPhotoTag(actor)) return json({ error: 'sign-in-required' }, 401);

	const player = getAllPlayers().find((p) => p.slug === slug);
	if (!player) return json({ error: 'Unknown player.' }, 400);

	const photo = await getPhotoById(photoId).catch(() => undefined);
	if (!photo) return json({ error: 'Photo not found.' }, 404);

	const admin = createAdminClient();
	const client = admin ?? createSessionClient(request, cookies);
	if (!client) return json({ error: 'Not configured.' }, 503);

	if (action === 'add') {
		const { data: existing } = await client
			.from('photo_tags')
			.select('player_slug')
			.eq('photo_id', photoId)
			.eq('player_slug', slug)
			.maybeSingle();
		if (existing) return json({ ok: true, slug, name: player.name, action, duplicate: true });

		const { error } = await client
			.from('photo_tags')
			.upsert({ photo_id: photoId, player_slug: slug, tagged_by: session.user.id }, { onConflict: 'photo_id,player_slug', ignoreDuplicates: true });
		if (error) return json({ error: 'Could not add the tag.' }, 500);

		if (admin) {
			const { data: owner } = await admin.from('profiles').select('id').eq('player_slug', slug).maybeSingle();
			const ownerId = (owner as { id: string } | null)?.id;
			if (ownerId && ownerId !== session.user.id) {
				await notify(admin, { userId: ownerId, kind: 'tagged', photoId, actorId: session.user.id, payload: { playerSlug: slug } });
			}
		}
	} else {
		const { data: row } = await client
			.from('photo_tags')
			.select('player_slug, tagged_by')
			.eq('photo_id', photoId)
			.eq('player_slug', slug)
			.maybeSingle();
		const tag = row as { player_slug: string; tagged_by: string | null } | null;
		if (!tag) return json({ ok: true, slug, name: player.name, action });
		if (!canRemovePhotoTag(actor, { slug: tag.player_slug, taggedBy: tag.tagged_by })) {
			return json({ error: 'You cannot remove that tag.' }, 403);
		}
		const { error } = await client.from('photo_tags').delete().eq('photo_id', photoId).eq('player_slug', slug);
		if (error) return json({ error: 'Could not remove the tag.' }, 500);
	}
	return json({ ok: true, slug, name: player.name, action });
};
