/**
 * Build live-activity.json from Ocala bracket results in events.ts + ocala-results.json.
 *
 * Usage: node scripts/backfill-live-activity.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = resolve(__dirname, '../src/data/events.ts');
const RESULTS_PATH = resolve(__dirname, '../src/data/ocala-results.json');
const ACTIVITY_PATH = resolve(__dirname, '../public/data/live-activity.json');
const EVENT_SLUG = 'ocala-open';
const MAX_EVENTS = 80;

const DIVISION_LABELS = {
	'mens-singles-open': "Men's Singles: Open",
	'mens-singles-elite': "Men's Singles: Elite",
	'mens-singles-a': "Men's Singles: A",
	'mens-singles-b': "Men's Singles: B",
	'mens-singles-c': "Men's Singles: C",
	'mens-age-50': "Men's Age Singles: 50+",
	'mens-age-60': "Men's Age Singles: 60+",
	'mens-age-70': "Men's Age Singles: 70+",
	'mens-doubles-open': "Men's Doubles: Open",
	'mens-doubles-elite': "Men's Doubles: Elite",
	'mens-doubles-a': "Men's Doubles: A",
	'mens-doubles-b': "Men's Doubles: B",
	'mens-doubles-centurion': "Men's Doubles: Centurion+ Open",
	'mens-doubles-super-centurion': "Men's Doubles: Super Centurion (120+)",
	'mixed-doubles': 'Mixed Doubles: Open/A',
};

function fieldStr(line, key) {
	const sq = line.match(new RegExp(`${key}:\\s*'([^']*)'`));
	if (sq) return sq[1];
	const dq = line.match(new RegExp(`${key}:\\s*"([^"]*)"`));
	return dq?.[1];
}

function fieldNum(line, key) {
	const m = line.match(new RegExp(`${key}:\\s*(\\d)`));
	return m ? Number(m[1]) : undefined;
}

/** Parse "Friday · 4:30 PM" → UTC Date (Ocala ≈ America/New_York, May 2026 EDT = UTC-4). */
function scheduledTimeToDate(scheduledTime) {
	if (!scheduledTime) return null;
	const dayMap = { Friday: 15, Saturday: 16, Sunday: 17 };
	const m = scheduledTime.match(/^(Friday|Saturday|Sunday)\s*·\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
	if (!m) return null;
	const [, dayName, h, min, ampm] = m;
	let hour = parseInt(h, 10);
	if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
	if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
	const day = dayMap[dayName] ?? 16;
	return new Date(Date.UTC(2026, 4, day, hour + 4, parseInt(min, 10), 0));
}

function isBye(name) {
	const u = (name ?? '').trim().toUpperCase();
	return u === 'BYE' || u === 'TBD' || u === '';
}

function parseMatchLine(line, divId) {
	if (!line.includes('winner:')) return null;

	const team1 = fieldStr(line, 'team1');
	const team2 = fieldStr(line, 'team2');
	const player1 = team1 ?? fieldStr(line, 'player1');
	const player2 = team2 ?? fieldStr(line, 'player2');
	const winner = fieldNum(line, 'winner');
	const score = fieldStr(line, 'score');
	const matchId = fieldStr(line, 'matchId');
	const scheduledTime = fieldStr(line, 'scheduledTime');

	if (!player1 || !player2 || winner !== 1 && winner !== 2) return null;
	if (isBye(player1) || isBye(player2)) return null;

	return {
		divId,
		matchId: matchId ?? `line-${divId}`,
		player1,
		player2,
		winner,
		score: score || undefined,
		scheduledTime,
	};
}

/** matchId → { player1, player2 } from any bracket row (even without a result yet). */
function buildMatchNameIndex(source) {
	const index = new Map();
	for (const line of source.split('\n')) {
		const matchId = fieldStr(line, 'matchId');
		if (!matchId) continue;
		const player1 = fieldStr(line, 'team1') ?? fieldStr(line, 'player1');
		const player2 = fieldStr(line, 'team2') ?? fieldStr(line, 'player2');
		if (!player1 || !player2 || isBye(player1) || isBye(player2)) continue;
		index.set(matchId, { player1, player2 });
	}
	return index;
}

function extractMatchesFromEventsSource(source) {
	const matches = [];
	let currentDivId = null;
	let rrDivId = null;

	const divIdRe = /^\s*id:\s*'([^']+)',?\s*$/;
	for (const line of source.split('\n')) {
		const divM = line.match(divIdRe);
		if (divM) {
			const id = divM[1];
			if (id.startsWith('mens-') || id === 'mixed-doubles') {
				currentDivId = id;
				rrDivId = id;
			}
			continue;
		}

		if (line.includes('team1:') && line.includes('winner:') && rrDivId) {
			const m = parseMatchLine(line, rrDivId);
			if (m) matches.push(m);
			continue;
		}

		if (line.includes('player1:') && line.includes('winner:') && currentDivId) {
			const m = parseMatchLine(line, currentDivId);
			if (m) matches.push(m);
		}
	}
	return matches;
}

/** Merge scrape snapshot; prefer full names from events when matchId matches. */
function mergeOscalaResults(eventMatches, resultsJson) {
	const byKey = new Map(eventMatches.map((m) => [`${m.divId}:${m.matchId}`, m]));

	for (const [divId, divMatches] of Object.entries(resultsJson.divisions ?? {})) {
		for (const [matchId, res] of Object.entries(divMatches)) {
			if (res.winner !== 1 && res.winner !== 2) continue;
			const key = `${divId}:${matchId}`;
			const existing = byKey.get(key);
			const entry = {
				divId,
				matchId,
				player1: res.player1,
				player2: res.player2,
				winner: res.winner,
				score: res.score ?? undefined,
				scheduledTime: existing?.scheduledTime,
			};
			if (existing) {
				entry.player1 = existing.player1;
				entry.player2 = existing.player2;
				entry.scheduledTime = existing.scheduledTime ?? entry.scheduledTime;
				if (!entry.score && existing.score) entry.score = existing.score;
			}
			byKey.set(key, entry);
		}
	}
	return [...byKey.values()];
}

function winnerLoserNames(m) {
	const winnerName = m.winner === 1 ? m.player1 : m.player2;
	const loserName = m.winner === 1 ? m.player2 : m.player1;
	return { winnerName: winnerName.trim(), loserName: loserName.trim() };
}

function toFeedEvent(m, at) {
	const { winnerName, loserName } = winnerLoserNames(m);
	return {
		id: `${at.toISOString()}-${m.divId}-${m.matchId}`,
		at: at.toISOString(),
		type: 'result',
		divisionId: m.divId,
		divisionLabel: DIVISION_LABELS[m.divId] ?? m.divId,
		matchId: m.matchId,
		headline: `${winnerName} def ${loserName}`,
		detail: m.score,
		bracketHref: `/events/${EVENT_SLUG}/divisions/${m.divId}`,
	};
}

function main() {
	const source = readFileSync(EVENTS_PATH, 'utf-8');
	const ocalaStart = source.indexOf("slug: 'ocala-open'");
	const ocalaEnd = source.indexOf('\n];', ocalaStart);
	const ocalaBlock = source.slice(ocalaStart, ocalaEnd > 0 ? ocalaEnd : undefined);

	let resultsJson = { lastUpdated: null, divisions: {} };
	try {
		resultsJson = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
	} catch {
		/* ignore */
	}

	const nameIndex = buildMatchNameIndex(ocalaBlock);
	const merged = mergeOscalaResults(extractMatchesFromEventsSource(ocalaBlock), resultsJson).map(
		(m) => {
			const names = nameIndex.get(m.matchId);
			if (!names) return m;
			return { ...m, player1: names.player1, player2: names.player2 };
		},
	);

	const withTime = merged.map((m) => ({
		...m,
		at: scheduledTimeToDate(m.scheduledTime) ?? new Date('2026-05-16T20:30:00.000Z'),
	}));

	withTime.sort((a, b) => a.at.getTime() - b.at.getTime());

	const events = withTime
		.map((m) => toFeedEvent(m, m.at))
		.reverse()
		.slice(0, MAX_EVENTS);

	const lastUpdated = resultsJson.lastUpdated ?? events[0]?.at ?? new Date().toISOString();

	const feed = { lastUpdated, eventSlug: EVENT_SLUG, events };
	mkdirSync(dirname(ACTIVITY_PATH), { recursive: true });
	writeFileSync(ACTIVITY_PATH, JSON.stringify(feed, null, 2) + '\n');
	console.log(`✅  Wrote ${events.length} live activity event(s) to ${ACTIVITY_PATH}`);
}

main();
