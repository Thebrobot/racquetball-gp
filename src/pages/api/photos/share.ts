import type { APIRoute } from 'astro';
import { createAdminClient, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId, todayUtc, visitorHash } from '../../../lib/accounts/visitor';

export const prerender = false;

const CHANNELS = new Set(['link', 'copy', 'facebook', 'x', 'native', 'download']);

/** Count a share action (one per visitor, photo, channel and day). */
export const POST: APIRoute = async ({ request, clientAddress }) => {
	const admin = createAdminClient();
	if (!admin) return json({ ok: false }, 503);

	const body = (await request.json().catch(() => ({}))) as { photoId?: unknown; channel?: unknown };
	if (!isValidPhotoId(body.photoId)) return json({ error: 'Bad photo id.' }, 400);
	const channel = typeof body.channel === 'string' && CHANNELS.has(body.channel) ? body.channel : 'link';

	let address: string | undefined;
	try {
		address = clientAddress;
	} catch {
		address = undefined;
	}
	const { error } = await admin
		.from('photo_shares')
		.upsert(
			{ photo_id: body.photoId, day: todayUtc(), visitor_hash: visitorHash(request, address), channel },
			{ onConflict: 'photo_id,day,visitor_hash,channel', ignoreDuplicates: true },
		);
	return json({ ok: !error });
};
