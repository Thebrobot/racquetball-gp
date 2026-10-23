import type { APIRoute } from 'astro';
import { createAdminClient, env, json } from '../../../lib/accounts/supabase';
import { eventsInWindow, isAnyEventInWindow, type LiveEventConfig } from '../../../lib/live/config';
import { buildMergedResults, countPublishedResults, scrapeEvent } from '../../../lib/live/scrape';
import { liveStoreConfigured, readSyncStatus, writeLiveActivity, writeLiveResults, writeSyncStatus } from '../../../lib/live/store';
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
	const error = scraped.errors.length
		? scraped.errors.join('; ').slice(0, 400)
		: scraped.scraped === 0
			? 'no divisions scraped'
			: null;
	const notified = changed && newActivity > 0 ? await notifyFreshResults(activity) : undefined;
	return {
		eventKey: event.key,
		slug: event.slug,
		lastSuccessAt: error && scraped.scraped === 0 ? null : at,
		lastError: error,
		lastUpdated: results.lastUpdated,
		divisionsScraped: scraped.scraped,
		matchesWithResults: countPublishedResults(results.divisions),
		quarantined,
		...(notified ? { notified } : {}),
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
	const status: SyncStatus = {
		ok: runErrors.length === 0,
		lastRunAt: at,
		lastSuccessAt: runErrors.length === 0 ? at : prev.lastSuccessAt,
		lastError: runErrors.length ? runErrors.join('; ').slice(0, 500) : null,
		inWindow: inWindow || force,
		quarantined,
		events,
	};
	await writeSyncStatus(status);
	return json({ ...status, reports });
};

export const POST = GET;
