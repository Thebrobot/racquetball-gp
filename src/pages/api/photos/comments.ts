import type { APIRoute } from 'astro';
import { createAdminClient, createSessionClient, getSession, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId } from '../../../lib/accounts/visitor';
import { COMMENT_MAX, getPhotoModeration, toCommentView, type CommentView } from '../../../lib/accounts/comments';
import { getPhotoById } from '../../../lib/gallery/store';
import { notifyMany, taggedUserIds } from '../../../lib/notify/events';

export const prerender = false;

/** Visible comments for a photo (plus the viewer's own pending ones). */
export const GET: APIRoute = async ({ request, cookies, url }) => {
	const id = url.searchParams.get('id') ?? '';
	if (!isValidPhotoId(id)) return json({ error: 'Bad photo id.' }, 400);
	const admin = createAdminClient();
	if (!admin) return json({ comments: [], viewer: { signedIn: false, canComment: false, isAdmin: false }, moderation: { isJunior: false, commentsOff: false } });

	const [feed, session, moderation] = await Promise.all([
		admin.from('photo_comment_feed').select('id, body, created_at, user_id, display_name, player_slug').eq('photo_id', id).order('created_at', { ascending: true }).limit(200),
		getSession(request, cookies),
		getPhotoModeration(admin, id),
	]);
	const viewerId = session?.user.id ?? null;
	let comments: CommentView[] = ((feed.data ?? []) as Parameters<typeof toCommentView>[0][]).map((r) => toCommentView(r, viewerId));

	// The author can see their own comments that are still waiting for review.
	if (session) {
		const { data: mine } = await admin
			.from('photo_comments')
			.select('id, body, created_at, status, user_id')
			.eq('photo_id', id)
			.eq('user_id', session.user.id)
			.eq('status', 'pending');
		const pending = ((mine ?? []) as { id: string; body: string; created_at: string; status: string; user_id: string }[]).map((r) =>
			toCommentView({ ...r, display_name: session.profile?.display_name ?? null, player_slug: session.profile?.player_slug ?? null }, viewerId),
		);
		comments = [...comments, ...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	return json(
		{
			comments,
			moderation,
			viewer: { signedIn: Boolean(session), canComment: Boolean(session) && !moderation.commentsOff, isAdmin: Boolean(session?.isAdmin) },
		},
		200,
		{ 'Cache-Control': 'no-store' },
	);
};

/** Post a comment. Held for review when the photo is flagged junior. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const admin = createAdminClient();
	const client = createSessionClient(request, cookies);
	if (!admin || !client) return json({ error: 'Not configured.' }, 503);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown; body?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);
	const text = String(body.body ?? '').replace(/\s+/g, ' ').trim();
	if (!text) return json({ error: 'Write something first.' }, 400);
	if (text.length > COMMENT_MAX) return json({ error: `Keep it under ${COMMENT_MAX} characters.` }, 400);

	const photo = await getPhotoById(body.photoId).catch(() => undefined);
	if (!photo) return json({ error: 'Photo not found.' }, 404);
	const moderation = await getPhotoModeration(admin, body.photoId);
	if (moderation.commentsOff) return json({ error: 'Comments are off for this photo.' }, 403);

	// Light rate limit: at most 10 comments per minute per account.
	const since = new Date(Date.now() - 60_000).toISOString();
	const { count } = await admin.from('photo_comments').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).gte('created_at', since);
	if ((count ?? 0) >= 10) return json({ error: 'Slow down a little and try again in a minute.' }, 429);

	const status = moderation.isJunior && !session.isAdmin ? 'pending' : 'visible';
	const { data, error } = await client
		.from('photo_comments')
		.insert({ photo_id: body.photoId, user_id: session.user.id, body: text, status })
		.select('id, body, created_at, status, user_id')
		.single();
	if (error || !data) return json({ error: 'Could not post the comment.' }, 500);

	// Tell the people in the photo. Held comments notify on approval instead.
	if (status === 'visible') {
		const recipients = await taggedUserIds(admin, body.photoId, [session.user.id]);
		await notifyMany(admin, recipients, { kind: 'comment', photoId: body.photoId, actorId: session.user.id, payload: { body: text, commentId: data.id } });
	}

	const view = toCommentView(
		{ ...data, display_name: session.profile?.display_name ?? null, player_slug: session.profile?.player_slug ?? null },
		session.user.id,
	);
	return json({ ok: true, comment: view, held: status === 'pending' });
};
