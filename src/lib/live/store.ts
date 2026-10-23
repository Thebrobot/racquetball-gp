import { get, put } from '@vercel/blob';
import ocalaResults from '../../data/ocala-results.json';
import portStLucieResults from '../../data/port-st-lucie-results.json';
import sarasotaResults from '../../data/sarasota-results.json';
import bundledActivity from '../../../public/data/live-activity.json';
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

async function readBlobJson<T>(pathname: string): Promise<T | null> {
	if (!liveStoreConfigured()) return null;
	try {
		const fresh = await get(pathname, { access: 'public', useCache: false });
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

export function getBundledResults(slug: string): LiveResultsFile {
	return BUNDLED_RESULTS[slug] ?? emptyResults();
}

export async function readLiveResults(slug: string): Promise<LiveResultsFile> {
	const bundled = getBundledResults(slug);
	const live = await readBlobJson<LiveResultsFile>(resultsPath(slug));
	if (live?.divisions && newer(live.lastUpdated, bundled.lastUpdated)) return live;
	if (live?.divisions && !bundled.lastUpdated) return live;
	return bundled;
}

export async function writeLiveResults(slug: string, data: LiveResultsFile): Promise<void> {
	await writeBlobJson(resultsPath(slug), data);
}

export async function readLiveActivity(): Promise<LiveActivityFeed> {
	const bundled = (bundledActivity as LiveActivityFeed) ?? emptyActivity();
	const live = await readBlobJson<LiveActivityFeed>(ACTIVITY_PATH);
	if (live?.events && newer(live.lastUpdated, bundled.lastUpdated)) return live;
	if (live?.events && !bundled.lastUpdated) return live;
	return bundled;
}

export async function writeLiveActivity(feed: LiveActivityFeed): Promise<void> {
	await writeBlobJson(ACTIVITY_PATH, feed);
}

export async function readSyncStatus(): Promise<SyncStatus> {
	return (await readBlobJson<SyncStatus>(STATUS_PATH)) ?? emptyStatus();
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
