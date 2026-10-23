import type { APIRoute } from 'astro';
import { createAdminClient, getSession, json } from '../../../lib/accounts/supabase';

export const prerender = false;

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Admin: approve (make visible) or delete a held/reported comment. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const session = await getSession(request, cookies);
	if (!session?.isAdmin) return json({ error: 'Admins only.' }, 403);
	const admin = createAdminClient();
	if (!admin) return json({ error: 'Not configured.' }, 503);

	const form = await request.formData();
	const id = String(form.get('id') ?? '');
	const action = String(form.get('action') ?? '');
	if (!UUID_RE.test(id) || !['approve', 'delete'].includes(action)) return json({ error: 'Bad request.' }, 400);

	if (action === 'approve') {
		await admin.from('photo_comments').update({ status: 'visible', updated_at: new Date().toISOString() }).eq('id', id);
		await admin.from('comment_reports').delete().eq('comment_id', id);
	} else {
		await admin.from('photo_comments').delete().eq('id', id);
	}
	return redirect(`/admin?comments=${action}d#comments`, 303);
};
