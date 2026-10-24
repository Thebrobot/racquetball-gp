import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { put } from '@vercel/blob';
import { adminEmails, createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { approveOne, type PhotoSubmission } from '../../../lib/gallery/approve-submission';
import { isValidAlbumId } from '../../../lib/gallery/albums';
import { readImageSize } from '../../../lib/gallery/image-size';
import { SUBMISSION_ALERT_WINDOW_MS, shouldCreateSubmissionAlert } from '../../../lib/notify/copy';
import { notifyMany } from '../../../lib/notify/events';

export const prerender = false;

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PENDING = 15;

function extFor(type: string, name: string): string {
	const fromName = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
	if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
	if (type === 'image/png') return 'png';
	if (type === 'image/webp') return 'webp';
	if (type === 'image/gif') return 'gif';
	if (type === 'image/heic' || type === 'image/heif') return 'heic';
	return 'jpg';
}

/** A signed-in person sends a photo for review. Admins skip the queue and land in the gallery. */
export const POST: APIRoute = async ({ request, cookies }) => {
	const session = await getSession(request, cookies);
	if (!session) return json({ error: 'sign-in-required' }, 401);
	const admin = createAdminClient();
	if (!admin) return json({ error: 'Not configured.' }, 503);
	if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return json({ error: 'Photo storage is not configured.' }, 503);

	const form = await request.formData();
	const album = String(form.get('album') ?? '');
	const caption = String(form.get('caption') ?? '').trim().slice(0, 200) || null;
	const file = form.get('file');
	if (!isValidAlbumId(album)) return json({ error: 'Pick the event the photo is from.' }, 400);
	if (!(file instanceof File)) return json({ error: 'Choose a photo first.' }, 400);
	if (!file.type.startsWith('image/')) return json({ error: 'Only images can be uploaded.' }, 400);
	if (file.size > MAX_BYTES) return json({ error: 'That photo is over 12MB. Try a smaller export.' }, 400);

	if (!session.isAdmin) {
		const { count } = await admin.from('photo_submissions').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('status', 'pending');
		if ((count ?? 0) >= MAX_PENDING) return json({ error: `You already have ${MAX_PENDING} photos waiting for review. Hang on until some are approved.` }, 429);
	}

	const id = randomUUID();
	const ext = extFor(file.type, file.name);
	const pathname = `submissions/${album}/${id}.${ext}`;
	const bytes = new Uint8Array(await file.arrayBuffer());
	const size = readImageSize(bytes);
	let url = '';
	try {
		const blob = await put(pathname, Buffer.from(bytes), { access: 'public', addRandomSuffix: false, contentType: file.type || 'image/jpeg' });
		url = blob.url;
	} catch {
		return json({ error: 'Could not store the photo. Try again in a moment.' }, 502);
	}

	const { data, error } = await admin
		.from('photo_submissions')
		.insert({ id, user_id: session.user.id, album, caption, pathname, url, content_type: file.type || null, bytes: file.size, width: size?.width ?? null, height: size?.height ?? null })
		.select('id, album, caption, url, status, created_at')
		.single();
	if (error || !data) return json({ error: 'Could not record the upload.' }, 500);

	const sub: PhotoSubmission = {
		id,
		user_id: session.user.id,
		album,
		caption,
		pathname,
		url,
		content_type: file.type || null,
		width: size?.width ?? null,
		height: size?.height ?? null,
		status: 'pending',
	};

	if (session.isAdmin) {
		if ((await approveOne(admin, sub, session, { notify: false })) === 'error') {
			return json({ error: 'Could not publish the photo. Try again in a moment.' }, 502);
		}
		return json({ ok: true, approved: true, submission: { ...data, status: 'approved' } });
	}

	// One admin alert per 15-minute burst; the digest cron rolls unsent rows into one email.
	const windowStart = new Date(Date.now() - SUBMISSION_ALERT_WINDOW_MS).toISOString();
	const { count: recentPending } = await admin
		.from('photo_submissions')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', session.user.id)
		.eq('status', 'pending')
		.gte('created_at', windowStart)
		.neq('id', id);
	if (shouldCreateSubmissionAlert(recentPending ?? 0)) {
		const emails = adminEmails();
		if (emails.length) {
			const { data: admins } = await admin.from('profiles').select('id').in('email', emails);
			const ids = ((admins ?? []) as { id: string }[]).map((a) => a.id).filter((aid) => aid !== session.user.id);
			await notifyMany(admin, ids, {
				kind: 'submission',
				actorId: session.user.id,
				payload: { submissionId: id, album, caption, url, uploader: session.profile?.display_name ?? session.user.email },
			});
		}
	}
	return json({ ok: true, submission: data });
};
