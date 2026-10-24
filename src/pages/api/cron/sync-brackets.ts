import type { APIRoute } from 'astro';
import { createAdminClient, env, json } from '../../../lib/accounts/supabase';
import { eventsInWindow, isAnyEventInWindow, type LiveEventConfig } from '../../../lib/live/config';
import {
	nextSkipRunsRemaining,
	r2BlockSummary,
	shouldSkipBlockedRun,
} from '../../../lib/live/r2-match-fetch';
import {
	buildMergedResults,
	countPublishedResults,
	overlayLastGoodWithActivity,
	scrapeEvent,
} from '../../../lib/live/scrape';
import {
	BLOB_READ_FRESH_TIMEOUT_MS,
	liveStoreConfigured,
	readLiveActivity,
	readLiveResults,
	readSyncStatus,
	writeLiveActivity,
	writeLiveResults,
	writeSyncStatus,
} from '../../../lib/live/store';
import type { EventSyncStatus, SyncStatus } from '../../../lib/live/types';
import { processResultFeed } from '../../../lib/notify/results';

export const prerender = false;

function unauthorized() {
	return json({ error: 'Unauthorized' }, 401);
}

function authorize(request: Request): boolean {
	const secret = env('CRON_SECRET');
	if (!secret) return false;
	return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function notifyFreshResults(feed: { lastUpdated: string | null; eventSlug: string; events: { id: string; at: string; type: string; divisionId: string; divisionLabel: string; matchId: string; headline: string; detail?: string; bracketHref: string }[] }) {
	const admin = createAdminClient();
	if (!admin) return { skipped: 'supabase' as const };
	try {
		return await processResultFeed(admin, feed);
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

async function syncOne(event: LiveEventConfig, at: string): Promise<EventSyncStatus & { notified?: unknown }> {
	const scraped = await scrapeEvent(event);
	const { results, activity, changed, newActivity, quarantined } = await buildMergedResults(event, scraped, at);
	await writeLiveResults(event.slug, results);
	if (changed || activity.eventSlug === event.slug) {
		await writeLiveActivity(activity);
	}
	const block = r2BlockSummary(scraped);
	const error = block.lastError
		? block.lastError
		: scraped.errors.length
			? scraped.errors.join('; ').slice(0, 400)
			: scraped.scraped === 0
				? 'no divisions scraped'
				: null;
	const notified = changed && newActivity > 0 ? await notifyFreshResults(activity) : undefined;
	return {
		eventKey: event.key,
		slug: event.slug,
		lastSuccessAt: block.r2Blocked || (error && scraped.scraped === 0) ? null : at,
		lastError: error,
		lastUpdated: results.lastUpdated,
		divisionsScraped: scraped.scraped,
		matchesWithResults: countPublishedResults(results.divisions),
		quarantined,
		r2Blocked: block.r2Blocked,
		r2BlockedCount: block.r2BlockedCount,
		...(notified ? { notified } : {}),
	};
}

/** Persist unread overrides onto last-good blob data without hitting R2. */
async function applyOverridesWithoutScrape(
	event: LiveEventConfig,
	at: string,
	prevEvent?: EventSyncStatus,
): Promise<EventSyncStatus> {
	const existing = await readLiveResults(event.slug, {
		timeoutMs: BLOB_READ_FRESH_TIMEOUT_MS,
		useCache: false,
		applyOverrides: false,
	});
	const prevActivity = await readLiveActivity({
		timeoutMs: BLOB_READ_FRESH_TIMEOUT_MS,
		useCache: false,
	});
	const { results, changed, activity } = overlayLastGoodWithActivity(event, existing, prevActivity, at);
	if (changed) await writeLiveResults(event.slug, results);
	if (changed || activity.events.length !== (prevActivity.events?.length ?? 0)) {
		await writeLiveActivity(activity);
	}
	return {
		eventKey: event.key,
		slug: event.slug,
		lastSuccessAt: prevEvent?.lastSuccessAt ?? null,
		lastError: prevEvent?.lastError ?? 'backing off after R2 IP block',
		lastUpdated: results.lastUpdated,
		divisionsScraped: 0,
		matchesWithResults: countPublishedResults(results.divisions),
		quarantined: prevEvent?.quarantined ?? [],
		r2Blocked: true,
		r2BlockedCount: prevEvent?.r2BlockedCount ?? 0,
	};
}

export const GET: APIRoute = async ({ request, url }) => {
	if (!authorize(request)) return unauthorized();
	if (!env('CRON_SECRET')) return json({ error: 'CRON_SECRET is not configured' }, 503);
	if (!liveStoreConfigured()) {
		return json({ error: 'BLOB_READ_WRITE_TOKEN is not configured' }, 503);
	}

	const force = url.searchParams.get('force') === '1';
	const now = new Date();
	const inWindow = isAnyEventInWindow(now);
	const targets = eventsInWindow(now, force);
	const prev = await readSyncStatus();
	const at = now.toISOString();

	if (!targets.length) {
		const status: SyncStatus = {
			...prev,
			ok: true,
			lastRunAt: at,
			inWindow,
			skipped: force ? 'no configured events' : 'outside tournament Fri–Sun window',
			lastError: null,
		};
		await writeSyncStatus(status);
		return json(status);
	}

	if (shouldSkipBlockedRun(prev.r2SkipRunsRemaining, force)) {
		const remaining = nextSkipRunsRemaining(prev.r2SkipRunsRemaining, false, force);
		const events: Record<string, EventSyncStatus> = { ...prev.events };
		const reports: EventSyncStatus[] = [];
		for (const event of targets) {
			try {
				const report = await applyOverridesWithoutScrape(event, at, prev.events[event.slug]);
				events[event.slug] = report;
				reports.push(report);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				events[event.slug] = {
					eventKey: event.key,
					slug: event.slug,
					lastSuccessAt: prev.events[event.slug]?.lastSuccessAt ?? null,
					lastError: message.slice(0, 400),
					lastUpdated: prev.events[event.slug]?.lastUpdated ?? null,
					divisionsScraped: 0,
					matchesWithResults: prev.events[event.slug]?.matchesWithResults ?? 0,
					quarantined: prev.events[event.slug]?.quarantined ?? [],
					r2Blocked: true,
					r2BlockedCount: prev.events[event.slug]?.r2BlockedCount ?? 0,
				};
			}
		}
		const status: SyncStatus = {
			...prev,
			ok: false,
			lastRunAt: at,
			lastSuccessAt: prev.lastSuccessAt,
			lastError: prev.lastError ?? 'backing off after R2 IP block',
			inWindow: inWindow || force,
			skipped: `backing off after R2 IP block (${remaining} run${remaining === 1 ? '' : 's'} left)`,
			r2Blocked: true,
			r2BlockedCount: prev.r2BlockedCount ?? 0,
			r2SkipRunsRemaining: remaining,
			events,
		};
		await writeSyncStatus(status);
		return json({ ...status, reports });
	}

	const events: Record<string, EventSyncStatus> = { ...prev.events };
	const reports: Array<EventSyncStatus & { notified?: unknown }> = [];
	const runErrors: string[] = [];

	for (const event of targets) {
		try {
			const report = await syncOne(event, at);
			events[event.slug] = report;
			reports.push(report);
			if (report.lastError) runErrors.push(`${event.slug}: ${report.lastError}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			runErrors.push(`${event.slug}: ${message}`);
			events[event.slug] = {
				eventKey: event.key,
				slug: event.slug,
				lastSuccessAt: prev.events[event.slug]?.lastSuccessAt ?? null,
				lastError: message.slice(0, 400),
				lastUpdated: prev.events[event.slug]?.lastUpdated ?? null,
				divisionsScraped: 0,
				matchesWithResults: 0,
				quarantined: [],
			};
		}
	}

	const quarantined = reports.flatMap((r) => r.quarantined ?? []);
	const r2BlockedCount = reports.reduce((n, r) => n + (r.r2BlockedCount ?? 0), 0);
	const r2Blocked = r2BlockedCount > 0 || reports.some((r) => r.r2Blocked);
	if (r2Blocked) {
		runErrors.push(`R2 blocked this IP (${r2BlockedCount} request${r2BlockedCount === 1 ? '' : 's'})`);
	}
	const status: SyncStatus = {
		ok: runErrors.length === 0 && !r2Blocked,
		lastRunAt: at,
		lastSuccessAt: runErrors.length === 0 && !r2Blocked ? at : prev.lastSuccessAt,
		lastError: runErrors.length ? runErrors.join('; ').slice(0, 500) : null,
		inWindow: inWindow || force,
		quarantined,
		r2Blocked,
		r2BlockedCount,
		r2SkipRunsRemaining: nextSkipRunsRemaining(prev.r2SkipRunsRemaining, r2Blocked, force),
		events,
	};
	await writeSyncStatus(status);
	return json({ ...status, reports });
};

export const POST = GET;
