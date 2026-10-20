import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { del, get, put } from '@vercel/blob';
import type { EventSnapshot, HealthReport, LiveActivityFeed } from './types';

const BLOB_PREFIX = 'live-results';
const LOCAL_DIR = resolve(process.cwd(), '.data/live-results');

function hasBlobToken(): boolean {
	return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function snapshotBlobPath(slug: string): string {
	return `${BLOB_PREFIX}/${slug}/current.json`;
}

function snapshotVersionPath(slug: string, iso: string): string {
	const safe = iso.replace(/[:.]/g, '-');
	return `${BLOB_PREFIX}/${slug}/${safe}.json`;
}

function healthBlobPath(): string {
	return `${BLOB_PREFIX}/health.json`;
}

function activityBlobPath(): string {
	return `${BLOB_PREFIX}/activity.json`;
}

function localPath(rel: string): string {
	return resolve(LOCAL_DIR, rel.replace(/^live-results\//, ''));
}

async function readStreamText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	if (!stream) return '';
	return new Response(stream).text();
}

async function readBlobJson<T>(pathname: string): Promise<T | null> {
	if (!hasBlobToken()) return null;
	try {
		const fresh = await get(pathname, { access: 'public', useCache: false });
		if (!fresh?.stream) return null;
		return JSON.parse(await readStreamText(fresh.stream)) as T;
	} catch {
		return null;
	}
}

function readLocalJson<T>(pathname: string): T | null {
	const file = localPath(pathname);
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(readFileSync(file, 'utf-8')) as T;
	} catch {
		return null;
	}
}

function writeLocalJsonAtomic(pathname: string, data: unknown): void {
	const file = localPath(pathname);
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
	renameSync(tmp, file);
}

async function writeBlobJson(pathname: string, data: unknown, cacheControlMaxAge = 30): Promise<void> {
	await put(pathname, JSON.stringify(data), {
		access: 'public',
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: 'application/json',
		cacheControlMaxAge,
	});
}

export async function readSnapshot(slug: string): Promise<EventSnapshot | null> {
	const blob = await readBlobJson<EventSnapshot>(snapshotBlobPath(slug));
	if (blob?.version === 1) return blob;
	const local = readLocalJson<EventSnapshot>(snapshotBlobPath(slug));
	return local?.version === 1 ? local : null;
}

export async function writeSnapshot(snapshot: EventSnapshot): Promise<void> {
	// Versioned object first, then pointer — pointer is only replaced after a full write.
	if (hasBlobToken()) {
		await writeBlobJson(snapshotVersionPath(snapshot.slug, snapshot.syncedAt), snapshot, 86_400);
		await writeBlobJson(snapshotBlobPath(snapshot.slug), snapshot, 30);
	}
	writeLocalJsonAtomic(snapshotVersionPath(snapshot.slug, snapshot.syncedAt), snapshot);
	writeLocalJsonAtomic(snapshotBlobPath(snapshot.slug), snapshot);
}

export async function readHealth(): Promise<HealthReport | null> {
	const blob = await readBlobJson<HealthReport>(healthBlobPath());
	if (blob?.version === 1) return blob;
	const local = readLocalJson<HealthReport>(healthBlobPath());
	return local?.version === 1 ? local : null;
}

export async function writeHealth(report: HealthReport): Promise<void> {
	if (hasBlobToken()) await writeBlobJson(healthBlobPath(), report, 15);
	writeLocalJsonAtomic(healthBlobPath(), report);
}

export async function readActivity(): Promise<LiveActivityFeed | null> {
	const blob = await readBlobJson<LiveActivityFeed>(activityBlobPath());
	if (blob) return blob;
	return readLocalJson<LiveActivityFeed>(activityBlobPath());
}

export async function writeActivity(feed: LiveActivityFeed): Promise<void> {
	if (hasBlobToken()) await writeBlobJson(activityBlobPath(), feed, 30);
	writeLocalJsonAtomic(activityBlobPath(), feed);
}

export async function deleteSnapshot(slug: string): Promise<void> {
	if (!hasBlobToken()) return;
	try {
		await del(snapshotBlobPath(slug));
	} catch {
		/* ignore */
	}
}

export function snapshotToDivisionResults(snapshot: EventSnapshot): Record<string, Record<string, { player1?: string; player2?: string; winner?: 1 | 2 | null; score?: string | null }>> {
	const out: Record<string, Record<string, { player1?: string; player2?: string; winner?: 1 | 2 | null; score?: string | null }>> = {};
	for (const [id, div] of Object.entries(snapshot.divisions)) {
		out[id] = {};
		for (const [matchId, match] of Object.entries(div.matches)) {
			out[id]![matchId] = {
				player1: match.player1 ?? undefined,
				player2: match.player2 ?? undefined,
				winner: match.winner,
				score: match.score,
			};
		}
	}
	return out;
}
