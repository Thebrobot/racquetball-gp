/**
 * Live results -> notifications. The Vercel cron (and GH Action fallback)
 * write the live activity feed; this turns its new "result" entries into
 * notifications for the players involved and the people following them or
 * the tournament. Idempotent: result_events remembers what was handled.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENTS } from '../../data/events';
import { getAllPlayers, getPlayerSlug } from '../../data/players';
import { notify } from './events';

export type ResultEvent = {
	id: string;
	at: string;
	type: string;
	divisionId: string;
	divisionLabel: string;
	matchId: string;
	headline: string;
	detail?: string;
	bracketHref: string;
	players?: string[];
};
export type ResultFeed = { lastUpdated: string | null; eventSlug: string; events: ResultEvent[] };

const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_BATCH = 15;

/**
 * Bracket names come through as "E Portillo Torres" or "K. Artman" and teams as
 * "Smith / Jones". Resolve each part to a player slug when the match is clear.
 */
export function resolveBracketName(entry: string): string[] {
	const players = getAllPlayers();
	const bySlug = new Set(players.map((p) => p.slug));
	const out: string[] = [];
	for (const rawPart of entry.split('/')) {
		const part = rawPart.trim();
		if (!part || /^(bye|tbd)$/i.test(part)) continue;
		const exact = getPlayerSlug(part);
		if (bySlug.has(exact)) {
			out.push(exact);
			continue;
		}
		const m = part.match(/^([A-Za-z])\.?\s+(.+)$/);
		const initial = (m ? m[1] : part[0] ?? '').toLowerCase();
		const rest = (m ? m[2] : part).trim().toLowerCase();
		const restSlug = getPlayerSlug(rest);
		const candidates = players.filter((p) => {
			const first = p.name.trim().toLowerCase()[0] ?? '';
			if (initial && first !== initial) return false;
			const words = p.name.trim().split(/\s+/);
			const tail = getPlayerSlug(words.slice(1).join(' '));
			return tail === restSlug || p.slug.endsWith(`-${restSlug}`);
		});
		if (candidates.length === 1) out.push(candidates[0].slug);
	}
	return [...new Set(out)];
}

function playersInEvent(ev: ResultEvent): string[] {
	const entries = ev.players?.length ? ev.players : ev.headline.split(/\s+def\s+/i);
	return [...new Set(entries.flatMap((e) => resolveBracketName(e)))];
}

function eventName(slug: string): string {
	return EVENTS.find((e) => e.slug === slug)?.name ?? 'Grand Prix';
}

/** Handle every unseen result in the feed. Returns counts for logging. */
export async function processResultFeed(admin: SupabaseClient, feed: ResultFeed): Promise<{ seen: number; fresh: number; notified: number }> {
	const events = (feed.events ?? []).filter((e) => e.type === 'result' && e.id);
	if (!events.length) return { seen: 0, fresh: 0, notified: 0 };

	const { data: inserted } = await admin
		.from('result_events')
		.upsert(events.map((e) => ({ id: e.id, event_slug: feed.eventSlug })), { onConflict: 'id', ignoreDuplicates: true })
		.select('id');
	const freshIds = new Set(((inserted ?? []) as { id: string }[]).map((r) => r.id));
	const fresh = events.filter((e) => freshIds.has(e.id) && Date.now() - new Date(e.at).getTime() < MAX_AGE_MS);
	// A real sync adds a handful of results at a time. A big batch means a
	// backlog (first run on a deployment with history): remember it, announce nothing.
	if (!fresh.length || fresh.length > MAX_BATCH) return { seen: events.length, fresh: fresh.length, notified: 0 };

	const name = eventName(feed.eventSlug);
	const { data: eventFollowers } = await admin.from('follows').select('user_id').eq('kind', 'event').eq('key', feed.eventSlug);
	const eventFollowerIds = ((eventFollowers ?? []) as { user_id: string }[]).map((r) => r.user_id);
	let notified = 0;

	for (const ev of fresh) {
		const slugs = playersInEvent(ev);
		const [{ data: own }, { data: fans }] = await Promise.all([
			slugs.length ? admin.from('profiles').select('id').in('player_slug', slugs).eq('notify_results', true) : Promise.resolve({ data: [] }),
			slugs.length ? admin.from('follows').select('user_id').eq('kind', 'player').in('key', slugs) : Promise.resolve({ data: [] }),
		]);
		const emailAndPush = new Set<string>([...((own ?? []) as { id: string }[]).map((r) => r.id), ...((fans ?? []) as { user_id: string }[]).map((r) => r.user_id)]);
		const pushOnly = eventFollowerIds.filter((id) => !emailAndPush.has(id));
		const payload = { eventId: ev.id, eventSlug: feed.eventSlug, eventName: name, headline: ev.headline, detail: ev.detail ?? '', divisionLabel: ev.divisionLabel, bracketHref: ev.bracketHref, players: slugs };
		await Promise.all([
			...[...emailAndPush].map((userId) => notify(admin, { userId, kind: 'result', payload, channels: { email: true, push: true } })),
			...pushOnly.map((userId) => notify(admin, { userId, kind: 'result', payload, channels: { email: false, push: true } })),
		]);
		const n = emailAndPush.size + pushOnly.length;
		notified += n;
		await admin.from('result_events').update({ notified: n }).eq('id', ev.id);
	}
	return { seen: events.length, fresh: fresh.length, notified };
}
