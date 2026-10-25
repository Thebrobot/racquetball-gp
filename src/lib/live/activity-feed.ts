/**
 * Keep the live activity feed in sync with published finals.
 * Overrides / last-good blob overlays can write a winner without going
 * through detectActivityChanges; ensure + backfill close that gap.
 */
import backfillJson from '../../../scripts/activity-feed-backfill.json';
import type { MatchMap, MatchRecord } from './parse-r2';
import type { LiveActivityEvent, LiveActivityFeed } from './types';

export const ACTIVITY_BACKFILLS = backfillJson as Record<string, LiveActivityEvent[]>;

export type ActivityEventConfig = {
	slug: string;
	divisionLabels: Record<string, string>;
};

function winnerLoserNames(match: MatchRecord): { winnerName: string; loserName: string } | null {
	if (match.winner !== 1 && match.winner !== 2) return null;
	const winnerName = match.winner === 1 ? match.player1 : match.player2;
	const loserName = match.winner === 1 ? match.player2 : match.player1;
	if (!winnerName?.trim() || !loserName?.trim()) return null;
	return { winnerName: winnerName.trim(), loserName: loserName.trim() };
}

export function feedHasMatch(feed: LiveActivityFeed, matchId: string): boolean {
	return (feed.events ?? []).some((ev) => ev.matchId === matchId);
}

export function isCorrectionEvent(ev: LiveActivityEvent): boolean {
	return Boolean(ev.correction || ev.type === 'correction' || /^correction:/i.test(ev.headline ?? ''));
}

function withCorrectionPrefix(headline: string): string {
	return /^correction:/i.test(headline) ? headline : `Correction: ${headline}`;
}

/**
 * Same matchId: keep the earlier `at` and any Correction prefix.
 * Never restamp a restored/backfilled row with a later restore-run time.
 */
export function reconcileActivityEvent(a: LiveActivityEvent, b: LiveActivityEvent): LiveActivityEvent {
	const earlier = a.at <= b.at ? a : b;
	const later = earlier === a ? b : a;
	const correctionSrc = isCorrectionEvent(a) ? a : isCorrectionEvent(b) ? b : null;
	const at = earlier.at;
	const headline = correctionSrc
		? withCorrectionPrefix(correctionSrc.headline.replace(/^correction:\s*/i, ''))
		: earlier.headline;
	return {
		...later,
		...earlier,
		id: `${at}-${earlier.divisionId}-${earlier.matchId}`,
		at,
		headline,
		detail: earlier.detail ?? later.detail,
		...(correctionSrc ? { correction: true } : {}),
	};
}

export function makeResultActivityEvent(
	event: ActivityEventConfig,
	divId: string,
	matchId: string,
	match: MatchRecord,
	at: string,
	correction = false,
): LiveActivityEvent | null {
	const names = winnerLoserNames(match);
	if (!names) return null;
	const headline = `${names.winnerName} def ${names.loserName}`;
	return {
		id: `${at}-${divId}-${matchId}`,
		at,
		type: 'result',
		divisionId: divId,
		divisionLabel: event.divisionLabels[divId] ?? divId,
		matchId,
		headline: correction ? `Correction: ${headline}` : headline,
		detail: match.score ?? undefined,
		bracketHref: `/events/${event.slug}/divisions/${divId}`,
		...(correction ? { correction: true } : {}),
	};
}

/** Newest-first. Reconciles `at` / Correction when the match already exists. */
export function insertActivityEvent(feed: LiveActivityFeed, entry: LiveActivityEvent): LiveActivityFeed {
	const events = [...(feed.events ?? [])];
	const idx = events.findIndex((ev) => ev.matchId === entry.matchId);
	if (idx >= 0) events[idx] = reconcileActivityEvent(events[idx], entry);
	else events.push(entry);
	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
	const maxAt = events.reduce((m, ev) => (!m || ev.at > m ? ev.at : m), '' as string);
	return { ...feed, lastUpdated: maxAt || feed.lastUpdated, eventSlug: feed.eventSlug, events };
}

export function applyActivityBackfills(slug: string, feed: LiveActivityFeed): LiveActivityFeed {
	let next: LiveActivityFeed = { ...feed, eventSlug: feed.eventSlug || slug, events: [...(feed.events ?? [])] };
	for (const entry of ACTIVITY_BACKFILLS[slug] ?? []) {
		next = insertActivityEvent(next, entry);
	}
	return next;
}

export function pinnedActivityEvent(slug: string, matchId: string): LiveActivityEvent | undefined {
	return ACTIVITY_BACKFILLS[slug]?.find((ev) => ev.matchId === matchId);
}

export function pinnedActivityStamp(slug: string, matchId: string): string | undefined {
	return ACTIVITY_BACKFILLS[slug]?.find((ev) => ev.matchId === matchId)?.at;
}

/**
 * Append a feed row for every published final that the feed does not yet have.
 * Uses a pinned backfill stamp when one exists so deploy/read does not invent
 * a time that jumps the order. Newly final matches in this run use `at`.
 */
export function ensureActivityForFinals(
	event: ActivityEventConfig,
	divisions: Record<string, MatchMap>,
	feed: LiveActivityFeed,
	opts?: { at?: string; resultStamp?: string | null; prevDivisions?: Record<string, MatchMap> },
): LiveActivityFeed {
	let next = applyActivityBackfills(event.slug, feed);
	for (const [divId, matches] of Object.entries(divisions)) {
		for (const [matchId, match] of Object.entries(matches)) {
			if (match.winner !== 1 && match.winner !== 2) continue;
			if (feedHasMatch(next, matchId)) continue;
			const prev = opts?.prevDivisions?.[divId]?.[matchId];
			const newlyFinal = prev?.winner !== 1 && prev?.winner !== 2;
			const stamp =
				pinnedActivityStamp(event.slug, matchId) ??
				(newlyFinal ? opts?.at : undefined) ??
				opts?.resultStamp ??
				opts?.at;
			if (!stamp) continue;
			const entry = makeResultActivityEvent(event, divId, matchId, match, stamp);
			if (entry) next = insertActivityEvent(next, entry);
		}
	}
	return next;
}
