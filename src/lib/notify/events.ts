/**
 * The notification layer. Something happens (a tag, a comment, a like, a claim
 * approval) -> one row per recipient in `notifications` -> delivered by email
 * and browser push according to the recipient's switches. Instant kinds go out
 * right away; likes wait for the end-of-day roll-up (api/cron/digest).
 * Nothing here throws: a failed notification must never fail the user's action.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPhotoById } from '../gallery/store';
import { albumById, albumBySlug } from '../gallery/albums';
import { emailConfigured, layout, sendEmail, siteOrigin, type PhotoCard } from './email';
import { pushConfigured, sendPushToUser } from './push';

export type NotificationKind = 'claim_approved' | 'tagged' | 'comment' | 'like';

type Recipient = { id: string; email: string; display_name: string | null; player_slug: string | null; notify_email: boolean; notify_push: boolean };

export type NotifyInput = {
	userId: string;
	kind: NotificationKind;
	photoId?: string | null;
	actorId?: string | null;
	payload?: Record<string, unknown>;
};

export function photoHref(photoId: string): string {
	return `${siteOrigin()}/gallery/p/${photoId}`;
}

/** Small square thumbnail through the site's image endpoint, absolute for email clients. */
export function photoThumb(url: string): string {
	return `${siteOrigin()}/_image?href=${encodeURIComponent(url)}&w=192&h=192&fit=cover&f=jpeg&q=72`;
}

export async function photoCard(photoId: string, note?: string): Promise<PhotoCard | null> {
	const photo = await getPhotoById(photoId).catch(() => undefined);
	if (!photo) return null;
	const album = albumById(photo.album) ?? albumBySlug(photo.album);
	return { url: photoThumb(photo.url), href: photoHref(photoId), label: album?.label ?? 'Racquetball Grand Prix', caption: photo.caption ?? null, note };
}

async function recipient(admin: SupabaseClient, userId: string): Promise<Recipient | null> {
	const { data } = await admin.from('profiles').select('id, email, display_name, player_slug, notify_email, notify_push').eq('id', userId).maybeSingle();
	return (data as Recipient | null) ?? null;
}

async function actorName(admin: SupabaseClient, actorId: string | null | undefined): Promise<string> {
	if (!actorId) return 'Someone';
	const { data } = await admin.from('profiles').select('display_name').eq('id', actorId).maybeSingle();
	return (data as { display_name: string | null } | null)?.display_name || 'Someone';
}

/** Accounts linked to the players tagged in a photo, minus anyone excluded. */
export async function taggedUserIds(admin: SupabaseClient, photoId: string, exclude: string[] = []): Promise<string[]> {
	const { data: tags } = await admin.from('photo_tags').select('player_slug').eq('photo_id', photoId);
	const slugs = ((tags ?? []) as { player_slug: string }[]).map((t) => t.player_slug);
	if (!slugs.length) return [];
	const { data: profiles } = await admin.from('profiles').select('id').in('player_slug', slugs);
	return ((profiles ?? []) as { id: string }[]).map((p) => p.id).filter((id) => !exclude.includes(id));
}

/** Record an event and, for instant kinds, deliver it. */
export async function notify(admin: SupabaseClient, input: NotifyInput): Promise<void> {
	try {
		const { data: row } = await admin
			.from('notifications')
			.insert({ user_id: input.userId, kind: input.kind, photo_id: input.photoId ?? null, actor_id: input.actorId ?? null, payload: input.payload ?? {} })
			.select('id')
			.single();
		if (input.kind === 'like' || !row) return;
		await deliverInstant(admin, (row as { id: string }).id, input);
	} catch {
		/* never fail the caller */
	}
}

export async function notifyMany(admin: SupabaseClient, userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
	await Promise.all(userIds.map((userId) => notify(admin, { ...input, userId })));
}

async function deliverInstant(admin: SupabaseClient, rowId: string, input: NotifyInput): Promise<void> {
	const to = await recipient(admin, input.userId);
	if (!to) return;
	const origin = siteOrigin();
	const who = await actorName(admin, input.actorId);
	const card = input.photoId ? await photoCard(input.photoId) : null;

	let subject = '';
	let heading = '';
	let intro = '';
	let cta = { label: 'Open the gallery', href: `${origin}/gallery` };
	let pushBody = '';

	if (input.kind === 'claim_approved') {
		const name = String(input.payload?.playerName ?? 'your player profile');
		subject = 'Your player profile is verified';
		heading = `You're verified, ${to.display_name || name}`;
		intro = `Your account is now linked to ${name}. Your profile shows the verified badge, and photos you tag yourself in will show up there.`;
		cta = { label: 'See your profile', href: `${origin}/players/${to.player_slug ?? ''}` };
		pushBody = `Your account is now linked to ${name}.`;
	} else if (input.kind === 'tagged') {
		subject = `${who} tagged you in a photo`;
		heading = `${who} tagged you in a photo`;
		intro = card ? `You are in this ${card.label} photo. It is on your player profile now.` : 'A new photo of you is on your player profile.';
		if (input.photoId) cta = { label: 'See the photo', href: photoHref(input.photoId) };
		pushBody = card ? `You're in a ${card.label} photo.` : 'A new photo of you was added.';
	} else if (input.kind === 'comment') {
		const body = String(input.payload?.body ?? '').trim();
		subject = `${who} commented on your photo`;
		heading = `${who} commented on your photo`;
		intro = body ? `"${body.length > 160 ? `${body.slice(0, 157)}…` : body}"` : 'There is a new comment on a photo you are tagged in.';
		if (input.photoId) cta = { label: 'Reply', href: photoHref(input.photoId) };
		pushBody = body ? `${who}: ${body.length > 90 ? `${body.slice(0, 87)}…` : body}` : `${who} commented on a photo you're in.`;
	}

	const stamp: Record<string, string> = {};
	if (to.notify_email && emailConfigured()) {
		const { html, text } = layout({ heading, intro, cards: card ? [card] : [], cta });
		if (await sendEmail(to.email, subject, html, text)) stamp.emailed_at = new Date().toISOString();
	}
	if (to.notify_push && pushConfigured()) {
		const sent = await sendPushToUser(admin, to.id, { title: subject, body: pushBody, url: cta.href, tag: `${input.kind}:${input.photoId ?? rowId}` });
		if (sent > 0) stamp.pushed_at = new Date().toISOString();
	}
	if (Object.keys(stamp).length) await admin.from('notifications').update(stamp).eq('id', rowId);
}
