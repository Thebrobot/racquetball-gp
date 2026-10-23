import type { APIRoute } from 'astro';
import { createSessionClient, createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId } from '../../../lib/accounts/visitor';

export const prerender = false;

/** Toggle the signed-in user's like on a photo. Returns the new state and count. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);
	const photoId = body.photoId;

	const client = createSessionClient(request, cookies)!;
	const { data: existing } = await client
		.from('photo_likes')
		.select('photo_id')
		.eq('photo_id', photoId)
		.eq('user_id', session.user.id)
		.maybeSingle();

	let liked: boolean;
	if (existing) {
		const { error } = await client.from('photo_likes').delete().eq('photo_id', photoId).eq('user_id', session.user.id);
		if (error) return json({ error: 'Could not update like.' }, 500);
		liked = false;
	} else {
		const { error } = await client.from('photo_likes').insert({ photo_id: photoId, user_id: session.user.id });
		if (error) return json({ error: 'Could not update like.' }, 500);
		liked = true;
	}

	const counter = createAdminClient() ?? client;
	const { count } = await counter
		.from('photo_likes')
		.select('photo_id', { count: 'exact', head: true })
		.eq('photo_id', photoId);
	return json({ liked, likes: count ?? 0 });
};
