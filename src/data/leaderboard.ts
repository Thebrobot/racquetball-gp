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
		'open-men': [
			{
				name: 'Carlos Mendez',
				city: 'Miami, FL',
				s1: 100,
				s2: 75,
				wins: 6,
				place: 1,
				attendance: 2,
				status: 'q',
				image: '/images/spotlight/leader-open-men-placeholder.webp',
			},
			{ name: 'Tyler Brooks', city: 'Orlando, FL', s1: 75, s2: 100, wins: 5, place: 2, attendance: 2, status: 'q' },
			{ name: 'Darnell West', city: 'Tampa, FL', s1: 50, s2: 0, wins: 3, place: 6, attendance: 1, status: 'pace' },
			{ name: 'Marcus Liu', city: 'Jacksonville, FL', s1: 25, s2: 50, wins: 3, place: 5, attendance: 2, status: 'pace' },
			{ name: 'Andre Simmons', city: 'Gainesville, FL', s1: 10, s2: 25, wins: 2, place: 9, attendance: 2, status: 'chase' },
			{ name: 'Kevin Torres', city: 'Tallahassee, FL', s1: 0, s2: 10, wins: 1, place: 12, attendance: 1, status: 'chase' },
			{ name: 'Brian Holloway', city: 'St. Pete, FL', s1: 10, s2: 0, wins: 1, place: 14, attendance: 1, status: 'chase' },
			{ name: 'James Whitfield', city: 'Ocala, FL', s1: 0, s2: 10, wins: 1, place: 13, attendance: 1, status: 'chase' },
			{ name: 'Evan Cole', city: 'Naples, FL', s1: 35, s2: 15, wins: 3, place: 7, attendance: 2, status: 'pace' },
			{ name: 'Javier Ortiz', city: 'Hialeah, FL', s1: 20, s2: 10, wins: 2, place: 10, attendance: 2, status: 'chase' },
			{ name: 'Blake Harper', city: 'Sarasota, FL', s1: 25, s2: 20, wins: 2, place: 8, attendance: 2, status: 'pace' },
			{ name: 'Quentin Ross', city: 'Orlando, FL', s1: 15, s2: 10, wins: 2, place: 11, attendance: 2, status: 'chase' },
			{ name: 'Malik Pierce', city: 'Tampa, FL', s1: 5, s2: 15, wins: 1, place: 16, attendance: 2, status: 'chase' },
			{ name: 'Noah Patel', city: 'Gainesville, FL', s1: 20, s2: 0, wins: 2, place: 15, attendance: 1, status: 'chase' },
			{ name: 'Diego Alvarez', city: 'Miami, FL', s1: 12, s2: 8, wins: 1, place: 17, attendance: 2, status: 'chase' },
			{ name: 'Isaiah Grant', city: 'Jacksonville, FL', s1: 8, s2: 6, wins: 1, place: 18, attendance: 2, status: 'chase' },
			{ name: 'Cole Hernandez', city: 'Tallahassee, FL', s1: 18, s2: 4, wins: 2, place: 12, attendance: 2, status: 'chase' },
			{ name: 'Parker Miles', city: 'St. Pete, FL', s1: 6, s2: 3, wins: 1, place: 19, attendance: 2, status: 'chase' },
			{ name: 'Gavin Lowe', city: 'Ocala, FL', s1: 10, s2: 5, wins: 1, place: 20, attendance: 2, status: 'chase' },
		],
		'open-women': [
			{
				name: 'Sofia Reyes',
				city: 'Miami, FL',
				s1: 100,
				s2: 100,
				wins: 6,
				place: 1,
				attendance: 2,
				status: 'q',
				tagline: 'Undefeated through two stops, setting the pace in Open Women.',
				image: '/images/spotlight/leader-open-women-placeholder.webp',
			},
			{ name: 'Dana Park', city: 'Tampa, FL', s1: 75, s2: 50, wins: 5, place: 2, attendance: 2, status: 'q' },
			{ name: 'Leila Johnson', city: 'Orlando, FL', s1: 25, s2: 75, wins: 4, place: 3, attendance: 2, status: 'pace' },
			{ name: 'Maria Vega', city: 'Boca Raton, FL', s1: 50, s2: 25, wins: 4, place: 4, attendance: 2, status: 'pace' },
			{ name: 'Tamara Ellis', city: 'Fort Lauderdale, FL', s1: 10, s2: 10, wins: 2, place: 8, attendance: 2, status: 'chase' },
			{ name: 'Brianna Collins', city: 'Sarasota, FL', s1: 20, s2: 15, wins: 3, place: 5, attendance: 2, status: 'pace' },
			{ name: 'Zoe Ramirez', city: 'Miami, FL', s1: 18, s2: 12, wins: 2, place: 6, attendance: 2, status: 'chase' },
			{ name: 'Hailey Chen', city: 'Orlando, FL', s1: 12, s2: 8, wins: 2, place: 9, attendance: 2, status: 'chase' },
			{ name: 'Erica Patel', city: 'Tampa, FL', s1: 15, s2: 6, wins: 2, place: 10, attendance: 2, status: 'chase' },
			{ name: 'Natalie Brooks', city: 'Ocala, FL', s1: 8, s2: 5, wins: 1, place: 11, attendance: 2, status: 'chase' },
			{ name: 'Paige Monroe', city: 'Gainesville, FL', s1: 10, s2: 4, wins: 1, place: 12, attendance: 2, status: 'chase' },
			{ name: 'Savannah Ortiz', city: 'Jacksonville, FL', s1: 5, s2: 6, wins: 1, place: 13, attendance: 2, status: 'chase' },
			{ name: 'Kara Whitman', city: 'St. Pete, FL', s1: 6, s2: 3, wins: 1, place: 14, attendance: 2, status: 'chase' },
		],
		'a-men': [
			{ name: 'Rob Castillo', city: 'Tampa, FL', s1: 100, s2: 50, wins: 5, place: 1, attendance: 2, status: 'q' },
			{ name: 'Sam Wheeler', city: 'Miami, FL', s1: 50, s2: 75, wins: 4, place: 2, attendance: 2, status: 'q' },
			{ name: 'Jaylen Ford', city: 'Orlando, FL', s1: 75, s2: 10, wins: 3, place: 3, attendance: 2, status: 'pace' },
			{ name: 'Pete Nakamura', city: 'Sarasota, FL', s1: 25, s2: 25, wins: 2, place: 5, attendance: 2, status: 'chase' },
			{ name: 'Mason Reed', city: 'Ocala, FL', s1: 30, s2: 15, wins: 3, place: 4, attendance: 2, status: 'pace' },
			{ name: 'Victor Salas', city: 'Miami, FL', s1: 18, s2: 12, wins: 2, place: 6, attendance: 2, status: 'chase' },
			{ name: 'Chris Dalton', city: 'Gainesville, FL', s1: 15, s2: 8, wins: 2, place: 7, attendance: 2, status: 'chase' },
			{ name: 'Landon Price', city: 'Jacksonville, FL', s1: 10, s2: 6, wins: 1, place: 8, attendance: 2, status: 'chase' },
		],
		'a-women': [
			{ name: 'Carmen Ruiz', city: 'Miami, FL', s1: 90, s2: 50, wins: 5, place: 1, attendance: 2, status: 'q' },
			{ name: 'Alyssa Grant', city: 'Orlando, FL', s1: 65, s2: 55, wins: 4, place: 2, attendance: 2, status: 'q' },
			{ name: 'Maya Chen', city: 'Tampa, FL', s1: 50, s2: 35, wins: 3, place: 3, attendance: 2, status: 'pace' },
			{ name: 'Jordan Lee', city: 'Jacksonville, FL', s1: 40, s2: 30, wins: 3, place: 4, attendance: 2, status: 'pace' },
			{ name: 'Rachel Pierce', city: 'Ocala, FL', s1: 20, s2: 15, wins: 2, place: 6, attendance: 2, status: 'chase' },
			{ name: 'Lena Foster', city: 'Sarasota, FL', s1: 22, s2: 10, wins: 2, place: 5, attendance: 2, status: 'chase' },
			{ name: 'Tessa Martin', city: 'Gainesville, FL', s1: 12, s2: 8, wins: 1, place: 7, attendance: 2, status: 'chase' },
			{ name: 'Sierra Owens', city: 'St. Pete, FL', s1: 10, s2: 6, wins: 1, place: 8, attendance: 2, status: 'chase' },
		],
		'b-men': [
			{ name: 'Caleb Ortiz', city: 'Tallahassee, FL', s1: 60, s2: 30, wins: 4, place: 1, attendance: 2, status: 'pace' },
			{ name: 'Brandon Hayes', city: 'Orlando, FL', s1: 45, s2: 25, wins: 3, place: 2, attendance: 2, status: 'pace' },
			{ name: 'Logan Price', city: 'Miami, FL', s1: 30, s2: 20, wins: 2, place: 3, attendance: 2, status: 'chase' },
			{ name: 'Damian Flores', city: 'Tampa, FL', s1: 22, s2: 18, wins: 2, place: 4, attendance: 2, status: 'chase' },
			{ name: 'Oscar Banks', city: 'Ocala, FL', s1: 18, s2: 10, wins: 1, place: 5, attendance: 2, status: 'chase' },
			{ name: 'Trevor Knox', city: 'Gainesville, FL', s1: 10, s2: 8, wins: 1, place: 6, attendance: 2, status: 'chase' },
		],
		'b-women': [
			{ name: 'Keira Woods', city: 'Orlando, FL', s1: 55, s2: 25, wins: 4, place: 1, attendance: 2, status: 'pace' },
			{ name: 'Jade Porter', city: 'Tampa, FL', s1: 40, s2: 20, wins: 3, place: 2, attendance: 2, status: 'pace' },
			{ name: 'Morgan Shaw', city: 'Miami, FL', s1: 25, s2: 15, wins: 2, place: 3, attendance: 2, status: 'chase' },
			{ name: 'Elena Cross', city: 'Ocala, FL', s1: 15, s2: 8, wins: 1, place: 4, attendance: 2, status: 'chase' },
		],
		senior: [
			{ name: 'Gary Holt', city: 'Sarasota, FL', s1: 70, s2: 40, wins: 4, place: 1, attendance: 2, status: 'pace' },
			{ name: 'Victor Grant', city: 'Jacksonville, FL', s1: 50, s2: 25, wins: 3, place: 2, attendance: 2, status: 'pace' },
			{ name: 'Howard Mills', city: 'Tampa, FL', s1: 30, s2: 20, wins: 2, place: 3, attendance: 2, status: 'chase' },
			{ name: 'Raymond Cook', city: 'Ocala, FL', s1: 20, s2: 10, wins: 1, place: 4, attendance: 2, status: 'chase' },
		],
	},
	doubles: {
		'open-men': [
			{
				name: 'Mendez / Brooks',
				city: 'Miami & Orlando',
				s1: 80,
				s2: 80,
				wins: 4,
				place: 1,
				attendance: 2,
				status: 'q',
				note: 'Same partner',
			},
			{
				name: 'West / Liu',
				city: 'Tampa & Jacksonville',
				s1: 40,
				s2: 60,
				wins: 3,
				place: 2,
				attendance: 2,
				status: 'q',
				note: 'Same partner',
			},
			{ name: 'Torres / Simmons', city: 'Tallahassee & Gainesville', s1: 65, s2: 0, wins: 2, place: 3, attendance: 1, status: 'pace' },
			{ name: 'Holloway / Whitfield', city: 'St. Pete & Ocala', s1: 0, s2: 65, wins: 2, place: 4, attendance: 1, status: 'pace' },
		],
	},
	mixed: {
		'open-men': [
			{
				name: 'Mendez / Reyes',
				city: 'Miami',
				s1: 80,
				s2: 80,
				wins: 4,
				place: 1,
				attendance: 2,
				status: 'q',
				note: 'Same pair',
				image: '/images/spotlight/leader-mixed-placeholder.webp',
			},
			{ name: 'Brooks / Park', city: 'Orlando & Tampa', s1: 65, s2: 40, wins: 3, place: 2, attendance: 2, status: 'pace' },
			{ name: 'West / Johnson', city: 'Tampa & Orlando', s1: 32, s2: 65, wins: 3, place: 3, attendance: 2, status: 'pace' },
		],
	},
};

export const PENDING_ROW: LbRow = {
	name: 'Data Pending',
	city: 'Results will appear after Stop 1',
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
