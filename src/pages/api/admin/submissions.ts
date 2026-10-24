import type { APIRoute } from 'astro';
import { del } from '@vercel/blob';
import { createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { approveOne, type PhotoSubmission } from '../../../lib/gallery/approve-submission';
import { summarizeApprovals } from '../../../lib/notify/copy';
import { notify } from '../../../lib/notify/events';

export const prerender = false;

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SUB_COLS = 'id, user_id, album, caption, pathname, url, content_type, width, height, status';

/** Approve (move into the gallery, tag the uploader) or reject a submitted photo. Admins only. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session?.isAdmin) return json({ error: 'Admins only.' }, 403);
	const admin = createAdminClient();
	if (!admin) return json({ error: 'Not configured.' }, 503);

	const form = await request.formData();
	const id = String(form.get('id') ?? '');
	const action = String(form.get('action') ?? '');
	const note = String(form.get('note') ?? '').trim().slice(0, 300) || null;
	const userId = String(form.get('user_id') ?? '').trim();

	if (action === 'approve_all') {
		if (userId && !UUID_RE.test(userId)) return json({ error: 'Bad request.' }, 400);
		let q = admin.from('photo_submissions').select(SUB_COLS).eq('status', 'pending');
		if (userId) q = q.eq('user_id', userId);
		const { data } = await q;
		const pending = (data ?? []) as PhotoSubmission[];
		if (!pending.length) return redirect('/admin?photos=already#photos', 303);

		const approved: PhotoSubmission[] = [];
		// Sequential on purpose: addPhoto rewrites gallery/index.json.
		for (const sub of pending) {
			if ((await approveOne(admin, sub, session, { notify: false })) === 'ok') approved.push(sub);
		}
		for (const summary of summarizeApprovals(approved)) {
			await notify(admin, {
				userId: summary.userId,
				kind: 'photo_approved',
				photoId: summary.photoId,
				actorId: session.user.id,
				payload: { album: summary.album, count: summary.count },
			});
		}
		if (!approved.length) return redirect('/admin?photos=error#photos', 303);
		return redirect(`/admin?photos=${approved.length === 1 ? 'approved' : 'approved_all'}#photos`, 303);
	}

	if (!UUID_RE.test(id) || !['approve', 'reject'].includes(action)) return json({ error: 'Bad request.' }, 400);

	const { data } = await admin.from('photo_submissions').select(SUB_COLS).eq('id', id).maybeSingle();
	const sub = data as PhotoSubmission | null;
	if (!sub) return json({ error: 'Submission not found.' }, 404);
	if (sub.status !== 'pending') return redirect('/admin?photos=already#photos', 303);
	const now = new Date().toISOString();

	if (action === 'approve') {
		if ((await approveOne(admin, sub, session, { notify: true, note })) === 'error') {
			return redirect('/admin?photos=error#photos', 303);
		}
		return redirect('/admin?photos=approved#photos', 303);
	}

	await del(sub.url).catch(() => undefined);
	await admin.from('photo_submissions').update({ status: 'rejected', decided_at: now, decided_by: session.user.email ?? 'admin', note }).eq('id', id);
	return redirect('/admin?photos=rejected#photos', 303);
};
