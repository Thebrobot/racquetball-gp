import { EVENT_SKELETONS } from '../../data/events';
import { detectActivityChanges, mergeActivity } from './activity';
import { R2_SYNC_EVENTS } from './config';
import {
	divisionListUrl,
	drawOutUrl,
	fetchText,
	isAwaitingDrawsHtml,
	looksLikeR2Html,
	mapPool,
	matchPageUrl,
} from './fetch';
import { applyOverrides, loadOverrides } from './overrides';
import { parseDivisionList, drawKey } from './parse-divisions';
import { parseDrawPage } from './parse-draw';
import { parseMatchPage, parsedMatchesEqual } from './parse-match';
import { buildCodeToSiteId, resolveSiteDivisionId } from './site-ids';
import {
	readActivity,
	readHealth,
	readSnapshot,
	snapshotToDivisionResults,
	writeActivity,
	writeHealth,
	writeSnapshot,
} from './store';
import type {
	DiscoveredDivision,
	DivisionSnapshot,
	EventHealth,
	EventSnapshot,
	HealthReport,
	ParsedMatch,
	PublishedMatch,
	QuarantineItem,
	R2EventConfig,
	ScoreRuleSet,
} from './types';
import { isConfirmed, validateDivisionSnapshot, validateParsedMatch } from './validate';
import { activeEvents, anyEventWindowOpen, eventWindow, isEventWindowOpen } from './window';

const MATCH_CONCURRENCY = 3;
const DRAW_CONCURRENCY = 2;

export interface SyncOptions {
	events?: R2EventConfig[];
	force?: boolean;
	trigger?: 'cron' | 'manual' | 'cli';
	now?: Date;
	concurrency?: number;
	overridesPath?: string;
	onLog?: (msg: string) => void;
}

export interface SyncResult {
	skipped: boolean;
	reason?: 'outside-window';
	health: HealthReport;
	snapshots: EventSnapshot[];
}

function log(opts: SyncOptions, msg: string) {
	(opts.onLog ?? console.log)(msg);
}

function toPublished(parsed: ParsedMatch, fallbackCode: string): PublishedMatch {
	return {
		r2MatchId: parsed.r2MatchId,
		matchId: parsed.matchId || fallbackCode,
		player1: parsed.player1,
		player2: parsed.player2,
		winner: parsed.winner,
		score: parsed.score,
		status: parsed.status,
		winMethod: parsed.winMethod,
		roundLabel: parsed.roundLabel,
		court: parsed.court,
		scheduled: parsed.scheduled,
		confirmed: isConfirmed(parsed),
		isDoubles: parsed.isDoubles,
	};
}

async function readMatchAgreed(tid: string, r2MatchId: string, fallbackCode: string): Promise<ParsedMatch> {
	const readOnce = async () => {
		const { html } = await fetchText(matchPageUrl(tid, r2MatchId));
		if (!looksLikeR2Html(html) && !/r2p-versus-side|Match #/i.test(html)) {
			throw new Error(`Match page ${r2MatchId} did not look like R2 HTML`);
		}
		const parsed = parseMatchPage(html, r2MatchId);
		return { ...parsed, matchId: parsed.matchId || fallbackCode };
	};

	const a = await readOnce();
	await new Promise((r) => setTimeout(r, 250));
	const b = await readOnce();
	if (parsedMatchesEqual(a, b)) return a;
	const c = await readOnce();
	if (parsedMatchesEqual(a, c) || parsedMatchesEqual(b, c)) return c;
	throw new Error(`Match ${r2MatchId} disagreed across reads`);
}

async function discoverDivisions(tid: string, eventSlug: string): Promise<DiscoveredDivision[]> {
	const { html } = await fetchText(divisionListUrl(tid));
	if (!looksLikeR2Html(html) && !isAwaitingDrawsHtml(html)) {
		throw new Error(`Division list for TID ${tid} did not look like R2 HTML`);
	}
	const skeleton = EVENT_SKELETONS.find((e) => e.slug === eventSlug);
	const codeMap = buildCodeToSiteId(skeleton);
	return parseDivisionList(html).map((d) => ({
		...d,
		siteId: resolveSiteDivisionId(d, codeMap),
	}));
}

export function resolveSnapshotStatus(opts: {
	discoveredCount: number;
	staleCount: number;
	publishedDivisionCount: number;
	prevHadMatches: boolean;
}): EventSnapshot['status'] {
	if (opts.discoveredCount === 0) {
		return opts.prevHadMatches ? 'partial' : 'awaiting-draws';
	}
	if (opts.staleCount === 0) return 'ok';
	if (opts.publishedDivisionCount > 0) return 'partial';
	return 'failed';
}

function prevHadMatches(prev: EventSnapshot | null): boolean {
	return Object.values(prev?.divisions ?? {}).some((d) => d.matchCount > 0);
}

function emptyAwaitingSnapshot(event: R2EventConfig, at: string): EventSnapshot {
	return {
		version: 1,
		slug: event.slug,
		tid: event.tid,
		name: event.name,
		syncedAt: at,
		status: 'awaiting-draws',
		divisions: {},
		quarantine: [],
		overridesApplied: [],
	};
}

async function fetchDraw(tid: string, divID: number, combinedID: number) {
	const { url, html } = await fetchText(drawOutUrl(tid, divID, combinedID));
	if (!looksLikeR2Html(html) && !isAwaitingDrawsHtml(html)) {
		throw new Error(`Draw ${divID}/${combinedID} did not look like R2 HTML`);
	}
	return parseDrawPage(html, { divID, combinedID, finalUrl: url });
}

function quarantineConfirmedChanges(
	prev: DivisionSnapshot | undefined,
	nextMatches: Record<string, PublishedMatch>,
	eventSlug: string,
	divisionId: string,
	at: string,
): { matches: Record<string, PublishedMatch>; quarantine: QuarantineItem[] } {
	const quarantine: QuarantineItem[] = [];
	if (!prev) return { matches: nextMatches, quarantine };

	const matches = { ...nextMatches };
	for (const [matchId, incoming] of Object.entries(nextMatches)) {
		const previous = prev.matches[matchId];
		if (!previous || !isConfirmed(previous) || !incoming) continue;

		if (incoming.winner != null && previous.winner != null && incoming.winner !== previous.winner) {
			quarantine.push({
				at,
				eventSlug,
				divisionId,
				matchId,
				field: 'winner',
				previous: previous.winner,
				incoming: incoming.winner,
				reason: 'Confirmed winner changed on R2; kept last published result',
			});
			matches[matchId] = previous;
			continue;
		}
		if (incoming.score && previous.score && incoming.score !== previous.score) {
			quarantine.push({
				at,
				eventSlug,
				divisionId,
				matchId,
				field: 'score',
				previous: previous.score,
				incoming: incoming.score,
				reason: 'Confirmed score changed on R2; kept last published result',
			});
			matches[matchId] = { ...previous };
		}
	}
	return { matches, quarantine };
}

async function syncDivision(
	event: R2EventConfig,
	discovered: DiscoveredDivision,
	prev: DivisionSnapshot | undefined,
	at: string,
	opts: SyncOptions,
	prefetchedDraw?: Awaited<ReturnType<typeof fetchDraw>>,
): Promise<{ division: DivisionSnapshot; quarantine: QuarantineItem[] }> {
	const rules: ScoreRuleSet = event.scoreRules ?? 'usar-adult';
	const draw = prefetchedDraw ?? (await fetchDraw(event.tid, discovered.divID, discovered.combinedID));
	if (!draw.matches.length) {
		if (prev && prev.matchCount > 0) {
			return {
				division: {
					...prev,
					stale: true,
					lastError: 'Draw page returned no match IDs; kept last good snapshot',
				},
				quarantine: [],
			};
		}
		return {
			division: {
				id: discovered.siteId,
				code: discovered.code || draw.code || '',
				label: discovered.label || draw.label || discovered.siteId,
				format: draw.format !== 'unknown' ? draw.format : discovered.format,
				divID: discovered.divID,
				combinedID: discovered.combinedID,
				stale: false,
				lastSuccessAt: at,
				lastError: null,
				matchCount: 0,
				confirmedCount: 0,
				matches: {},
			},
			quarantine: [],
		};
	}

	const fetched = await mapPool(draw.matches, opts.concurrency ?? MATCH_CONCURRENCY, async (ref) => {
		try {
			const parsed = await readMatchAgreed(event.tid, ref.r2MatchId, ref.matchId);
			const issues = validateParsedMatch(parsed, rules).filter((i) => i.level === 'error');
			if (issues.length && (parsed.winner != null || parsed.score)) {
				return {
					ok: true as const,
					match: toPublished(
						{
							...parsed,
							winner: issues.some((i) => i.code === 'winner-not-player') ? null : parsed.winner,
							score: issues.some((i) => i.code.startsWith('score')) ? null : parsed.score,
							status: issues.some((i) => i.code.startsWith('score')) && parsed.status === 'played' ? 'unknown' : parsed.status,
						},
						ref.matchId,
					),
				};
			}
			return { ok: true as const, match: toPublished(parsed, ref.matchId) };
		} catch (err) {
			return { ok: false as const, error: err instanceof Error ? err.message : String(err), ref };
		}
	});

	const failures = fetched.filter((r) => !r.ok);
	if (failures.length) {
		log(opts, `    ! ${discovered.code}: ${failures.length} match read(s) failed`);
		if (prev) {
			return {
				division: {
					...prev,
					stale: true,
					lastError: `Failed ${failures.length}/${draw.matches.length} match reads; kept last good snapshot`,
				},
				quarantine: [],
			};
		}
	}

	const matches: Record<string, PublishedMatch> = {};
	for (const row of fetched) {
		if (!row.ok) continue;
		matches[row.match.matchId] = row.match;
	}

	const { matches: quarantinedMatches, quarantine } = quarantineConfirmedChanges(
		prev,
		matches,
		event.slug,
		discovered.siteId,
		at,
	);

	const candidate: DivisionSnapshot = {
		id: discovered.siteId,
		code: discovered.code || draw.code || '',
		label: discovered.label || draw.label || discovered.siteId,
		format: draw.format !== 'unknown' ? draw.format : discovered.format,
		divID: discovered.divID,
		combinedID: discovered.combinedID,
		stale: failures.length > 0,
		lastSuccessAt: failures.length ? (prev?.lastSuccessAt ?? null) : at,
		lastError: failures.length ? `Failed ${failures.length} match reads` : null,
		matchCount: Object.keys(quarantinedMatches).length,
		confirmedCount: Object.values(quarantinedMatches).filter((m) => m.confirmed).length,
		matches: quarantinedMatches,
	};

	const validation = validateDivisionSnapshot(candidate, prev, rules);
	if (!validation.ok) {
		const hard = validation.issues.filter((i) => i.level === 'error');
		log(opts, `    ! ${discovered.code}: validation failed (${hard.map((i) => i.code).join(', ')})`);
		if (prev) {
			return {
				division: {
					...prev,
					stale: true,
					lastError: hard.map((i) => i.message).join('; '),
				},
				quarantine,
			};
		}
		candidate.stale = true;
		candidate.lastError = hard.map((i) => i.message).join('; ');
		candidate.lastSuccessAt = null;
	}

	return { division: candidate, quarantine };
}

async function syncEvent(event: R2EventConfig, opts: SyncOptions): Promise<EventSnapshot> {
	const at = (opts.now ?? new Date()).toISOString();
	const prev = await readSnapshot(event.slug);
	log(opts, `→ ${event.name} (TID ${event.tid})`);

	let discovered: DiscoveredDivision[];
	try {
		discovered = await discoverDivisions(event.tid, event.slug);
	} catch (err) {
		log(opts, `  ✗ division list failed: ${err instanceof Error ? err.message : err}`);
		if (prev) {
			return {
				...prev,
				syncedAt: at,
				status: 'failed',
				divisions: Object.fromEntries(
					Object.entries(prev.divisions).map(([id, d]) => [id, { ...d, stale: true, lastError: 'Division list fetch failed' }]),
				),
			};
		}
		return {
			version: 1,
			slug: event.slug,
			tid: event.tid,
			name: event.name,
			syncedAt: at,
			status: 'failed',
			divisions: {},
			quarantine: [],
			overridesApplied: [],
		};
	}

	log(opts, `  discovered ${discovered.length} draw(s)`);

	if (discovered.length === 0) {
		if (prevHadMatches(prev)) {
			log(opts, `  ⚠ list returned no draws; kept last good snapshot`);
			return {
				...prev!,
				syncedAt: at,
				status: 'partial',
				divisions: Object.fromEntries(
					Object.entries(prev!.divisions).map(([id, d]) => [
						id,
						{ ...d, stale: true, lastError: 'Division list returned no draws; kept last good snapshot' },
					]),
				),
			};
		}
		log(opts, `  no draws yet`);
		return emptyAwaitingSnapshot(event, at);
	}

	const extra: DiscoveredDivision[] = [];
	const seen = new Set(discovered.map((d) => drawKey(d.divID, d.combinedID)));
	const drawByKey = new Map<string, Awaited<ReturnType<typeof fetchDraw>>>();

	const results = await mapPool(discovered, DRAW_CONCURRENCY, async (div) => {
		try {
			const draw = await fetchDraw(event.tid, div.divID, div.combinedID);
			drawByKey.set(drawKey(div.divID, div.combinedID), draw);
			for (const rel of draw.relatedDraws) {
				const key = drawKey(rel.divID, rel.combinedID);
				if (seen.has(key)) continue;
				seen.add(key);
				extra.push({
					divID: rel.divID,
					combinedID: rel.combinedID,
					code: '',
					label: `Related draw ${key}`,
					format: 'unknown',
					siteId: `related-${rel.divID}-${rel.combinedID}`,
				});
			}
			return { div, draw };
		} catch (err) {
			return { div, error: err instanceof Error ? err.message : String(err) };
		}
	});

	const toSync = [...discovered];
	for (const d of extra) {
		if (!toSync.some((x) => drawKey(x.divID, x.combinedID) === drawKey(d.divID, d.combinedID))) {
			toSync.push(d);
		}
	}

	const divisions: Record<string, DivisionSnapshot> = {};
	const quarantine: QuarantineItem[] = [...(prev?.quarantine ?? [])].slice(-80);
	let failures = 0;

	for (const div of toSync) {
		const prevDiv = Object.values(prev?.divisions ?? {}).find(
			(d) => d.divID === div.divID && d.combinedID === div.combinedID,
		) ?? prev?.divisions[div.siteId];
		try {
			const { division, quarantine: q } = await syncDivision(
				event,
				div,
				prevDiv,
				at,
				opts,
				drawByKey.get(drawKey(div.divID, div.combinedID)),
			);
			const key = division.id;
			// Avoid clobbering a successful main draw with an empty related alias.
			if (divisions[key] && divisions[key]!.matchCount > division.matchCount) {
				divisions[`${key}-${division.divID}-${division.combinedID}`] = division;
			} else {
				divisions[key] = division;
			}
			quarantine.push(...q);
			log(
				opts,
				`  ${division.stale ? '⚠' : '✓'} ${division.code || key}: ${division.matchCount} match(es), ${division.confirmedCount} confirmed${division.stale ? ' (stale)' : ''}`,
			);
			if (division.stale) failures++;
		} catch (err) {
			failures++;
			log(opts, `  ✗ ${div.code}: ${err instanceof Error ? err.message : err}`);
			if (prevDiv) {
				divisions[prevDiv.id] = {
					...prevDiv,
					stale: true,
					lastError: err instanceof Error ? err.message : String(err),
				};
			}
		}
	}

	void results;

	let snapshot: EventSnapshot = {
		version: 1,
		slug: event.slug,
		tid: event.tid,
		name: event.name,
		syncedAt: at,
		status: resolveSnapshotStatus({
			discoveredCount: toSync.length,
			staleCount: failures,
			publishedDivisionCount: Object.keys(divisions).length,
			prevHadMatches: prevHadMatches(prev),
		}),
		divisions,
		quarantine,
		overridesApplied: [],
	};

	snapshot = applyOverrides(snapshot, loadOverrides(opts.overridesPath), at);
	return snapshot;
}

function toEventHealth(event: R2EventConfig, snapshot: EventSnapshot | null, now: Date): EventHealth {
	const win = eventWindow(event);
	const divisions = Object.values(snapshot?.divisions ?? {});
	return {
		slug: event.slug,
		tid: event.tid,
		name: event.name,
		window: {
			start: win.start.toISOString(),
			end: win.end.toISOString(),
			timezone: win.timezone,
			active: isEventWindowOpen(event, now),
		},
		lastSuccessAt: snapshot?.status === 'failed' ? null : (snapshot?.syncedAt ?? null),
		lastAttemptAt: snapshot?.syncedAt ?? null,
		status: snapshot?.status ?? 'idle',
		note: snapshot?.status === 'awaiting-draws' ? 'no draws yet' : null,
		staleDivisions: divisions.filter((d) => d.stale).length,
		quarantineCount: snapshot?.quarantine.length ?? 0,
		divisions: divisions.map((d) => ({
			id: d.id,
			code: d.code,
			label: d.label,
			format: d.format,
			stale: d.stale,
			lastSuccessAt: d.lastSuccessAt,
			lastError: d.lastError,
			matchCount: d.matchCount,
			confirmedCount: d.confirmedCount,
		})),
		quarantine: snapshot?.quarantine ?? [],
		overridesApplied: snapshot?.overridesApplied ?? [],
	};
}

function buildHealth(
	events: R2EventConfig[],
	snapshots: EventSnapshot[],
	prev: HealthReport | null,
	opts: SyncOptions,
	now: Date,
	skipped: 'outside-window' | null,
): HealthReport {
	const bySlug = new Map(snapshots.map((s) => [s.slug, s]));
	const eventHealth = events.map((e) => toEventHealth(e, bySlug.get(e.slug) ?? null, now));
	const staleCount = eventHealth.reduce((n, e) => n + e.staleDivisions, 0);
	const quarantineCount = eventHealth.reduce((n, e) => n + e.quarantineCount, 0);
	const lastSuccessAt =
		eventHealth
			.map((e) => e.lastSuccessAt)
			.filter((x): x is string => !!x)
			.sort()
			.at(-1) ?? null;
	return {
		version: 1,
		ok: staleCount === 0 && quarantineCount === 0 && !eventHealth.some((e) => e.status === 'failed'),
		generatedAt: now.toISOString(),
		scheduler: {
			lastRunAt: now.toISOString(),
			lastTrigger: opts.trigger ?? 'cli',
			skipped,
		},
		staleCount,
		quarantineCount,
		lastSuccessAt,
		events: eventHealth.length ? eventHealth : prev?.events ?? [],
	};
}

export async function syncBrackets(opts: SyncOptions = {}): Promise<SyncResult> {
	const now = opts.now ?? new Date();
	const configured = opts.events ?? R2_SYNC_EVENTS;
	const force = opts.force ?? (opts.trigger === 'cli' || opts.trigger === 'manual');
	const prevHealth = await readHealth();

	if (!force && !anyEventWindowOpen(configured, now)) {
		const health = buildHealth(configured, [], prevHealth, opts, now, 'outside-window');
		// Keep last published snapshots; only refresh scheduler metadata.
		health.events = configured.map((e) => {
			const existing = prevHealth?.events.find((x) => x.slug === e.slug);
			const fresh = toEventHealth(e, null, now);
			return existing
				? { ...existing, window: fresh.window }
				: fresh;
		});
		health.ok = (health.staleCount ?? 0) === 0 && (health.quarantineCount ?? 0) === 0;
		await writeHealth(health);
		return { skipped: true, reason: 'outside-window', health, snapshots: [] };
	}

	const targets = force ? configured : activeEvents(configured, now);
	const snapshots: EventSnapshot[] = [];

	for (const event of targets) {
		const prev = await readSnapshot(event.slug);
		try {
			const snapshot = await syncEvent(event, opts);
			if (snapshot.status !== 'failed') {
				await writeSnapshot(snapshot);
				const newItems = detectActivityChanges(prev, snapshot, snapshot.syncedAt);
				if (newItems.length) {
					const feed = mergeActivity(await readActivity(), newItems, snapshot.slug, snapshot.syncedAt);
					await writeActivity(feed);
				}
			} else if (prev) {
				log(opts, `  kept last good snapshot for ${event.slug}`);
			}
			snapshots.push(snapshot);
		} catch (err) {
			log(opts, `  fatal ${event.slug}: ${err instanceof Error ? err.message : err}`);
			if (prev) snapshots.push({ ...prev, status: 'failed', syncedAt: now.toISOString() });
		}
	}

	const health = buildHealth(configured, snapshots, prevHealth, opts, now, null);
	await writeHealth(health);
	return { skipped: false, health, snapshots };
}

export function snapshotDivisionResults(snapshot: EventSnapshot) {
	return snapshotToDivisionResults(snapshot);
}
