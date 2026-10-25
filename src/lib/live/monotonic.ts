/**
 * A partial scrape, bundled fallback, or GH Action restamp must never
 * replace a more complete live blob. Union on read/write: keep every
 * published final and every feed row; only add or update.
 */
import type { MatchMap, MatchRecord } from './parse-r2';
import { insertActivityEvent } from './activity-feed';
import type { LiveActivityFeed, LiveResultsFile } from './types';

export function isFinalWinner(record?: MatchRecord | null): boolean {
	return record?.winner === 1 || record?.winner === 2;
}

export function countFinals(divisions: Record<string, MatchMap> | undefined): number {
	return Object.values(divisions ?? {}).reduce(
		(n, div) => n + Object.values(div).filter((m) => isFinalWinner(m)).length,
		0,
	);
}

export function countMatches(divisions: Record<string, MatchMap> | undefined): number {
	return Object.values(divisions ?? {}).reduce((n, div) => n + Object.keys(div).length, 0);
}

export function unionMatchRecords(primary?: MatchRecord, secondary?: MatchRecord): MatchRecord | undefined {
	if (!primary) return secondary;
	if (!secondary) return primary;
	const primaryFinal = isFinalWinner(primary);
	const secondaryFinal = isFinalWinner(secondary);
	const winnerSrc = primaryFinal ? primary : secondaryFinal ? secondary : primary;
	const next: MatchRecord = {
		player1: primary.player1 ?? secondary.player1 ?? null,
		player2: primary.player2 ?? secondary.player2 ?? null,
	};
	if (isFinalWinner(winnerSrc)) next.winner = winnerSrc.winner;
	if (winnerSrc.score) next.score = winnerSrc.score;
	else if (primary.score) next.score = primary.score;
	else if (secondary.score) next.score = secondary.score;
	if (primary.court) next.court = primary.court;
	else if (secondary.court) next.court = secondary.court;
	if (primary.scheduledTime) next.scheduledTime = primary.scheduledTime;
	else if (secondary.scheduledTime) next.scheduledTime = secondary.scheduledTime;
	return next;
}

export function unionDivisions(
	primary: Record<string, MatchMap> | undefined,
	secondary: Record<string, MatchMap> | undefined,
): Record<string, MatchMap> {
	const ids = new Set([...Object.keys(primary ?? {}), ...Object.keys(secondary ?? {})]);
	const out: Record<string, MatchMap> = {};
	for (const divId of ids) {
		const a = primary?.[divId] ?? {};
		const b = secondary?.[divId] ?? {};
		const matchIds = new Set([...Object.keys(a), ...Object.keys(b)]);
		const div: MatchMap = {};
		for (const matchId of matchIds) {
			const row = unionMatchRecords(a[matchId], b[matchId]);
			if (row) div[matchId] = row;
		}
		out[divId] = div;
	}
	return out;
}

function laterStamp(a?: string | null, b?: string | null): string | null {
	if (!a) return b ?? null;
	if (!b) return a;
	return a > b ? a : b;
}

export function unionResultsFiles(primary: LiveResultsFile, secondary?: LiveResultsFile | null): LiveResultsFile {
	if (!secondary?.divisions) return primary;
	return {
		...primary,
		lastUpdated: laterStamp(primary.lastUpdated, secondary.lastUpdated),
		divisions: unionDivisions(primary.divisions, secondary.divisions),
		supersededOverrides: [
			...new Set([...(primary.supersededOverrides ?? []), ...(secondary.supersededOverrides ?? [])]),
		],
	};
}

/** True when `next` lost a published final or dropped a match vs `prev`. */
export function isResultsRegression(prev: LiveResultsFile, next: LiveResultsFile): boolean {
	if (countFinals(next.divisions) < countFinals(prev.divisions)) return true;
	if (countMatches(next.divisions) < countMatches(prev.divisions)) return true;
	for (const [divId, matches] of Object.entries(prev.divisions ?? {})) {
		for (const [matchId, row] of Object.entries(matches)) {
			if (!isFinalWinner(row)) continue;
			if (!isFinalWinner(next.divisions?.[divId]?.[matchId])) return true;
		}
	}
	return false;
}

export function isActivityRegression(prev: LiveActivityFeed, next: LiveActivityFeed): boolean {
	return (next.events?.length ?? 0) < (prev.events?.length ?? 0);
}

export function unionActivityFeeds(primary: LiveActivityFeed, secondary?: LiveActivityFeed | null): LiveActivityFeed {
	let next: LiveActivityFeed = {
		...primary,
		eventSlug: primary.eventSlug || secondary?.eventSlug || primary.eventSlug,
		events: [...(primary.events ?? [])],
		lastUpdated: laterStamp(primary.lastUpdated, secondary?.lastUpdated),
	};
	for (const entry of secondary?.events ?? []) {
		next = insertActivityEvent(next, entry);
	}
	return next;
}

/**
 * Blob vs bundled: never pick the side with fewer finals just because its
 * lastUpdated is newer (the 06:13Z GH Action restamp).
 */
export function pickRicherResults(
	live: LiveResultsFile | null | undefined,
	bundled: LiveResultsFile,
): LiveResultsFile {
	if (!live?.divisions) return bundled;
	const liveN = countFinals(live.divisions);
	const bundledN = countFinals(bundled.divisions);
	if (bundledN > liveN) return bundled;
	if (liveN > bundledN) return live;
	return live;
}

export function pickRicherActivity(
	live: LiveActivityFeed | null | undefined,
	bundled: LiveActivityFeed,
): LiveActivityFeed {
	if (!live?.events?.length) return bundled;
	if ((bundled.events?.length ?? 0) > live.events.length) return bundled;
	return live;
}
