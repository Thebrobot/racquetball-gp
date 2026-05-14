/** Standings categories and row shape: single source for Astro pages and client script. */

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

export const lbData: LbData = {
	singles: { ...emptySingles },
	doubles: { ...emptyDoubles },
	mixed: { ...emptyMixed },
};

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

/** Sorted by total points descending. Empty divisions use a single placeholder row when `usePlaceholder` is true. */
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
	rows.sort((a, b) => leaderboardTotal(b) - leaderboardTotal(a));
	return rows;
}

export function getTopN(category: LbCategory, division: string, n: number, usePlaceholder = true): LbRow[] {
	return getSortedRows(category, division, usePlaceholder).slice(0, n);
}

/** Top finisher for overview cards; `null` when there is no real data for that bracket yet. */
export function getDivisionLeader(category: LbCategory, division: string): LbRow | null {
	const rows = getSortedRows(category, division, false);
	return rows.length ? rows[0] : null;
}

/** Homepage: three headline divisions (singles open + elite, mixed). */
export const HOME_SPOTLIGHT_TRACKS = [
	{ category: 'singles' as const, division: 'mens-singles-open', label: 'Singles · Open' },
	{ category: 'singles' as const, division: 'mens-singles-elite', label: 'Singles · Elite' },
	{ category: 'mixed' as const, division: 'mixed-doubles', label: 'Mixed Doubles · Open/A' },
] as const;
