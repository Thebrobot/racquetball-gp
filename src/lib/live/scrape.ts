import overridesJson from '../../../scripts/match-result-overrides.json';
import { drawOutUrl, type LiveEventConfig } from './config';
import {
	describeBadMatchHtml,
	htmlHasWinnerMark,
	htmlLooksLikeMatchPage,
	matchPageUrl,
	parseMatchPage,
	type ParsedMatchPage,
} from './parse-match-page';
import {
	parseBracketPage,
	resolveDivCodeFromHtml,
	type DrawPageParse,
	type MatchMap,
	type MatchRecord,
	type ParsedDrawMatch,
} from './parse-r2';
import { resolveMatchResult, resultFieldsEqual } from './resolve-results';
import { scoresEqual } from './r2-names';
import { readLiveActivity, readLiveResults, writeResultAuditHtml } from './store';
import type { LiveActivityEvent, LiveActivityFeed, LiveResultsFile, QuarantinedMatch } from './types';

export const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Full Chrome navigation headers — Vercel/datacenter fetches need these, not UA alone. */
export const BROWSER_HEADERS: Record<string, string> = {
	'user-agent': USER_AGENT,
	accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
	'accept-language': 'en-US,en;q=0.9',
	'cache-control': 'max-age=0',
	'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"macOS"',
	'sec-fetch-dest': 'document',
	'sec-fetch-mode': 'navigate',
	'sec-fetch-site': 'same-origin',
	'sec-fetch-user': '?1',
	'upgrade-insecure-requests': '1',
};

const MAX_ATTEMPTS = 3;
const MAX_ACTIVITY_EVENTS = 600;
const MATCH_PAGE_CONCURRENCY = 3;

const MATCH_OVERRIDES = overridesJson as Record<string, Record<string, Record<string, MatchRecord>>>;

export type DivisionScrape = {
	code: string;
	divId: string | null;
	ok: boolean;
	error?: string;
	matchCount: number;
	withResults: number;
	data: MatchMap;
	draw?: DrawPageParse;
	drawHtml?: string;
};

export type EventScrapeResult = {
	scraped: number;
	matchesWithResults: number;
	divisions: Record<string, MatchMap>;
	divisionReports: DivisionScrape[];
	errors: string[];
	quarantined: QuarantinedMatch[];
	resolvedMatchIds: string[];
	audit: Array<{ matchId: string; html: string }>;
};

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const FETCH_ATTEMPTS = 3;

export function isRetryableStatus(status: number): boolean {
	return RETRYABLE_STATUS.has(status);
}

async function fetchHtml(url: string, referer?: string): Promise<{ html: string; finalUrl: string }> {
	let lastErr: unknown = null;
	for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
		try {
			const res = await fetch(url, {
				headers: {
					...BROWSER_HEADERS,
					referer: referer || 'https://www.r2sports.com/',
				},
				redirect: 'follow',
				signal: AbortSignal.timeout(15_000),
			});
			if (res.ok) return { html: await res.text(), finalUrl: res.url };
			lastErr = new Error(`HTTP ${res.status} for ${url}`);
			if (!isRetryableStatus(res.status) || attempt === FETCH_ATTEMPTS) throw lastErr;
		} catch (err) {
			lastErr = err;
			const message = err instanceof Error ? err.message : String(err);
			const retryable = /HTTP 50[0-4]|network|timeout|fetch/i.test(message);
			if (!retryable || attempt === FETCH_ATTEMPTS) throw err;
		}
		await new Promise((r) => setTimeout(r, 250 * attempt));
	}
	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function scrapeDivision(
	event: LiveEventConfig,
	divID: number,
	combinedID: number,
): Promise<{
	divCode: string | null;
	divId: string | null;
	draw: DrawPageParse;
	html: string;
	finalUrl: string;
}> {
	const { html, finalUrl } = await fetchHtml(drawOutUrl(event, divID, combinedID));
	const divCode = resolveDivCodeFromHtml(html);
	const divId = divCode ? event.codeIdMap[divCode] ?? null : null;
	if (!divId) return { divCode, divId: null, draw: { matches: {}, advancements: [] }, html, finalUrl };
	return { divCode, divId, draw: parseBracketPage(html, finalUrl), html, finalUrl };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = [];
	for (let i = 0; i < items.length; i += limit) {
		const chunk = items.slice(i, i + limit);
		out.push(...(await Promise.all(chunk.map(fn))));
	}
	return out;
}

export async function scrapeEvent(event: LiveEventConfig): Promise<EventScrapeResult> {
	const existing = await readLiveResults(event.slug).catch(() => ({ lastUpdated: null, divisions: {} as Record<string, MatchMap> }));
	const divisions: Record<string, MatchMap> = {};
	const divisionReports: DivisionScrape[] = [];
	const errors: string[] = [];
	const quarantined: QuarantinedMatch[] = [];
	const resolvedMatchIds: string[] = [];
	const audit: Array<{ matchId: string; html: string }> = [];
	let scraped = 0;
	let matchesWithResults = 0;

	for (const { code, divID, combinedID } of event.divisionUrls) {
		let lastErr: unknown = null;
		let succeeded = false;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
			try {
				const { divCode, divId, draw, html, finalUrl } = await scrapeDivision(event, divID, combinedID);
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

				const pageByR2 = await fetchMatchPages(event.tid, Object.values(draw.matches), finalUrl);
				const data: MatchMap = {};
				for (const [matchId, parsed] of Object.entries(draw.matches)) {
					const pageHit = parsed.r2MatchId ? pageByR2.get(parsed.r2MatchId) : undefined;
					const resolved = resolveMatchResult({
						matchId,
						divisionId: divId,
						draw: parsed,
						page: pageHit?.page ?? null,
						pageError: pageHit?.error ?? null,
						pageHtml: pageHit?.html ?? null,
						advancements: draw.advancements,
					});
					if (resolved.quarantine) quarantined.push(resolved.quarantine);
					if (resolved.resolved) resolvedMatchIds.push(matchId);
					data[matchId] = resolved.record;
					if (resolved.record.winner != null) matchesWithResults += 1;
					const prev = existing.divisions?.[divId]?.[matchId];
					if (pageHit?.html && prev && !resultFieldsEqual(prev, resolved.record) && (prev.winner != null || resolved.record.winner != null)) {
						audit.push({ matchId, html: pageHit.html });
					}
				}

				const matchCount = Object.keys(data).length;
				if (matchCount > 0) {
					divisions[divId] = data;
					scraped += 1;
				}
				divisionReports.push({
					code,
					divId,
					ok: true,
					matchCount,
					withResults: Object.values(data).filter((d) => d.winner != null).length,
					data,
					draw,
					drawHtml: html,
				});
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

	return { scraped, matchesWithResults, divisions, divisionReports, errors, quarantined, resolvedMatchIds, audit };
}

type PageHit = { page: ParsedMatchPage | null; html?: string; error?: string };

async function fetchMatchPages(tid: string, matches: ParsedDrawMatch[], referer?: string): Promise<Map<string, PageHit>> {
	const finishedIds = new Set(
		matches
			.filter((m) => m.drawWinner != null || Boolean(m.drawWinnerName) || Boolean(m.drawScore))
			.map((m) => m.r2MatchId)
			.filter((id): id is string => Boolean(id)),
	);
	const ids = [...new Set(matches.map((m) => m.r2MatchId).filter((id): id is string => Boolean(id)))];
	const out = new Map<string, PageHit>();
	await mapPool(ids, MATCH_PAGE_CONCURRENCY, async (r2MatchId) => {
		const expectFinished = finishedIds.has(r2MatchId);
		let lastErr: string | null = null;
		for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
			try {
				const { html } = await fetchHtml(matchPageUrl(tid, r2MatchId), referer);
				if (!htmlLooksLikeMatchPage(html)) {
					lastErr = describeBadMatchHtml(html);
					if (attempt < FETCH_ATTEMPTS) {
						await new Promise((r) => setTimeout(r, 300 * attempt));
						continue;
					}
					out.set(r2MatchId, { page: null, error: lastErr, html });
					return;
				}
				const page = parseMatchPage(html);
				if (expectFinished && !page.winnerName && !htmlHasWinnerMark(html) && attempt < FETCH_ATTEMPTS) {
					lastErr = 'finished draw but fetched page has no Winner';
					await new Promise((r) => setTimeout(r, 300 * attempt));
					continue;
				}
				out.set(r2MatchId, { page, html });
				return;
			} catch (err) {
				lastErr = err instanceof Error ? err.message : String(err);
				if (attempt < FETCH_ATTEMPTS) {
					await new Promise((r) => setTimeout(r, 300 * attempt));
					continue;
				}
				out.set(r2MatchId, { page: null, error: lastErr });
				return;
			}
		}
		out.set(r2MatchId, { page: null, error: lastErr ?? 'match page unavailable' });
	});
	return out;
}

export function mergeDivisions(
	existing: Record<string, MatchMap>,
	incoming: Record<string, MatchMap>,
	quarantinedIds: Set<string>,
	resolvedIds: Set<string>,
): Record<string, MatchMap> {
	const merged: Record<string, MatchMap> = { ...existing };
	for (const [divId, matches] of Object.entries(incoming)) {
		const existingDiv = merged[divId] ?? {};
		const mergedDiv: MatchMap = { ...existingDiv };
		for (const [matchId, newMatch] of Object.entries(matches)) {
			mergedDiv[matchId] = mergeOneMatch(existingDiv[matchId], newMatch, {
				quarantined: quarantinedIds.has(matchId),
				resolved: resolvedIds.has(matchId),
			});
		}
		merged[divId] = mergedDiv;
	}
	return merged;
}

export function mergeOneMatch(
	existing: MatchRecord | undefined,
	incoming: MatchRecord,
	opts: { quarantined: boolean; resolved: boolean },
): MatchRecord {
	const next: MatchRecord = {
		player1: incoming.player1 ?? existing?.player1 ?? null,
		player2: incoming.player2 ?? existing?.player2 ?? null,
	};
	if (incoming.court) next.court = incoming.court;
	else if (existing?.court) next.court = existing.court;
	if (incoming.scheduledTime) next.scheduledTime = incoming.scheduledTime;
	else if (existing?.scheduledTime) next.scheduledTime = existing.scheduledTime;

	if (opts.quarantined) {
		if (existing?.winner != null) next.winner = existing.winner;
		if (existing?.score) next.score = existing.score;
		return next;
	}

	if (incoming.winner != null) {
		next.winner = incoming.winner;
		if (incoming.score) next.score = incoming.score;
		else if (existing?.score) next.score = existing.score;
		return next;
	}

	if (opts.resolved) {
		if (incoming.score) next.score = incoming.score;
		return next;
	}

	if (existing?.winner != null) {
		next.winner = existing.winner;
		if (existing.score) next.score = existing.score;
		return next;
	}
	if (incoming.score) next.score = incoming.score;
	return next;
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
): { events: LiveActivityEvent[]; retractMatchIds: string[] } {
	const newEvents: LiveActivityEvent[] = [];
	const retractMatchIds: string[] = [];

	for (const [divId, matches] of Object.entries(nextDivisions)) {
		const divisionLabel = event.divisionLabels[divId] ?? divId;
		for (const [matchId, newMatch] of Object.entries(matches)) {
			const oldMatch = prevDivisions[divId]?.[matchId];
			const hadWinner = oldMatch?.winner === 1 || oldMatch?.winner === 2;
			const hasWinner = newMatch.winner === 1 || newMatch.winner === 2;
			const winnerChanged = (oldMatch?.winner ?? null) !== (newMatch.winner ?? null);
			const scoreChanged = !scoresEqual(oldMatch?.score, newMatch.score) && newMatch.score != null;
			const newlySet = !hadWinner && hasWinner;
			const retracted = hadWinner && !hasWinner;

			if (retracted) {
				retractMatchIds.push(matchId);
				continue;
			}
			if (!hasWinner) continue;
			if (!newlySet && !winnerChanged && !scoreChanged) continue;

			const names = winnerLoserNames(newMatch);
			if (!names) continue;
			const correction = hadWinner && (winnerChanged || scoreChanged);
			if (correction) retractMatchIds.push(matchId);
			const headline = `${names.winnerName} def ${names.loserName}`;
			newEvents.push({
				id: `${at}-${divId}-${matchId}`,
				at,
				type: 'result',
				divisionId: divId,
				divisionLabel,
				matchId,
				headline: correction ? `Correction: ${headline}` : headline,
				detail: newMatch.score ?? undefined,
				bracketHref: `/events/${event.slug}/divisions/${divId}`,
				...(correction ? { correction: true } : {}),
			});
		}
	}
	return { events: newEvents, retractMatchIds };
}

export function applyActivityUpdates(
	prev: LiveActivityFeed,
	eventSlug: string,
	incoming: LiveActivityEvent[],
	retractMatchIds: string[],
	stamp: string | null,
): LiveActivityFeed {
	const retract = new Set(retractMatchIds);
	const prevEvents = prev.eventSlug === eventSlug ? (prev.events ?? []) : [];
	const kept = prevEvents.filter((ev) => !retract.has(ev.matchId));
	return {
		lastUpdated: stamp ?? prev.lastUpdated,
		eventSlug,
		events: [...incoming, ...kept].slice(0, MAX_ACTIVITY_EVENTS),
	};
}

/** Drop quarantine rows once the match has a published winner (MED10 stale list). */
export function dropPublishedQuarantine(
	quarantined: QuarantinedMatch[],
	divisions: Record<string, MatchMap>,
	extraDropIds: Set<string> = new Set(),
): QuarantinedMatch[] {
	return quarantined.filter((q) => {
		if (extraDropIds.has(q.matchId)) return false;
		const published = Object.values(divisions).some((div) => div[q.matchId]?.winner != null);
		if (!published) return true;
		// Keep real conflicts visible; "couldn't reconfirm" is not a quarantine once published.
		return /disagree|ambiguous|uniquely match/i.test(q.reason);
	});
}

export function countPublishedResults(divisions: Record<string, MatchMap>): number {
	return Object.values(divisions).reduce(
		(n, div) => n + Object.values(div).filter((m) => m.winner != null).length,
		0,
	);
}

export function mergeScrapedResults(
	event: LiveEventConfig,
	existing: LiveResultsFile,
	scraped: EventScrapeResult,
	prevActivity: LiveActivityFeed,
	at: string,
): { results: LiveResultsFile; activity: LiveActivityFeed; changed: boolean; newActivity: number; quarantined: QuarantinedMatch[] } {
	const quarantinedIds = new Set(scraped.quarantined.map((q) => q.matchId));
	const resolvedIds = new Set(scraped.resolvedMatchIds);

	const mergedDivisions = applyMatchOverrides(
		event.slug,
		mergeDivisions(existing.divisions ?? {}, scraped.divisions, quarantinedIds, resolvedIds),
	);

	const overrideIds = new Set(
		Object.values(MATCH_OVERRIDES[event.slug] ?? {}).flatMap((div) => Object.keys(div ?? {})),
	);
	const quarantined = dropPublishedQuarantine(scraped.quarantined, mergedDivisions, overrideIds);

	const changed = JSON.stringify(mergedDivisions) !== JSON.stringify(existing.divisions ?? {});
	const stamp = changed ? at : existing.lastUpdated;
	const results: LiveResultsFile = { lastUpdated: stamp, divisions: mergedDivisions };

	const { events: newActivity, retractMatchIds } = changed
		? detectActivityChanges(event, existing.divisions ?? {}, mergedDivisions, at)
		: { events: [], retractMatchIds: [] };
	const activity = applyActivityUpdates(prevActivity, event.slug, newActivity, retractMatchIds, stamp);

	return { results, activity, changed, newActivity: newActivity.length, quarantined };
}

export async function buildMergedResults(
	event: LiveEventConfig,
	scraped: EventScrapeResult,
	at = new Date().toISOString(),
): Promise<{
	results: LiveResultsFile;
	activity: LiveActivityFeed;
	changed: boolean;
	newActivity: number;
	quarantined: QuarantinedMatch[];
}> {
	const existing = await readLiveResults(event.slug);
	const prevFeed = await readLiveActivity();
	const merged = mergeScrapedResults(event, existing, scraped, prevFeed, at);

	if (scraped.audit.length && merged.changed) {
		await Promise.all(
			scraped.audit.map((item) => writeResultAuditHtml(event.slug, item.matchId, item.html, at)),
		);
	}

	return merged;
}
