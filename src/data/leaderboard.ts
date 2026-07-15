/** Standings categories and row shape: single source for Astro pages and client script. */

import gpPoints from './gp-points.json';
import { getPlayerImageForDisplay } from './player-images';
import { countPlayerWinsInDivision } from './match-wins';

export type LbCategory = 'singles' | 'doubles' | 'mixed';
export type LbStatus = 'q' | 'pace' | 'chase';

/** Used to order divisions within a category in the overview UI. */
export type LbDivisionGroup =
	| 'open'
	| 'elite'
	| 'a'
	| 'b'
	| 'c'
	| 'senior'
	| 'centurion'
	| 'superCenturion';

export interface LbDivisionMeta {
	id: string;
	label: string;
	group: LbDivisionGroup;
}

const GROUP_ORDER: Record<LbDivisionGroup, number> = {
	open: 0,
	elite: 1,
	a: 2,
	b: 3,
	c: 4,
	senior: 5,
	centurion: 6,
	superCenturion: 7,
};

function sortDivisionMetas(entries: LbDivisionMeta[]): LbDivisionMeta[] {
	return [...entries].sort((x, y) => {
		const go = GROUP_ORDER[x.group] - GROUP_ORDER[y.group];
		if (go !== 0) return go;
		return x.label.localeCompare(y.label);
	});
}

/**
 * Declared divisions per category (labels + ordering).
 * Division `id` values align with `events.ts` `divisionDetails[].id` for Ocala.
 * Keys must exist on `lbData[category]` when that bracket has standings.
 */
export const LB_DIVISIONS_BY_CATEGORY: Record<LbCategory, LbDivisionMeta[]> = {
	singles: sortDivisionMetas([
		{ id: 'mens-singles-open', label: 'Open', group: 'open' },
		{ id: 'mens-singles-elite', label: 'Elite', group: 'elite' },
		{ id: 'mens-singles-a', label: 'A', group: 'a' },
		{ id: 'mens-singles-b', label: 'B', group: 'b' },
		{ id: 'mens-singles-c', label: 'C', group: 'c' },
		{ id: 'mens-age-3040', label: '30/40+', group: 'senior' },
		{ id: 'mens-age-50', label: '50+', group: 'senior' },
		{ id: 'mens-age-60', label: '60+', group: 'senior' },
		{ id: 'mens-age-70', label: '70+', group: 'senior' },
	]),
	doubles: sortDivisionMetas([
		{ id: 'mens-doubles-open', label: 'Open', group: 'open' },
		{ id: 'mens-doubles-elite', label: 'Elite', group: 'elite' },
		{ id: 'mens-doubles-a', label: 'A', group: 'a' },
		{ id: 'mens-doubles-b', label: 'B', group: 'b' },
		{ id: 'mens-doubles-centurion', label: 'Centurion+ Open', group: 'centurion' },
		{ id: 'mens-doubles-super-centurion', label: 'Super Centurion (120+)', group: 'superCenturion' },
	]),
	mixed: sortDivisionMetas([{ id: 'mixed-doubles', label: 'Open / A', group: 'open' }]),
};

export const LB_OVERVIEW_CATEGORY_ORDER: LbCategory[] = ['singles', 'doubles', 'mixed'];

export const LB_CATEGORY_HEADING: Record<LbCategory, string> = {
	singles: 'Singles',
	doubles: 'Doubles',
	mixed: 'Mixed doubles',
};

export function isValidLbCategory(s: string): s is LbCategory {
	return s === 'singles' || s === 'doubles' || s === 'mixed';
}

export function isDivisionInCategory(category: LbCategory, divisionId: string): boolean {
	return LB_DIVISIONS_BY_CATEGORY[category].some((d) => d.id === divisionId);
}

export const DEFAULT_LEADERBOARD_CATEGORY: LbCategory = 'singles';
export const DEFAULT_LEADERBOARD_DIVISION = 'mens-singles-open';

/** Resolve category tab from a division id (ids are unique site-wide). */
export function getCategoryForDivision(divisionId: string): LbCategory | null {
	for (const [category, list] of Object.entries(LB_DIVISIONS_BY_CATEGORY) as [LbCategory, LbDivisionMeta[]][]) {
		if (list.some((d) => d.id === divisionId)) return category;
	}
	return null;
}

export function isValidDivisionId(divisionId: string): boolean {
	return getCategoryForDivision(divisionId) !== null;
}

/** Path-based deep link, e.g. `/leaderboard/mixed-doubles`. */
export function leaderboardDivisionHref(divisionId: string): string {
	return `/leaderboard/${divisionId}`;
}

export function getDivisionDisplayMeta(divisionId: string): { category: LbCategory; divisionLabel: string } | null {
	const category = getCategoryForDivision(divisionId);
	if (!category) return null;
	const meta = LB_DIVISIONS_BY_CATEGORY[category].find((d) => d.id === divisionId);
	if (!meta) return null;
	return { category, divisionLabel: meta.label };
}

export interface LbRow {
	name: string;
	city: string;
	s1: number;
	s2: number;
	wins: number;
	place: number;
	attendance: number;
	status: LbStatus;
	note?: string;
	/** Optional headshot URL for spotlight UI */
	image?: string;
	/** Optional one-line bio for spotlight */
	tagline?: string;
}

export type LbData = Record<LbCategory, Record<string, LbRow[]>>;

const emptySingles = {
	'mens-singles-open': [],
	'mens-singles-elite': [],
	'mens-singles-a': [],
	'mens-singles-b': [],
	'mens-singles-c': [],
	'mens-age-3040': [],
	'mens-age-50': [],
	'mens-age-60': [],
	'mens-age-70': [],
} as const;

const emptyDoubles = {
	'mens-doubles-open': [],
	'mens-doubles-elite': [],
	'mens-doubles-a': [],
	'mens-doubles-b': [],
	'mens-doubles-centurion': [],
	'mens-doubles-super-centurion': [],
} as const;

const emptyMixed = {
	'mixed-doubles': [],
} as const;

function enrichRow(row: LbRow, divisionId: string): LbRow {
	const wins = countPlayerWinsInDivision(row.name, divisionId);
	const image = getPlayerImageForDisplay(row.name, 128);
	return image ? { ...row, wins, image } : { ...row, wins };
}

/** Points first; when tied, more match wins in the division, then better Lap 2, then Lap 1. */
export function compareLeaderboardRows(a: LbRow, b: LbRow): number {
	const byPts = leaderboardTotal(b) - leaderboardTotal(a);
	if (byPts !== 0) return byPts;
	const byWins = (b.wins ?? 0) - (a.wins ?? 0);
	if (byWins !== 0) return byWins;
	if (b.s2 !== a.s2) return b.s2 - a.s2;
	if (b.s1 !== a.s1) return b.s1 - a.s1;
	return a.name.localeCompare(b.name);
}

/** Competition place from an already-sorted list (ties share place when compare === 0). */
export function assignLeaderboardPlaces(rows: LbRow[]): LbRow[] {
	let place = 1;
	return rows.map((row, i) => {
		if (i > 0 && compareLeaderboardRows(rows[i - 1]!, row) !== 0) {
			place = i + 1;
		} else if (i === 0) {
			place = 1;
		}
		return { ...row, place };
	});
}

function enrichDivisionRows(rows: LbRow[], divisionId: string): LbRow[] {
	const enriched = rows.map((row) => enrichRow(row, divisionId));
	enriched.sort(compareLeaderboardRows);
	const ranked = assignLeaderboardPlaces(enriched);
	const max = Math.max(...ranked.map((r) => leaderboardTotal(r)), 0);
	if (max <= 0) return ranked;
	return ranked.map((r) => ({
		...r,
		status: leaderboardTotal(r) === max ? 'q' : r.status,
	}));
}

function buildLbData(): LbData {
	const synced = gpPoints.standings as LbData;
	const enrichCategory = (cat: Record<string, LbRow[]>) =>
		Object.fromEntries(Object.entries(cat).map(([id, rows]) => [id, enrichDivisionRows(rows, id)]));

	return {
		singles: { ...emptySingles, ...enrichCategory(synced.singles ?? {}) },
		doubles: { ...emptyDoubles, ...enrichCategory(synced.doubles ?? {}) },
		mixed: { ...emptyMixed, ...enrichCategory(synced.mixed ?? {}) },
	};
}

export const lbData: LbData = buildLbData();

export const PENDING_ROW: LbRow = {
	name: 'Data Pending',
	city: 'Results will appear after Lap 1',
	s1: 0,
	s2: 0,
	wins: 0,
	place: 0,
	attendance: 0,
	status: 'chase',
};

export function leaderboardTotal(r: LbRow): number {
	return r.s1 + r.s2;
}

export function isPendingPlaceholder(r: LbRow): boolean {
	return r.name === 'Data Pending';
}

/** Two-letter initials for avatar fallback (handles "A / B" pair names). */
export function formatPlayerInitials(name: string): string {
	if (name.includes('/')) {
		const sides = name.split('/').map((x) => x.trim());
		if (sides.length >= 2 && sides[0][0] && sides[sides.length - 1][0]) {
			return (sides[0][0] + sides[sides.length - 1][0]).toUpperCase();
		}
	}
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2 && parts[0][0] && parts[parts.length - 1][0]) {
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

/** Sorted by division points, then wins (not alphabetical). Empty divisions use a placeholder when requested. */
export function getSortedRows(
	category: LbCategory,
	division: string,
	usePlaceholder: boolean,
): LbRow[] {
	const catData = lbData[category];
	let rows = catData?.[division] ? [...catData[division]] : [];
	if (!rows.length && usePlaceholder) {
		rows = [PENDING_ROW];
	}
	rows.sort(compareLeaderboardRows);
	return rows;
}

export function getTopN(category: LbCategory, division: string, n: number, usePlaceholder = true): LbRow[] {
	return getSortedRows(category, division, usePlaceholder).slice(0, n);
}

/** All players tied for the division lead (same season point total). */
export function getDivisionLeaders(category: LbCategory, division: string): LbRow[] {
	const rows = getSortedRows(category, division, false);
	if (!rows.length) return [];
	const top = leaderboardTotal(rows[0]);
	return rows.filter((r) => leaderboardTotal(r) === top);
}

/** Top finisher for overview cards; `null` when there is no real data for that bracket yet. */
export function getDivisionLeader(category: LbCategory, division: string): LbRow | null {
	const rows = getDivisionLeaders(category, division);
	return rows.length ? rows[0] : null;
}

/** Homepage: three headline divisions (singles open + elite, mixed). */
export const HOME_SPOTLIGHT_TRACKS = [
	{ category: 'singles' as const, division: 'mens-singles-open', label: 'Singles · Open' },
	{ category: 'singles' as const, division: 'mens-singles-elite', label: 'Singles · Elite' },
	{ category: 'mixed' as const, division: 'mixed-doubles', label: 'Mixed Doubles · Open/A' },
] as const;
