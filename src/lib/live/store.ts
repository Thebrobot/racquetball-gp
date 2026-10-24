import { get, put } from '@vercel/blob';
import ocalaResults from '../../data/ocala-results.json';
import portStLucieResults from '../../data/port-st-lucie-results.json';
import sarasotaResults from '../../data/sarasota-results.json';
import bundledActivity from '../../../public/data/live-activity.json';
import { applyActivityBackfills } from './activity-feed';
import { applyMatchOverrides } from './match-overrides';
import type { LiveActivityFeed, LiveResultsFile, SyncStatus } from './types';

const RESULTS_PREFIX = 'live/results/';
const ACTIVITY_PATH = 'live/activity.json';
const STATUS_PATH = 'live/status.json';

const BUNDLED_RESULTS: Record<string, LiveResultsFile> = {
	'ocala-open': ocalaResults as LiveResultsFile,
	'sarasota-open': sarasotaResults as LiveResultsFile,
	'port-st-lucie-open': portStLucieResults as LiveResultsFile,
};

function usableBlobToken(): boolean {
	const token = process.env.BLOB_READ_WRITE_TOKEN ?? '';
	return token.length > 20 && !token.includes('SENSITIVE');
}

export function liveStoreConfigured(): boolean {
	return usableBlobToken() || Boolean(process.env.BLOB_STORE_ID);
}

async function readStreamText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	if (!stream) return '';
	return new Response(stream).text();
}

/** Page renders must not wait on a wedged Blob get(); cron can wait longer. */
export const BLOB_READ_TIMEOUT_MS = 2_000;
export const BLOB_READ_FRESH_TIMEOUT_MS = 10_000;

export type BlobReadOptions = {
	timeoutMs?: number;
	useCache?: boolean;
	/** Default true so a deploy shows overrides while the cron is IP-blocked. */
	applyOverrides?: boolean;
};

export function blobReadOptions(opts?: BlobReadOptions): {
	access: 'public';
	useCache: boolean;
	abortSignal: AbortSignal;
} {
	return {
		access: 'public',
		useCache: opts?.useCache ?? true,
		abortSignal: AbortSignal.timeout(opts?.timeoutMs ?? BLOB_READ_TIMEOUT_MS),
	};
}

async function readBlobJson<T>(pathname: string, opts?: BlobReadOptions): Promise<T | null> {
	if (!liveStoreConfigured()) return null;
	try {
		const fresh = await get(pathname, blobReadOptions(opts));
		if (!fresh?.stream) return null;
		return JSON.parse(await readStreamText(fresh.stream)) as T;
	} catch {
		return null;
	}
}

async function writeBlobJson(pathname: string, data: unknown): Promise<void> {
	if (!liveStoreConfigured()) {
		throw new Error('Vercel Blob is not configured (BLOB_READ_WRITE_TOKEN).');
	}
	await put(pathname, JSON.stringify(data), {
		access: 'public',
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: 'application/json',
		cacheControlMaxAge: 30,
	});
}

function resultsPath(slug: string): string {
	return `${RESULTS_PREFIX}${slug}.json`;
}

function emptyResults(): LiveResultsFile {
	return { lastUpdated: null, divisions: {} };
}

function emptyActivity(eventSlug = 'port-st-lucie-open'): LiveActivityFeed {
	return { lastUpdated: null, eventSlug, events: [] };
}

function emptyStatus(): SyncStatus {
	return {
		ok: true,
		lastRunAt: null,
		lastSuccessAt: null,
		lastError: null,
		inWindow: false,
		events: {},
	};
}

function newer(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a) return false;
	if (!b) return true;
	return a > b;
}

/**
 * The cron's Blob copy is the source of truth. The repo copy (GitHub fallback
 * sync) only wins when Blob has fallen more than 30 minutes behind it, which
 * means the cron has stalled. Otherwise two scrapers would take turns and the
 * feed would appear to lose history.
 */
const FALLBACK_GRACE_MS = 30 * 60 * 1000;
function preferLive(liveStamp: string | null | undefined, bundledStamp: string | null | undefined): boolean {
	if (!liveStamp) return false;
	if (!bundledStamp) return true;
	return Date.parse(bundledStamp) - Date.parse(liveStamp) < FALLBACK_GRACE_MS;
}

export function withMatchOverrides(slug: string, file: LiveResultsFile): LiveResultsFile {
	return {
		...file,
		divisions: applyMatchOverrides(slug, file.divisions ?? {}, file.supersededOverrides),
	};
}

export function getBundledResults(slug: string): LiveResultsFile {
	return withMatchOverrides(slug, BUNDLED_RESULTS[slug] ?? emptyResults());
}

export async function readLiveResults(slug: string, opts?: BlobReadOptions): Promise<LiveResultsFile> {
	const bundled = BUNDLED_RESULTS[slug] ?? emptyResults();
	const live = await readBlobJson<LiveResultsFile>(resultsPath(slug), opts);
	const raw = live?.divisions && preferLive(live.lastUpdated, bundled.lastUpdated) ? live : bundled;
	if (opts?.applyOverrides === false) return raw;
	return withMatchOverrides(slug, raw);
}

export async function writeLiveResults(slug: string, data: LiveResultsFile): Promise<void> {
	await writeBlobJson(resultsPath(slug), data);
}

function withActivityBackfill(feed: LiveActivityFeed): LiveActivityFeed {
	return applyActivityBackfills(feed.eventSlug || 'port-st-lucie-open', feed);
}

export function getBundledActivity(): LiveActivityFeed {
	return withActivityBackfill((bundledActivity as LiveActivityFeed) ?? emptyActivity());
}

export async function readLiveActivity(opts?: BlobReadOptions): Promise<LiveActivityFeed> {
	const bundled = (bundledActivity as LiveActivityFeed) ?? emptyActivity();
	const live = await readBlobJson<LiveActivityFeed>(ACTIVITY_PATH, opts);
	const raw = live?.events && preferLive(live.lastUpdated, bundled.lastUpdated) ? live : bundled;
	return withActivityBackfill(raw);
}

export async function writeLiveActivity(feed: LiveActivityFeed): Promise<void> {
	await writeBlobJson(ACTIVITY_PATH, feed);
}

export async function readSyncStatus(opts?: BlobReadOptions): Promise<SyncStatus> {
	return (await readBlobJson<SyncStatus>(STATUS_PATH, opts)) ?? emptyStatus();
}

export async function writeSyncStatus(status: SyncStatus): Promise<void> {
	await writeBlobJson(STATUS_PATH, status);
}

/** Optional audit copy of the R2 HTML that produced a changed result. */
export async function writeResultAuditHtml(
	slug: string,
	matchId: string,
	html: string,
	at = new Date().toISOString(),
): Promise<string | null> {
	if (!liveStoreConfigured()) return null;
	const stamp = at.replace(/[:.]/g, '-');
	const pathname = `live/audit/${slug}/${matchId}-${stamp}.html`;
	try {
		await put(pathname, html, {
			access: 'public',
			addRandomSuffix: false,
			allowOverwrite: true,
			contentType: 'text/html; charset=utf-8',
			cacheControlMaxAge: 60 * 60 * 24 * 30,
		});
		return pathname;
	} catch {
		return null;
	}
}
