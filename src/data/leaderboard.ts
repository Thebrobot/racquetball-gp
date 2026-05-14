/** Standings categories and row shape: single source for Astro pages and client script. */

export type LbCategory = 'singles' | 'doubles' | 'mixed';
export type LbStatus = 'q' | 'pace' | 'chase';

/** Used to order divisions within a category in the overview UI. */
export type LbDivisionGroup = 'open' | 'a' | 'b' | 'senior';

export interface LbDivisionMeta {
	id: string;
	label: string;
	group: LbDivisionGroup;
}

const GROUP_ORDER: Record<LbDivisionGroup, number> = {
	open: 0,
	a: 1,
	b: 2,
	senior: 3,
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
 * Keys must match `lbData[category]` when that bracket has standings.
 */
export const LB_DIVISIONS_BY_CATEGORY: Record<LbCategory, LbDivisionMeta[]> = {
	singles: sortDivisionMetas([
		{ id: 'open-men', label: 'Open Men', group: 'open' },
		{ id: 'open-women', label: 'Open Women', group: 'open' },
		{ id: 'a-men', label: 'A Men', group: 'a' },
		{ id: 'a-women', label: 'A Women', group: 'a' },
		{ id: 'b-men', label: 'B Men', group: 'b' },
		{ id: 'b-women', label: 'B Women', group: 'b' },
		{ id: 'senior', label: 'Senior 40+', group: 'senior' },
	]),
	doubles: sortDivisionMetas([
		{ id: 'open-men', label: 'Open Men', group: 'open' },
		{ id: 'open-women', label: 'Open Women', group: 'open' },
	]),
	mixed: sortDivisionMetas([{ id: 'open-men', label: 'Open', group: 'open' }]),
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

export const lbData: LbData = {
	singles: {
		'open-men': [],
		'open-women': [],
		'a-men': [],
		'a-women': [],
		'b-men': [],
		'b-women': [],
		senior: [],
	},
	doubles: {
		'open-men': [],
		'open-women': [],
	},
	mixed: {
		'open-men': [],
	},
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

/** Homepage: three headline divisions (Singles Open M/W, Mixed Open). */
export const HOME_SPOTLIGHT_TRACKS = [
	{ category: 'singles' as const, division: 'open-men', label: 'Singles · Open Men' },
	{ category: 'singles' as const, division: 'open-women', label: 'Singles · Open Women' },
	{ category: 'mixed' as const, division: 'open-men', label: 'Mixed Doubles · Open' },
] as const;
