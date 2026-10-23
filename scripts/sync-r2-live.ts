/**
 * File-backed R2 sync used by the GitHub Actions fallback.
 * Uses the same fetch + explicit-winner path as the Vercel cron.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_EVENTS, type EventKey } from '../src/lib/live/config';
import { mergeScrapedResults, scrapeEvent } from '../src/lib/live/scrape';
import type { LiveActivityFeed, LiveResultsFile } from '../src/lib/live/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATHS: Record<string, string> = {
	'ocala-open': resolve(__dirname, '../src/data/ocala-results.json'),
	'sarasota-open': resolve(__dirname, '../src/data/sarasota-results.json'),
	'port-st-lucie-open': resolve(__dirname, '../src/data/port-st-lucie-results.json'),
};
const ACTIVITY_PATH = resolve(__dirname, '../public/data/live-activity.json');

const eventKey = (process.argv[2] ?? 'psl') as EventKey;
const event = LIVE_EVENTS[eventKey];
if (!event) {
	console.error(`Unknown event "${eventKey}". Valid: ${Object.keys(LIVE_EVENTS).join(', ')}`);
	process.exit(1);
}

function readJson<T>(path: string, fallback: T): T {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as T;
	} catch {
		return fallback;
	}
}

const scraped = await scrapeEvent(event);
const existing = readJson<LiveResultsFile>(RESULTS_PATHS[event.slug]!, { lastUpdated: null, divisions: {} });
const prevActivity = readJson<LiveActivityFeed>(ACTIVITY_PATH, { lastUpdated: null, eventSlug: event.slug, events: [] });
const at = new Date().toISOString();
const { results, activity, changed, newActivity, quarantined } = mergeScrapedResults(
	event,
	existing,
	scraped,
	prevActivity,
	at,
);

if (!changed) {
	console.log(`No changes — ${RESULTS_PATHS[event.slug]!.split('/').pop()} is already up to date.`);
	if (quarantined.length) {
		console.log(`Quarantined: ${quarantined.map((q) => `${q.matchId} (${q.reason})`).join('; ')}`);
	}
	process.exit(0);
}

const resultsPath = RESULTS_PATHS[event.slug]!;
writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n');
mkdirSync(dirname(ACTIVITY_PATH), { recursive: true });
writeFileSync(ACTIVITY_PATH, JSON.stringify(activity, null, 2) + '\n');
console.log(`Wrote ${resultsPath}`);
console.log(`Wrote ${ACTIVITY_PATH}`);
console.log(`Activity: ${newActivity} new item(s)`);
if (quarantined.length) {
	console.log(`Quarantined: ${quarantined.map((q) => `${q.matchId} (${q.reason})`).join('; ')}`);
}
