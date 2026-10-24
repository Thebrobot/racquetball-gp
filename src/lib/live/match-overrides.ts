/**
 * Manual R2 result patches. Applied on read (so a deploy shows them while
 * Vercel is IP-blocked) and on write. A later successful r2-push that
 * disagrees supersedes the patch so we do not block real updates.
 */
import overridesJson from '../../../scripts/match-result-overrides.json';
import type { MatchMap, MatchRecord } from './parse-r2';
import { normalizeCourt } from './r2-match-fetch';
import { scoresEqual } from './r2-names';
import type { LiveResultsFile } from './types';

export const MATCH_OVERRIDES = overridesJson as Record<string, Record<string, Record<string, MatchRecord>>>;

export function overrideKey(divId: string, matchId: string): string {
	return `${divId}:${matchId}`;
}

export function applyMatchOverrides(
	slug: string,
	divisions: Record<string, MatchMap>,
	superseded: string[] = [],
): Record<string, MatchMap> {
	const overrides = MATCH_OVERRIDES[slug] ?? {};
	const blocked = new Set(superseded);
	const next = { ...divisions };
	for (const [divId, matches] of Object.entries(overrides)) {
		if (!matches || typeof matches !== 'object') continue;
		const div = { ...(next[divId] ?? {}) };
		for (const [matchId, patch] of Object.entries(matches)) {
			if (blocked.has(overrideKey(divId, matchId))) continue;
			div[matchId] = { ...(div[matchId] ?? {}), ...patch };
		}
		next[divId] = div;
	}
	return next;
}

/** True when a confirmed R2 record disagrees with the override on a patched field. */
export function overrideYieldsToR2(patch: MatchRecord, r2: MatchRecord, r2IsFinal: boolean): boolean {
	if (patch.winner != null && r2.winner != null && patch.winner !== r2.winner) return true;
	if (patch.score && r2.score && !scoresEqual(patch.score, r2.score)) return true;
	if (patch.court) {
		const r2Court = normalizeCourt(r2.court);
		const ovCourt = normalizeCourt(patch.court);
		if (r2Court && ovCourt && r2Court !== ovCourt) return true;
		if (!r2Court && !r2IsFinal) return true;
	}
	return false;
}

export function collectSupersededOverrides(
	slug: string,
	confirmed: Record<string, MatchMap>,
	prev: string[] = [],
): string[] {
	const overrides = MATCH_OVERRIDES[slug] ?? {};
	const out = new Set(prev);
	for (const [divId, matches] of Object.entries(overrides)) {
		if (!matches || typeof matches !== 'object') continue;
		for (const [matchId, patch] of Object.entries(matches)) {
			const r2 = confirmed[divId]?.[matchId];
			if (!r2) continue;
			const final = r2.winner === 1 || r2.winner === 2;
			if (overrideYieldsToR2(patch, r2, final)) out.add(overrideKey(divId, matchId));
		}
	}
	return [...out];
}

/** Apply unread overrides onto last-good blob data without scraping R2. */
export function overlayOverridesOnFile(
	slug: string,
	existing: LiveResultsFile,
	at: string,
): { results: LiveResultsFile; changed: boolean } {
	const divisions = applyMatchOverrides(slug, existing.divisions ?? {}, existing.supersededOverrides);
	const changed = JSON.stringify(divisions) !== JSON.stringify(existing.divisions ?? {});
	return {
		results: {
			...existing,
			lastUpdated: changed ? at : existing.lastUpdated,
			divisions,
		},
		changed,
	};
}
