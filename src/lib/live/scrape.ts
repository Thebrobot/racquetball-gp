import overridesJson from '../../../scripts/match-result-overrides.json';
import { drawOutUrl, type LiveEventConfig } from './config';
import { parseBracketPage, resolveDivCodeFromHtml, type MatchMap, type MatchRecord } from './parse-r2';
import { readLiveActivity, readLiveResults } from './store';
import type { LiveActivityEvent, LiveActivityFeed, LiveResultsFile } from './types';

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_ATTEMPTS = 3;
const MAX_ACTIVITY_EVENTS = 80;

const MATCH_OVERRIDES = overridesJson as Record<string, Record<string, Record<string, MatchRecord>>>;

export type DivisionScrape = {
	code: string;
	divId: string | null;
	ok: boolean;
	error?: string;
	matchCount: number;
	withResults: number;
	data: MatchMap;
};

export type EventScrapeResult = {
	scraped: number;
	matchesWithResults: number;
	divisions: Record<string, MatchMap>;
	divisionReports: DivisionScrape[];
	errors: string[];
};

async function fetchDivision(url: string): Promise<{ html: string; finalUrl: string }> {
	const res = await fetch(url, {
		headers: {
			'user-agent': USER_AGENT,
			accept: 'text/html,application/xhtml+xml',
		},
		redirect: 'follow',
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return { html: await res.text(), finalUrl: res.url };
}

async function scrapeDivision(event: LiveEventConfig, divID: number, combinedID: number): Promise<{
	divCode: string | null;
	divId: string | null;
	data: MatchMap;
}> {
	const { html, finalUrl } = await fetchDivision(drawOutUrl(event, divID, combinedID));
	const divCode = resolveDivCodeFromHtml(html);
	const divId = divCode ? event.codeIdMap[divCode] ?? null : null;
	if (!divId) return { divCode, divId: null, data: {} };
	return { divCode, divId, data: parseBracketPage(html, finalUrl) };
}

export async function scrapeEvent(event: LiveEventConfig): Promise<EventScrapeResult> {
	const divisions: Record<string, MatchMap> = {};
	const divisionReports: DivisionScrape[] = [];
	const errors: string[] = [];
	let scraped = 0;
	let matchesWithResults = 0;

	for (const { code, divID, combinedID } of event.divisionUrls) {
		let lastErr: unknown = null;
		let succeeded = false;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
			try {
				const { divCode, divId, data } = await scrapeDivision(event, divID, combinedID);
				succeeded = true;
				if (!divId) {
					divisionReports.push({
						code,
						divId: null,
						ok: false,
						error: `could not resolve division (got "${divCode}")`,
						matchCount: 0,
						withResults: 0,
						data: {},
					});
					break;
				}
				const matchCount = Object.keys(data).length;
				const withResults = Object.values(data).filter((d) => d.winner != null).length;
				if (matchCount > 0) {
					divisions[divId] = data;
					scraped += 1;
					matchesWithResults += withResults;
				}
				divisionReports.push({ code, divId, ok: true, matchCount, withResults, data });
			} catch (err) {
				lastErr = err;
			}
		}
		if (!succeeded) {
			const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
			errors.push(`${code}: ${message}`);
			divisionReports.push({
				code,
				divId: null,
				ok: false,
				error: message.slice(0, 200),
				matchCount: 0,
				withResults: 0,
				data: {},
			});
		}
	}

	return { scraped, matchesWithResults, divisions, divisionReports, errors };
}

export function mergeDivisions(
	existing: Record<string, MatchMap>,
	incoming: Record<string, MatchMap>,
): Record<string, MatchMap> {
	const merged: Record<string, MatchMap> = { ...existing };
	for (const [divId, matches] of Object.entries(incoming)) {
		const existingDiv = merged[divId] ?? {};
		const mergedDiv: MatchMap = { ...existingDiv };
		for (const [matchId, newMatch] of Object.entries(matches)) {
			mergedDiv[matchId] = { ...(existingDiv[matchId] ?? {}), ...newMatch };
		}
		merged[divId] = mergedDiv;
	}
	return merged;
}

export function applyMatchOverrides(slug: string, divisions: Record<string, MatchMap>): Record<string, MatchMap> {
	const overrides = MATCH_OVERRIDES[slug] ?? {};
	const next = { ...divisions };
	for (const [divId, matches] of Object.entries(overrides)) {
		if (!matches || typeof matches !== 'object') continue;
		const div = { ...(next[divId] ?? {}) };
		for (const [matchId, patch] of Object.entries(matches)) {
			div[matchId] = { ...(div[matchId] ?? {}), ...patch };
		}
		next[divId] = div;
	}
	return next;
}

function winnerLoserNames(match: MatchRecord): { winnerName: string; loserName: string } | null {
	if (match.winner !== 1 && match.winner !== 2) return null;
	const winnerName = match.winner === 1 ? match.player1 : match.player2;
	const loserName = match.winner === 1 ? match.player2 : match.player1;
	if (!winnerName?.trim() || !loserName?.trim()) return null;
	return { winnerName: winnerName.trim(), loserName: loserName.trim() };
}

export function detectActivityChanges(
	event: LiveEventConfig,
	prevDivisions: Record<string, MatchMap>,
	nextDivisions: Record<string, MatchMap>,
	at: string,
): LiveActivityEvent[] {
	const newEvents: LiveActivityEvent[] = [];
	for (const [divId, matches] of Object.entries(nextDivisions)) {
		const divisionLabel = event.divisionLabels[divId] ?? divId;
		for (const [matchId, newMatch] of Object.entries(matches)) {
			const oldMatch = prevDivisions[divId]?.[matchId];
			const hadWinner = oldMatch?.winner === 1 || oldMatch?.winner === 2;
			const hasWinner = newMatch.winner === 1 || newMatch.winner === 2;
			if (!hasWinner) continue;
			const winnerChanged = oldMatch?.winner !== newMatch.winner;
			const scoreChanged =
				(oldMatch?.score ?? null) !== (newMatch.score ?? null) && newMatch.score != null;
			const newlySet = !hadWinner && hasWinner;
			if (!newlySet && !winnerChanged && !scoreChanged) continue;
			const names = winnerLoserNames(newMatch);
			if (!names) continue;
			newEvents.push({
				id: `${at}-${divId}-${matchId}`,
				at,
				type: 'result',
				divisionId: divId,
				divisionLabel,
				matchId,
				headline: `${names.winnerName} def ${names.loserName}`,
				detail: newMatch.score ?? undefined,
				bracketHref: `/events/${event.slug}/divisions/${divId}`,
			});
		}
	}
	return newEvents;
}

export async function buildMergedResults(
	event: LiveEventConfig,
	scraped: EventScrapeResult,
	at = new Date().toISOString(),
): Promise<{ results: LiveResultsFile; activity: LiveActivityFeed; changed: boolean; newActivity: number }> {
	const existing = await readLiveResults(event.slug);
	const mergedDivisions = applyMatchOverrides(
		event.slug,
		mergeDivisions(existing.divisions ?? {}, scraped.divisions),
	);
	const changed = JSON.stringify(mergedDivisions) !== JSON.stringify(existing.divisions ?? {});
	const stamp = changed ? at : existing.lastUpdated;
	const results: LiveResultsFile = {
		lastUpdated: stamp,
		divisions: mergedDivisions,
	};

	const prevFeed = await readLiveActivity();
	const newActivity = changed
		? detectActivityChanges(event, existing.divisions ?? {}, mergedDivisions, at)
		: [];
	const prevEvents = prevFeed.eventSlug === event.slug ? (prevFeed.events ?? []) : [];
	const activity: LiveActivityFeed = {
		lastUpdated: stamp ?? prevFeed.lastUpdated,
		eventSlug: event.slug,
		events: [...newActivity, ...prevEvents].slice(0, MAX_ACTIVITY_EVENTS),
	};

	return { results, activity, changed, newActivity: newActivity.length };
}
