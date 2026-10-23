import type { APIRoute } from 'astro';
import { copy, del } from '@vercel/blob';
import { createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { addPhoto } from '../../../lib/gallery/store';
import { notify } from '../../../lib/notify/events';

export const prerender = false;

const UUID_RE = /^[0-9a-f-]{36}$/i;
type Sub = { id: string; user_id: string; album: string; caption: string | null; pathname: string; url: string; content_type: string | null; width: number | null; height: number | null; status: string };

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
	if (!UUID_RE.test(id) || !['approve', 'reject'].includes(action)) return json({ error: 'Bad request.' }, 400);

	const { data } = await admin.from('photo_submissions').select('id, user_id, album, caption, pathname, url, content_type, width, height, status').eq('id', id).maybeSingle();
	const sub = data as Sub | null;
	if (!sub) return json({ error: 'Submission not found.' }, 404);
	if (sub.status !== 'pending') return redirect('/admin?photos=already#photos', 303);
	const now = new Date().toISOString();

	if (action === 'approve') {
		const ext = sub.pathname.split('.').pop() ?? 'jpg';
		const target = `gallery/${sub.album}/${sub.id}.${ext}`;
		let url = '';
		try {
			const moved = await copy(sub.url, target, { access: 'public', addRandomSuffix: false, contentType: sub.content_type ?? 'image/jpeg' });
			url = moved.url;
			await del(sub.url).catch(() => undefined);
		} catch {
			return redirect('/admin?photos=error#photos', 303);
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
		await admin.from('photo_submissions').update({ status: 'approved', photo_id: sub.id, decided_at: now, decided_by: session.user.email ?? 'admin', note }).eq('id', id);
		await notify(admin, { userId: sub.user_id, kind: 'photo_approved', photoId: sub.id, actorId: session.user.id, payload: { album: sub.album } });
		return redirect('/admin?photos=approved#photos', 303);
	}

	await del(sub.url).catch(() => undefined);
	await admin.from('photo_submissions').update({ status: 'rejected', decided_at: now, decided_by: session.user.email ?? 'admin', note }).eq('id', id);
	return redirect('/admin?photos=rejected#photos', 303);
};
