import type { APIRoute } from 'astro';
import { createAdminClient, createSessionClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Report or delete a comment.
 * - report: any signed-in account; the comment hides until an admin reviews it
 * - delete: the author or an admin
 */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const admin = createAdminClient();
	const client = createSessionClient(request, cookies);
	if (!admin || !client) return json({ error: 'Not configured.' }, 503);

	const body = (await request.json().catch(() => ({}))) as { commentId?: unknown; action?: unknown; reason?: unknown };
	const commentId = typeof body.commentId === 'string' && UUID_RE.test(body.commentId) ? body.commentId : null;
	if (!commentId) return json({ error: 'Bad comment id.' }, 400);
	const action = body.action === 'delete' ? 'delete' : 'report';

	const { data: comment } = await admin.from('photo_comments').select('id, user_id, status').eq('id', commentId).maybeSingle();
	if (!comment) return json({ error: 'Comment not found.' }, 404);

	if (action === 'delete') {
		if (comment.user_id !== session.user.id && !session.isAdmin) return json({ error: 'Not yours to delete.' }, 403);
		const { error } = await admin.from('photo_comments').delete().eq('id', commentId);
		if (error) return json({ error: 'Could not delete.' }, 500);
		return json({ ok: true, action });
	}

	if (comment.user_id === session.user.id) return json({ error: 'You can delete your own comment instead.' }, 400);
	const reason = String(body.reason ?? '').trim().slice(0, 200) || null;
	await client.from('comment_reports').upsert({ comment_id: commentId, reporter_id: session.user.id, reason }, { onConflict: 'comment_id,reporter_id', ignoreDuplicates: true });
	if (comment.status === 'visible') {
		await admin.from('photo_comments').update({ status: 'hidden', updated_at: new Date().toISOString() }).eq('id', commentId);
	}
	return json({ ok: true, action });
};
