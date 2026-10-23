/**
 * Browser push through the Web Push protocol (VAPID). Keys live in
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Dead subscriptions are pruned as we go.
 */
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../accounts/supabase';

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export function pushPublicKey(): string {
	return env('VAPID_PUBLIC_KEY', 'PUBLIC_VAPID_PUBLIC_KEY');
}
export function pushConfigured(): boolean {
	return Boolean(pushPublicKey() && env('VAPID_PRIVATE_KEY'));
}

let configured = false;
function ensureVapid(): boolean {
	if (!pushConfigured()) return false;
	if (!configured) {
		webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:info@thebrobot.com', pushPublicKey(), env('VAPID_PRIVATE_KEY'));
		configured = true;
	}
	return true;
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string };

/** Send one notification to every browser the user has subscribed. Returns how many accepted it. */
export async function sendPushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
	if (!ensureVapid()) return 0;
	const { data } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
	const subs = (data ?? []) as Row[];
	let delivered = 0;
	await Promise.all(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
				delivered += 1;
				await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id);
			} catch (err) {
				const status = (err as { statusCode?: number }).statusCode;
				// Gone or unsubscribed: forget it.
				if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
			}
		}),
	);
	return delivered;
}
