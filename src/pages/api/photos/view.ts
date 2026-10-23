import type { APIRoute } from 'astro';
import { createAdminClient, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId, todayUtc, visitorHash } from '../../../lib/accounts/visitor';

export const prerender = false;

/** Count one view per visitor per photo per day. Works for signed-out visitors. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
	const admin = createAdminClient();
	if (!admin) return json({ ok: false }, 503);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);

	let address: string | undefined;
	try {
		address = clientAddress;
	} catch {
		address = undefined;
	}
	const { data, error } = await admin
		.from('photo_views')
		.upsert(
			{ photo_id: body.photoId, day: todayUtc(), visitor_hash: visitorHash(request, address) },
			{ onConflict: 'photo_id,day,visitor_hash', ignoreDuplicates: true },
		)
		.select('photo_id');
	// `counted` is false when this visitor already viewed the photo today.
	return json({ ok: !error, counted: !error && (data?.length ?? 0) > 0 });
};
