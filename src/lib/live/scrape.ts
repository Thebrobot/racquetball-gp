import { EVENTS } from '../../data/events';
import { drawOutUrl, type LiveEventConfig } from './config';
import {
	applyMatchOverrides,
	collectSupersededOverrides,
	MATCH_OVERRIDES,
} from './match-overrides';
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
import {
	describeR2Block,
	divisionHasWindowMatch,
	drawLooksFinished,
	htmlLooksLikeR2Block,
	isR2BlockedReason,
	MATCH_PAGE_GAP_MS,
	R2_BLOCK_BACKOFF_MS,
	selectDivisionCodesToScrape,
	shouldFetchMatchPage,
	storedCourtDisagreesWithDraw,
	storeHasFinal,
} from './r2-match-fetch';
import { scoresEqual } from './r2-names';
import { BLOB_READ_FRESH_TIMEOUT_MS, readLiveActivity, readLiveResults, writeResultAuditHtml } from './store';
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

export { applyMatchOverrides, MATCH_OVERRIDES } from './match-overrides';

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
	/** Matches we actually read an r2-push page for this run (not keep-stored). */
	confirmedMatchIds?: string[];
	audit: Array<{ matchId: string; html: string }>;
	r2Blocked?: boolean;
	r2BlockedCount?: number;
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
			const html = await res.text();
			if (htmlLooksLikeR2Block(html) || res.status === 403 || res.status === 429) {
				throw new Error(describeR2Block(html || `HTTP ${res.status}`));
			}
			if (res.ok) return { html, finalUrl: res.url };
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

function scheduledTimesForDivision(event: LiveEventConfig, divId: string, stored: MatchMap): string[] {
	const times: string[] = [];
	for (const row of Object.values(stored)) {
		if (row.scheduledTime) times.push(row.scheduledTime);
	}
	const ev = EVENTS.find((e) => e.slug === event.slug);
	const div = ev?.divisionDetails.find((d) => d.id === divId);
	for (const round of div?.rounds ?? []) {
		for (const match of round.matches) {
			if (match.scheduledTime) times.push(match.scheduledTime);
		}
	}
	for (const match of div?.roundRobinMatches ?? []) {
		if (match.scheduledTime) times.push(match.scheduledTime);
	}
	return times;
}

function keepStoredFinal(existing: MatchRecord, draw: ParsedDrawMatch): MatchRecord {
	const next: MatchRecord = {
		player1: draw.player1 ?? existing.player1 ?? null,
		player2: draw.player2 ?? existing.player2 ?? null,
		winner: existing.winner,
	};
	if (existing.score) next.score = existing.score;
	// Blank draw court/time must never wipe a stored value. A non-empty draw
	// court that disagrees is handled by refetching the match page instead.
	if (existing.court) next.court = existing.court;
	else if (draw.court) next.court = draw.court;
	if (existing.scheduledTime) next.scheduledTime = existing.scheduledTime;
	else if (draw.scheduledTime) next.scheduledTime = draw.scheduledTime;
	return next;
}

export async function scrapeEvent(event: LiveEventConfig, now = new Date()): Promise<EventScrapeResult> {
	const existing = await readLiveResults(event.slug, {
		timeoutMs: BLOB_READ_FRESH_TIMEOUT_MS,
		useCache: false,
		applyOverrides: false,
	}).catch(() => ({ lastUpdated: null, divisions: {} as Record<string, MatchMap> }));
	const divisions: Record<string, MatchMap> = {};
	const divisionReports: DivisionScrape[] = [];
	const errors: string[] = [];
	const quarantined: QuarantinedMatch[] = [];
	const resolvedMatchIds: string[] = [];
	const confirmedMatchIds: string[] = [];
	const audit: Array<{ matchId: string; html: string }> = [];
	let scraped = 0;
	let matchesWithResults = 0;
	let r2Blocked = false;
	let r2BlockedCount = 0;

	const inWindowCodes = new Set<string>();
	for (const { code } of event.divisionUrls) {
		const divId = event.codeIdMap[code];
		if (!divId) continue;
		const times = scheduledTimesForDivision(event, divId, existing.divisions?.[divId] ?? {});
		if (divisionHasWindowMatch(times, now)) inWindowCodes.add(code);
	}
	const scrapeCodes = new Set(
		selectDivisionCodesToScrape(
			event.divisionUrls.map((d) => d.code),
			inWindowCodes,
			now,
		),
	);

	for (const { code, divID, combinedID } of event.divisionUrls) {
		if (!scrapeCodes.has(code)) {
			divisionReports.push({
				code,
				divId: event.codeIdMap[code] ?? null,
				ok: true,
				error: 'skipped — outside current window (rotation)',
				matchCount: 0,
				withResults: 0,
				data: {},
			});
			continue;
		}
		if (r2Blocked) {
			errors.push(`${code}: skipped after R2 blocked this IP`);
			divisionReports.push({
				code,
				divId: null,
				ok: false,
				error: 'skipped after R2 blocked this IP',
				matchCount: 0,
				withResults: 0,
				data: {},
			});
			continue;
		}

		let lastErr: unknown = null;
		let succeeded = false;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
			try {
				const { divCode, divId, draw, html, finalUrl } = await scrapeDivision(event, divID, combinedID);
				if (htmlLooksLikeR2Block(html)) {
					throw new Error(describeR2Block(html));
				}
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

				const storedDiv = existing.divisions?.[divId] ?? {};
				const fetchList = Object.entries(draw.matches)
					.filter(([matchId, parsed]) => shouldFetchMatchPage(parsed, storedDiv[matchId], now))
					.map(([, parsed]) => parsed);

				const pageByR2 = await fetchMatchPages(event.tid, fetchList, finalUrl);
				const blockedHits = [...pageByR2.values()].filter((hit) => hit.blocked);
				if (blockedHits.length) {
					r2Blocked = true;
					r2BlockedCount += blockedHits.length;
				}
				const data: MatchMap = {};
				for (const [matchId, parsed] of Object.entries(draw.matches)) {
					const prev = storedDiv[matchId];
					if (
						!shouldFetchMatchPage(parsed, prev, now) &&
						storeHasFinal(prev) &&
						prev &&
						!storedCourtDisagreesWithDraw(parsed, prev)
					) {
						data[matchId] = keepStoredFinal(prev, parsed);
						resolvedMatchIds.push(matchId);
						if (data[matchId]!.winner != null) matchesWithResults += 1;
						continue;
					}

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
					if (
						resolved.resolved &&
						pageHit?.html &&
						!pageHit.blocked &&
						htmlLooksLikeMatchPage(pageHit.html)
					) {
						confirmedMatchIds.push(matchId);
					}
					data[matchId] = resolved.record;
					if (resolved.record.winner != null) matchesWithResults += 1;
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
				const message = err instanceof Error ? err.message : String(err);
				if (isR2BlockedReason(message)) {
					r2Blocked = true;
					r2BlockedCount += 1;
					break;
				}
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
			if (isR2BlockedReason(message)) break;
		}
	}

	return {
		scraped,
		matchesWithResults,
		divisions,
		divisionReports,
		errors,
		quarantined,
		resolvedMatchIds,
		confirmedMatchIds,
		audit,
		r2Blocked,
		r2BlockedCount,
	};
}

type PageHit = { page: ParsedMatchPage | null; html?: string; error?: string; blocked?: boolean };

async function sleep(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

async function fetchMatchPages(tid: string, matches: ParsedDrawMatch[], referer?: string): Promise<Map<string, PageHit>> {
	const finishedIds = new Set(
		matches.filter((m) => drawLooksFinished(m)).map((m) => m.r2MatchId).filter((id): id is string => Boolean(id)),
	);
	const ids = [...new Set(matches.map((m) => m.r2MatchId).filter((id): id is string => Boolean(id)))];
	const out = new Map<string, PageHit>();
	let blocked = false;

	for (const r2MatchId of ids) {
		if (blocked) {
			out.set(r2MatchId, { page: null, error: 'R2 blocked this IP', blocked: true });
			continue;
		}
		if (out.size) await sleep(MATCH_PAGE_GAP_MS);

		const expectFinished = finishedIds.has(r2MatchId);
		let lastErr: string | null = null;
		let lastHtml: string | undefined;
		let done = false;
		for (let attempt = 1; attempt <= FETCH_ATTEMPTS && !done; attempt++) {
			try {
				const { html } = await fetchHtml(matchPageUrl(tid, r2MatchId), referer);
				lastHtml = html;
				if (htmlLooksLikeR2Block(html)) {
					lastErr = describeR2Block(html);
					blocked = true;
					out.set(r2MatchId, { page: null, error: lastErr, html, blocked: true });
					await sleep(R2_BLOCK_BACKOFF_MS);
					done = true;
					break;
				}
				if (!htmlLooksLikeMatchPage(html)) {
					lastErr = describeBadMatchHtml(html);
					if (attempt < FETCH_ATTEMPTS) {
						await sleep(300 * attempt);
						continue;
					}
					out.set(r2MatchId, { page: null, error: lastErr, html });
					done = true;
					break;
				}
				const page = parseMatchPage(html);
				if (expectFinished && !page.winnerName && !htmlHasWinnerMark(html) && attempt < FETCH_ATTEMPTS) {
					lastErr = 'finished draw but fetched page has no Winner';
					await sleep(300 * attempt);
					continue;
				}
				out.set(r2MatchId, { page, html });
				done = true;
			} catch (err) {
				lastErr = err instanceof Error ? err.message : String(err);
				if (isR2BlockedReason(lastErr)) {
					blocked = true;
					out.set(r2MatchId, { page: null, error: lastErr, html: lastHtml, blocked: true });
					await sleep(R2_BLOCK_BACKOFF_MS);
					done = true;
					break;
				}
				if (attempt < FETCH_ATTEMPTS) {
					await sleep(300 * attempt);
					continue;
				}
				out.set(r2MatchId, { page: null, error: lastErr });
				done = true;
			}
		}
		if (!done && !out.has(r2MatchId)) {
			out.set(r2MatchId, { page: null, error: lastErr ?? 'match page unavailable' });
		}
	}
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

function isFinalWinner(record?: MatchRecord | null): boolean {
	return record?.winner === 1 || record?.winner === 2;
}

/** First time this match becomes final: take court/time from the fetch that captured the result. */
export function turningFinal(existing?: MatchRecord | null, incoming?: MatchRecord | null): boolean {
	return !isFinalWinner(existing) && isFinalWinner(incoming);
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
	// Non-empty incoming court/time (the match page that just captured a
	// first-final, or any later refetch) replace an earlier stored court.
	// Finals: a blank R2 court must never wipe a stored court (#38/#45).
	// Not-final: if we actually read a match page, mirror it — including clear.
	const keepStoredCourt =
		isFinalWinner(existing) ||
		isFinalWinner(incoming) ||
		opts.quarantined ||
		!opts.resolved;
	if (incoming.court) next.court = incoming.court;
	else if (keepStoredCourt && existing?.court) next.court = existing.court;
	if (incoming.scheduledTime) next.scheduledTime = incoming.scheduledTime;
	else if (existing?.scheduledTime) next.scheduledTime = existing.scheduledTime;

	if (opts.quarantined) {
		if (existing?.winner != null) next.winner = existing.winner;
		if (existing?.score) next.score = existing.score;
		else if (incoming.score) next.score = incoming.score;
		return next;
	}

	if (incoming.winner != null) {
		next.winner = incoming.winner;
		if (incoming.score) next.score = incoming.score;
		else if (existing?.score) next.score = existing.score;
		return next;
	}

	// No winner is not "unplayed". Keep R2 / stored score text (WBF, No Show).
	if (incoming.score) next.score = incoming.score;
	else if (existing?.score) next.score = existing.score;

	if (opts.resolved) {
		return next;
	}

	if (existing?.winner != null) {
		next.winner = existing.winner;
		return next;
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
	const confirmed = new Set(scraped.confirmedMatchIds ?? []);
	const confirmedDivisions: Record<string, MatchMap> = {};
	for (const [divId, matches] of Object.entries(scraped.divisions)) {
		const picked: MatchMap = {};
		for (const [matchId, row] of Object.entries(matches)) {
			if (confirmed.has(matchId)) picked[matchId] = row;
		}
		if (Object.keys(picked).length) confirmedDivisions[divId] = picked;
	}
	const supersededOverrides = collectSupersededOverrides(
		event.slug,
		confirmedDivisions,
		existing.supersededOverrides,
	);

	const mergedDivisions = applyMatchOverrides(
		event.slug,
		mergeDivisions(existing.divisions ?? {}, scraped.divisions, quarantinedIds, resolvedIds),
		supersededOverrides,
	);

	const overrideIds = new Set(
		Object.values(MATCH_OVERRIDES[event.slug] ?? {}).flatMap((div) => Object.keys(div ?? {})),
	);
	const quarantined = dropPublishedQuarantine(scraped.quarantined, mergedDivisions, overrideIds);

	const changed = JSON.stringify(mergedDivisions) !== JSON.stringify(existing.divisions ?? {});
	const stamp = changed ? at : existing.lastUpdated;
	const results: LiveResultsFile = { lastUpdated: stamp, divisions: mergedDivisions, supersededOverrides };

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
	const existing = await readLiveResults(event.slug, {
		timeoutMs: BLOB_READ_FRESH_TIMEOUT_MS,
		useCache: false,
		applyOverrides: false,
	});
	const prevFeed = await readLiveActivity({ timeoutMs: BLOB_READ_FRESH_TIMEOUT_MS, useCache: false });
	const merged = mergeScrapedResults(event, existing, scraped, prevFeed, at);

	if (scraped.audit.length && merged.changed) {
		await Promise.all(
			scraped.audit.map((item) => writeResultAuditHtml(event.slug, item.matchId, item.html, at)),
		);
	}

	return merged;
}
