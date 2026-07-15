/**
 * compute-sarasota-gp-points.ts
 *
 * Derives Lap 2 (Sarasota) GP points from merged brackets + results and
 * merges them into src/data/gp-points.json as s2. Does not touch the Google Sheet.
 *
 * Usage:
 *   npx tsx scripts/compute-sarasota-gp-points.ts
 *   npm run compute:sarasota-points
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { EVENTS } from '../src/data/events.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GP_PATH = resolve(__dirname, '../src/data/gp-points.json');

const SINGLES_POINTS = [100, 75, 50, 25] as const;
const DOUBLES_POINTS = [50, 37.5, 25, 12.5] as const;

const DIVISION_CATEGORY: Record<string, 'singles' | 'doubles' | 'mixed'> = {
	'mens-singles-open': 'singles',
	'mens-singles-elite': 'singles',
	'mens-singles-a': 'singles',
	'mens-singles-b': 'singles',
	'mens-singles-c': 'singles',
	'mens-age-3040': 'singles',
	'mens-age-50': 'singles',
	'mens-age-60': 'singles',
	'mens-age-70': 'singles',
	'mens-doubles-open': 'doubles',
	'mens-doubles-elite': 'doubles',
	'mens-doubles-a': 'doubles',
	'mens-doubles-b': 'doubles',
	'mens-doubles-centurion': 'doubles',
};

type Tier = 0 | 1 | 2 | 3; // index into points tables

interface GpRow {
	place: number;
	name: string;
	s1: number;
	s2: number;
	wins: number;
	attendance: number;
	status: 'q' | 'pace' | 'chase';
	city: string;
}

interface GpPayload {
	lastUpdated: string;
	sourceSheetId: string;
	events: { id: string; label: string; stopKey: string }[];
	standings: Record<string, Record<string, GpRow[]>>;
}

function isGhost(name: string): boolean {
	const u = name.trim().toUpperCase();
	return !u || u === 'BYE' || u === 'TBD';
}

function normalizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\./g, ' ')
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function namesMatch(a: string, b: string): boolean {
	const na = normalizeName(a);
	const nb = normalizeName(b);
	if (na === nb) return true;
	const pa = na.split(' ').filter(Boolean);
	const pb = nb.split(' ').filter(Boolean);
	if (pa.length >= 2 && pb.length >= 2) {
		const aFirst = pa[0]!;
		const bFirst = pb[0]!;
		const aLast = pa[pa.length - 1]!;
		const bLast = pb[pb.length - 1]!;
		if (aLast === bLast && (aFirst === bFirst || aFirst[0] === bFirst[0])) return true;
	}
	// Team labels often use multi-word surnames ("Portillo Torres", "De La Rosa")
	const shorter = pa.length <= pb.length ? pa : pb;
	const longer = pa.length <= pb.length ? pb : pa;
	if (
		shorter.length >= 1 &&
		shorter.every((t, i) => t === longer[longer.length - shorter.length + i])
	) {
		return true;
	}
	return false;
}

function parseScoreDiff(score: string | undefined): { p1: number; p2: number } {
	if (!score) return { p1: 0, p2: 0 };
	let p1 = 0;
	let p2 = 0;
	for (const game of score.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
		const m = game.match(/(\d+)\s*-\s*(\d+)/);
		if (!m) continue;
		p1 += Number(m[1]);
		p2 += Number(m[2]);
	}
	return { p1, p2 };
}

function pointsForTier(tier: Tier, doubles: boolean): number {
	return doubles ? DOUBLES_POINTS[tier]! : SINGLES_POINTS[tier]!;
}

function statusForRank(rank: number): 'q' | 'pace' | 'chase' {
	if (rank === 1) return 'q';
	if (rank <= 4) return 'pace';
	return 'chase';
}

/** Resolve doubles team label parts to full participant names. */
function expandTeamToPlayers(
	teamLabel: string,
	roster: string[],
	doubles: boolean,
): string[] {
	if (!doubles) return isGhost(teamLabel) ? [] : [teamLabel];

	const parts = teamLabel.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
	const resolved: string[] = [];

	for (const part of parts) {
		const normPart = normalizeName(part);
		const partTokens = normPart.split(' ').filter(Boolean);
		const last = partTokens[partTokens.length - 1] ?? '';
		const initial = partTokens.length >= 2 && partTokens[0]!.length === 1 ? partTokens[0] : null;

		let match = roster.find((r) => namesMatch(r, part));
		if (!match && last) {
			const candidates = roster.filter((r) => {
				const rn = normalizeName(r).split(' ');
				const rLast = rn[rn.length - 1] ?? '';
				if (rLast !== last) return false;
				if (initial) return (rn[0] ?? '')[0] === initial;
				return true;
			});
			if (candidates.length === 1) match = candidates[0];
			else if (candidates.length > 1 && !initial) {
				// Prefer exact last-only team tags ("Schulze") when unique enough by full last name
				match = candidates[0];
			}
		}
		resolved.push(match ?? part);
	}
	return resolved;
}

function seFinishes(
	rounds: { label: string; matches: { player1: string; player2: string; winner?: 1 | 2 }[] }[],
): Map<string, Tier> {
	const finish = new Map<string, Tier>();

	// Default: every real entrant is quarterfinal+ / consolation tier
	for (const round of rounds) {
		for (const m of round.matches) {
			if (!isGhost(m.player1)) finish.set(m.player1, 3);
			if (!isGhost(m.player2)) finish.set(m.player2, 3);
		}
	}

	// Do not use /final/i — it matches "Quarterfinals".
	const finalRound = rounds.find((r) => /^finals?$/i.test(r.label.trim()));
	const semiRound = rounds.find((r) => /semi/i.test(r.label));

	if (semiRound) {
		for (const m of semiRound.matches) {
			if (m.winner !== 1 && m.winner !== 2) continue;
			const loser = m.winner === 1 ? m.player2 : m.player1;
			if (!isGhost(loser)) finish.set(loser, 2);
		}
	}

	if (finalRound?.matches[0] && (finalRound.matches[0].winner === 1 || finalRound.matches[0].winner === 2)) {
		const m = finalRound.matches[0];
		const winner = m.winner === 1 ? m.player1 : m.player2;
		const loser = m.winner === 1 ? m.player2 : m.player1;
		if (!isGhost(winner)) finish.set(winner, 0);
		if (!isGhost(loser)) finish.set(loser, 1);
	}

	return finish;
}

interface RrEntity {
	name: string;
	wins: number;
	losses: number;
	pf: number;
	pa: number;
}

function rrFinishes(
	entities: string[],
	matches: { team1: string; team2: string; winner?: 1 | 2; score?: string }[],
): Map<string, Tier> {
	const stats = new Map<string, RrEntity>();
	for (const name of entities) {
		if (!isGhost(name)) stats.set(name, { name, wins: 0, losses: 0, pf: 0, pa: 0 });
	}

	const findKey = (label: string): string | null => {
		if (isGhost(label)) return null;
		if (stats.has(label)) return label;
		for (const key of stats.keys()) {
			if (namesMatch(key, label)) return key;
		}
		return null;
	};

	for (const m of matches) {
		if (m.winner !== 1 && m.winner !== 2) continue;
		const k1 = findKey(m.team1);
		const k2 = findKey(m.team2);
		if (!k1 || !k2) continue;
		const s1 = stats.get(k1)!;
		const s2 = stats.get(k2)!;
		const { p1, p2 } = parseScoreDiff(m.score);
		s1.pf += p1;
		s1.pa += p2;
		s2.pf += p2;
		s2.pa += p1;
		if (m.winner === 1) {
			s1.wins++;
			s2.losses++;
		} else {
			s2.wins++;
			s1.losses++;
		}
	}

	const ranked = [...stats.values()].sort((a, b) => {
		if (b.wins !== a.wins) return b.wins - a.wins;
		// Head-to-head among tied win counts
		const tied = [a, b];
		void tied;
		const h2h = matches.find((m) => {
			const k1 = findKey(m.team1);
			const k2 = findKey(m.team2);
			return (
				(k1 === a.name && k2 === b.name) || (k1 === b.name && k2 === a.name)
			);
		});
		if (h2h?.winner === 1 || h2h?.winner === 2) {
			const k1 = findKey(h2h.team1);
			const winnerName = h2h.winner === 1 ? k1 : findKey(h2h.team2);
			if (winnerName === a.name) return -1;
			if (winnerName === b.name) return 1;
		}
		const diffA = a.pf - a.pa;
		const diffB = b.pf - b.pa;
		if (diffB !== diffA) return diffB - diffA;
		return a.name.localeCompare(b.name);
	});

	const finish = new Map<string, Tier>();
	ranked.forEach((row, i) => {
		const tier = (i <= 3 ? i : 3) as Tier;
		finish.set(row.name, tier);
	});
	return finish;
}

function computeSarasotaS2(): Map<string, Map<string, number>> {
	/** divisionId → playerName → s2 points */
	const out = new Map<string, Map<string, number>>();
	const event = EVENTS.find((e) => e.slug === 'sarasota-open');
	if (!event) throw new Error('sarasota-open event not found');

	const roster = [...new Set(event.profiles.map((p) => p.name))];

	for (const div of event.divisionDetails) {
		const category = DIVISION_CATEGORY[div.id];
		if (!category) {
			console.warn(`  skip unknown division ${div.id}`);
			continue;
		}
		const doubles = category === 'doubles';
		const playerPoints = new Map<string, number>();

		const award = (entryLabel: string, tier: Tier) => {
			const pts = pointsForTier(tier, doubles);
			const players = expandTeamToPlayers(entryLabel, roster, doubles);
			for (const p of players) {
				if (isGhost(p)) continue;
				playerPoints.set(p, pts);
			}
		};

		if (div.format === 'single' && div.rounds?.length) {
			const finishes = seFinishes(div.rounds);
			for (const [entry, tier] of finishes) award(entry, tier);
		} else if (div.format === 'roundrobin') {
			const entities = div.roundRobinPlayers ?? [];
			const finishes = rrFinishes(entities, div.roundRobinMatches ?? []);
			for (const [entry, tier] of finishes) award(entry, tier);
		}

		out.set(div.id, playerPoints);
		console.log(
			`  ${div.id}: ${playerPoints.size} players`,
			[...playerPoints.entries()]
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.map(([n, p]) => `${n}=${p}`)
				.join(', '),
		);
	}

	return out;
}

function findExistingRow(rows: GpRow[], name: string): GpRow | undefined {
	return rows.find((r) => namesMatch(r.name, name));
}

function mergeIntoPayload(payload: GpPayload, s2ByDivision: Map<string, Map<string, number>>): GpPayload {
	const standings: GpPayload['standings'] = {
		singles: { ...(payload.standings.singles ?? {}) },
		doubles: { ...(payload.standings.doubles ?? {}) },
		mixed: { ...(payload.standings.mixed ?? {}) },
	};

	// Zero existing s2 first (recompute cleanly)
	for (const cat of Object.values(standings)) {
		for (const rows of Object.values(cat)) {
			for (const row of rows) row.s2 = 0;
		}
	}

	for (const [divisionId, playerPoints] of s2ByDivision) {
		const category = DIVISION_CATEGORY[divisionId];
		if (!category) continue;
		if (!standings[category]) standings[category] = {};
		const rows = [...(standings[category][divisionId] ?? [])];

		for (const [name, s2] of playerPoints) {
			const existing = findExistingRow(rows, name);
			if (existing) {
				existing.s2 = s2;
				// Prefer roster/canonical longer name when sheet name is shorter
				if (name.length > existing.name.length) existing.name = name;
			} else {
				rows.push({
					place: 0,
					name,
					s1: 0,
					s2,
					wins: 0,
					attendance: 0,
					status: 'chase',
					city: '',
				});
			}
		}

		rows.sort((a, b) => {
			const ta = a.s1 + a.s2;
			const tb = b.s1 + b.s2;
			if (tb !== ta) return tb - ta;
			return a.name.localeCompare(b.name);
		});
		rows.forEach((row, i) => {
			row.place = i + 1;
			row.attendance = (row.s1 > 0 ? 1 : 0) + (row.s2 > 0 ? 1 : 0);
			row.status = statusForRank(i + 1);
		});

		standings[category][divisionId] = rows;
	}

	// Re-rank divisions that only have Ocala players (s2 all zero) — keep order by total
	for (const cat of Object.values(standings)) {
		for (const [divisionId, rows] of Object.entries(cat)) {
			if (s2ByDivision.has(divisionId)) continue;
			rows.sort((a, b) => {
				const ta = a.s1 + a.s2;
				const tb = b.s1 + b.s2;
				if (tb !== ta) return tb - ta;
				return a.name.localeCompare(b.name);
			});
			rows.forEach((row, i) => {
				row.place = i + 1;
				row.attendance = (row.s1 > 0 ? 1 : 0) + (row.s2 > 0 ? 1 : 0);
				row.status = statusForRank(i + 1);
			});
		}
	}

	const events = [
		{ id: 'event-1', label: 'Event #1 (Ocala)', stopKey: 's1' },
		{ id: 'event-2', label: 'Event #2 (Sarasota)', stopKey: 's2' },
	];

	return {
		...payload,
		lastUpdated: new Date().toISOString(),
		events,
		standings,
	};
}

function main() {
	console.log('Computing Sarasota (s2) GP points…');
	const s2 = computeSarasotaS2();
	const payload = JSON.parse(readFileSync(GP_PATH, 'utf8')) as GpPayload;
	const merged = mergeIntoPayload(payload, s2);
	writeFileSync(GP_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
	console.log(`\nWrote ${GP_PATH}`);
}

main();
