import type { APIRoute } from 'astro';
import { createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId } from '../../../lib/accounts/visitor';

export const prerender = false;

/** Admin: mark a photo as junior (comments held for review) or turn comments off. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session?.isAdmin) return json({ error: 'Admins only.' }, 403);
	const admin = createAdminClient();
	if (!admin) return json({ error: 'Not configured.' }, 503);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown; isJunior?: unknown; commentsOff?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);

	const { data: current } = await admin.from('photo_flags').select('is_junior, comments_off').eq('photo_id', body.photoId).maybeSingle();
	const next = {
		photo_id: body.photoId,
		is_junior: typeof body.isJunior === 'boolean' ? body.isJunior : Boolean(current?.is_junior),
		comments_off: typeof body.commentsOff === 'boolean' ? body.commentsOff : Boolean(current?.comments_off),
		updated_at: new Date().toISOString(),
	};
	const { error } = await admin.from('photo_flags').upsert(next, { onConflict: 'photo_id' });
	if (error) return json({ error: 'Could not save.' }, 500);
	return json({ ok: true, isJunior: next.is_junior, commentsOff: next.comments_off });
};
