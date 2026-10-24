import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, env, json } from '../../../lib/accounts/supabase';
import { albumById, albumBySlug } from '../../../lib/gallery/albums';
import { groupPendingByUploader, submissionDigestCopy } from '../../../lib/notify/copy';
import { emailConfigured, layout, sendEmail, siteOrigin, type PhotoCard } from '../../../lib/notify/email';
import { photoCard, photoThumb } from '../../../lib/notify/events';
import { pushConfigured, sendPushToUser } from '../../../lib/notify/push';

export const prerender = false;

type LikeRow = { id: string; user_id: string; photo_id: string | null; created_at: string };
type SubRow = { id: string; user_id: string; actor_id: string | null; created_at: string };
type PendingRow = { id: string; user_id: string; album: string; caption: string | null; url: string };
type Person = { id: string; email: string; display_name: string | null; player_slug: string | null; notify_email: boolean; notify_push: boolean };

/**
 * End-of-day roll-up, run by Vercel Cron (see vercel.json). Likes become one
 * email and one push per person. Unsent submission alerts become one email
 * per admin, e.g. "Daniel sent 12 photos for review".
 */
export const GET: APIRoute = async ({ request }) => {
	const secret = env('CRON_SECRET');
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Unauthorized' }, 401);
	const admin = createAdminClient();
	if (!admin) return json({ error: 'Not configured.' }, 503);

	const likes = await sendLikeDigest(admin);
	const submissions = await sendSubmissionDigest(admin);
	return json({ ok: true, people: likes.people, sentTo: likes.sentTo, submissions });
};

async function sendLikeDigest(admin: SupabaseClient): Promise<{ people: number; sentTo: number }> {
	const { data } = await admin.from('notifications').select('id, user_id, photo_id, created_at').eq('kind', 'like').is('emailed_at', null).limit(5000);
	const rows = (data ?? []) as LikeRow[];
	if (!rows.length) return { people: 0, sentTo: 0 };

	const byUser = new Map<string, LikeRow[]>();
	for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
	const { data: people } = await admin.from('profiles').select('id, email, display_name, player_slug, notify_email, notify_push').in('id', [...byUser.keys()]);
	const origin = siteOrigin();
	let sentTo = 0;

	for (const person of (people ?? []) as Person[]) {
		const likes = byUser.get(person.id) ?? [];
		const perPhoto = new Map<string, number>();
		for (const l of likes) if (l.photo_id) perPhoto.set(l.photo_id, (perPhoto.get(l.photo_id) ?? 0) + 1);
		const total = likes.length;
		const cards: PhotoCard[] = [];
		for (const [photoId, n] of [...perPhoto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
			const card = await photoCard(photoId, `${n} new ${n === 1 ? 'like' : 'likes'}`);
			if (card) cards.push(card);
		}
		const heading = `${total} new ${total === 1 ? 'like' : 'likes'} on your photos`;
		const intro = `People liked ${perPhoto.size === 1 ? 'a photo' : `${perPhoto.size} photos`} you're tagged in today.`;
		const href = person.player_slug ? `${origin}/players/${person.player_slug}` : `${origin}/gallery`;
		const stamp: Record<string, string> = {};
		if (person.notify_email && emailConfigured()) {
			const { html, text } = layout({ heading, intro, cards, cta: { label: 'See your photos', href } });
			if (await sendEmail(person.email, heading, html, text)) stamp.emailed_at = new Date().toISOString();
		}
		if (person.notify_push && pushConfigured()) {
			const sent = await sendPushToUser(admin, person.id, { title: heading, body: intro, url: href, tag: 'likes-digest' });
			if (sent > 0) stamp.pushed_at = new Date().toISOString();
		}
		// Mark the batch handled either way, so a switched-off person is not re-processed daily.
		await admin.from('notifications').update({ emailed_at: stamp.emailed_at ?? new Date().toISOString(), ...(stamp.pushed_at ? { pushed_at: stamp.pushed_at } : {}) }).in('id', likes.map((l) => l.id));
		if (Object.keys(stamp).length) sentTo += 1;
	}
	return { people: byUser.size, sentTo };
}

async function sendSubmissionDigest(admin: SupabaseClient): Promise<{ people: number; sentTo: number }> {
	const { data } = await admin.from('notifications').select('id, user_id, actor_id, created_at').eq('kind', 'submission').is('emailed_at', null).limit(5000);
	const rows = (data ?? []) as SubRow[];
	if (!rows.length) return { people: 0, sentTo: 0 };

	const byAdmin = new Map<string, SubRow[]>();
	for (const r of rows) byAdmin.set(r.user_id, [...(byAdmin.get(r.user_id) ?? []), r]);

	const { data: pendingData } = await admin.from('photo_submissions').select('id, user_id, album, caption, url').eq('status', 'pending');
	const pending = (pendingData ?? []) as PendingRow[];
	const uploaderIds = [...new Set(pending.map((p) => p.user_id))];
	const { data: uploaders } = uploaderIds.length ? await admin.from('profiles').select('id, display_name').in('id', uploaderIds) : { data: [] };
	const names = Object.fromEntries(((uploaders ?? []) as { id: string; display_name: string | null }[]).map((u) => [u.id, u.display_name]));

	const { data: people } = await admin.from('profiles').select('id, email, display_name, player_slug, notify_email, notify_push').in('id', [...byAdmin.keys()]);
	const origin = siteOrigin();
	const href = `${origin}/admin#photos`;
	let sentTo = 0;

	for (const person of (people ?? []) as Person[]) {
		const notifs = byAdmin.get(person.id) ?? [];
		const actorIds = new Set<string>();
		for (const n of notifs) if (n.actor_id) actorIds.add(n.actor_id);
		const groups = groupPendingByUploader(pending, names, actorIds.size ? actorIds : undefined);
		const stamp: Record<string, string> = {};
		if (groups.length) {
			const { heading, intro } = submissionDigestCopy(groups);
			const cards: PhotoCard[] = [];
			const allowed = new Set(groups.map((g) => g.userId));
			for (const p of pending) {
				if (!allowed.has(p.user_id) || cards.length >= 6) continue;
				const album = albumById(p.album) ?? albumBySlug(p.album);
				cards.push({
					url: photoThumb(p.url),
					href,
					label: album?.label ?? 'Racquetball Grand Prix',
					caption: p.caption,
					note: names[p.user_id] || undefined,
				});
			}
			if (person.notify_email && emailConfigured()) {
				const { html, text } = layout({ heading, intro, cards, cta: { label: 'Open the admin queue', href } });
				if (await sendEmail(person.email, heading, html, text)) stamp.emailed_at = new Date().toISOString();
			}
			if (person.notify_push && pushConfigured()) {
				const sent = await sendPushToUser(admin, person.id, { title: heading, body: intro, url: href, tag: 'submissions-digest' });
				if (sent > 0) stamp.pushed_at = new Date().toISOString();
			}
		}
		await admin.from('notifications').update({ emailed_at: stamp.emailed_at ?? new Date().toISOString(), ...(stamp.pushed_at ? { pushed_at: stamp.pushed_at } : {}) }).in('id', notifs.map((n) => n.id));
		if (Object.keys(stamp).length) sentTo += 1;
	}
	return { people: byAdmin.size, sentTo };
}
