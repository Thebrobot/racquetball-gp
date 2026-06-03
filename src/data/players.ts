import { LB_CATEGORY_HEADING, LB_DIVISIONS_BY_CATEGORY, LB_OVERVIEW_CATEGORY_ORDER, lbData, leaderboardTotal, type LbCategory, type LbRow } from './leaderboard';
import { EVENTS } from './events';
import type { EventBracketMatch, EventBracketRound } from './events';
import { getPlayerImageForDisplay } from './player-images';
export {
	PLAYER_IMAGES,
	getPlayerImageForDisplay,
	getPlayerImageSrcSet,
	resolvePlayerImage,
} from './player-images';

export interface PlayerEventCall {
	eventName: string;
	division: string;
	time: string;
	note?: string;
}

export interface PlayerScheduleEntry extends PlayerEventCall {
	/** Singles elim: the opponent name (team string for doubles, individual name for singles) */
	opponent?: string;
	/** Singles elim individual: profile slug. Undefined for team opponents (name contains "/"). */
	opponentSlug?: string;
	/** Round robin: all other pool members */
	opponents?: string[];
	/** Round robin: profile slug per pool member (empty string if a team entry) */
	opponentSlugs?: string[];
	/** True when this is a round-robin pool display (no per-match data) */
	isRoundRobin?: boolean;
	/** Round label for per-match RR entries, e.g. "Round 2" */
	round?: string;
	/** Slug of the event (for bracket deep-link) */
	eventSlug?: string;
	/** Division detail ID (for bracket deep-link) */
	divisionId?: string;
}

/**
 * Returns true if playerName matches entryName.
 * Handles exact-name singles ("Trace Gunsch") and last-name doubles teams ("Gunsch / Smith").
 */
function playerMatchesEntry(playerName: string, entryName: string): boolean {
	const norm = playerName.trim().toLowerCase();
	const entryNorm = entryName.trim().toLowerCase();
	if (entryNorm === norm) return true;
	// Only doubles teams (stored as "LastA / LastB") use last-name matching.
	// Singles entries must match exactly so same-surname players aren't conflated.
	if (!entryNorm.includes('/')) return false;
	// Use endsWith to handle compound last names like "Van Zant-Russell".
	const lastName = norm.split(' ').pop() ?? '';
	if (lastName.length > 1) {
		const parts = entryNorm.split(/\s*\/\s*/);
		if (parts.some((p) => p.trim() === lastName || p.trim().endsWith(lastName))) return true;
	}
	return false;
}

function isGhostName(name: string): boolean {
	const u = name.trim().toUpperCase();
	return u === 'BYE' || u === 'TBD' || u === '';
}

/** Enriches a player's event list with opponent and bracket-link data from live bracket.
 *  Round-robin divisions with per-match data expand into one entry per match.
 */
export function getPlayerScheduleEntries(
	playerName: string,
	profileEvents: PlayerEventCall[],
): PlayerScheduleEntry[] {
	const out: PlayerScheduleEntry[] = [];

	for (const entry of profileEvents) {
		const event = EVENTS.find((e) => e.name === entry.eventName);
		if (!event) { out.push(entry); continue; }

		const div = event.divisionDetails.find((d) => d.label === entry.division);
		const base: PlayerScheduleEntry = {
			...entry,
			eventSlug: event.slug,
			divisionId: div?.id,
		};

		// ── Round robin WITH per-match schedule → one ticket per match ──────────
		if (div?.format === 'roundrobin' && div.roundRobinMatches?.length) {
			const myMatches = div.roundRobinMatches.filter(
				(m) => playerMatchesEntry(playerName, m.team1) || playerMatchesEntry(playerName, m.team2),
			);
			for (const m of myMatches) {
				const oppTeam = playerMatchesEntry(playerName, m.team1) ? m.team2 : m.team1;
				out.push({
					...base,
					time: m.scheduledTime,
					note: m.court,
					round: m.round,
					opponent: oppTeam,
					opponentSlug: oppTeam.includes('/') ? undefined : getPlayerSlug(oppTeam),
				});
			}
			continue;
		}

		// ── Round robin WITHOUT match schedule → pool display (fallback) ────────
		if (div?.format === 'roundrobin') {
			const others = (div.roundRobinPlayers ?? []).filter(
				(p) => !playerMatchesEntry(playerName, p),
			);
			out.push({
				...base,
				isRoundRobin: true,
				opponents: others,
				opponentSlugs: others.map((p) => (p.includes('/') ? '' : getPlayerSlug(p))),
			});
			continue;
		}

		// ── Single elimination: attach opponent + times from bracket data ───────
		// Prefer a match whose scheduledTime matches the profile row; otherwise
		// the first match in draw order with a real opponent (skips early BYEs).
		if (div?.rounds) {
			const cands: { round: EventBracketRound; match: EventBracketMatch; side: 1 | 2 }[] = [];
			for (const round of div.rounds) {
				for (const match of round.matches) {
					const p1 = (match.player1 ?? '').trim();
					const p2 = (match.player2 ?? '').trim();
					const side = playerMatchesEntry(playerName, p1) ? 1 : playerMatchesEntry(playerName, p2) ? 2 : null;
					if (side === null) continue;
					cands.push({ round, match, side });
				}
			}

			let pick = cands.find((c) => c.match.scheduledTime && c.match.scheduledTime === entry.time);
			if (!pick) {
				pick = cands.find((c) => {
					const rawOpp = (c.side === 1 ? c.match.player2 : c.match.player1)?.trim() ?? '';
					return !isGhostName(rawOpp);
				});
			}
			if (!pick && cands.length) pick = cands[0];

			if (pick) {
				const rawOpp = (pick.side === 1 ? pick.match.player2 : pick.match.player1)?.trim() ?? '';
				if (!isGhostName(rawOpp)) {
					base.opponent = rawOpp;
					if (!rawOpp.includes('/')) base.opponentSlug = getPlayerSlug(rawOpp);
				}
				if (pick.match.scheduledTime) base.time = pick.match.scheduledTime;
				if (pick.match.court) base.note = pick.match.court;
			}
		}
		out.push(base);
	}

	return out;
}

export interface PlayerProfile {
	name: string;
	slug: string;
	city?: string;
	imageUrl?: string;
	bio?: string;
	divisions: string[];
	events: PlayerEventCall[];
}

export function getPlayerSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '');
}

function isIndividual(name: string): boolean {
	return !name.includes('/');
}

/** Canonical labels like "Singles · A" — one per division id. */
const DIVISION_DISPLAY_LABELS = Object.fromEntries(
	Object.entries(LB_DIVISIONS_BY_CATEGORY).flatMap(([category, list]) =>
		list.map((div) => [`${category}:${div.id}`, `${LB_CATEGORY_HEADING[category as LbCategory]} · ${div.label}`]),
	),
) as Record<string, string>;

/** Map event bracket labels ("Men's Singles: A") → canonical display labels. */
const EVENT_DIVISION_DISPLAY = new Map<string, string>();
for (const event of EVENTS) {
	for (const div of event.divisionDetails ?? []) {
		for (const [category, list] of Object.entries(LB_DIVISIONS_BY_CATEGORY)) {
			const meta = list.find((d) => d.id === div.id);
			if (meta) {
				EVENT_DIVISION_DISPLAY.set(div.label, `${LB_CATEGORY_HEADING[category as LbCategory]} · ${meta.label}`);
				break;
			}
		}
	}
}

function canonicalDivisionLabel(label: string): string {
	return EVENT_DIVISION_DISPLAY.get(label) ?? label;
}

const DIVISION_LABEL_SORT_ORDER = new Map<string, number>(
	Object.entries(LB_DIVISIONS_BY_CATEGORY).flatMap(([category, list]) => {
		const catIndex = LB_OVERVIEW_CATEGORY_ORDER.indexOf(category as LbCategory);
		return list.map((div, divIndex) => [
			`${LB_CATEGORY_HEADING[category as LbCategory]} · ${div.label}`,
			catIndex * 100 + divIndex,
		] as [string, number]);
	}),
);

function sortDivisionLabels(labels: string[]): string[] {
	return [...labels].sort(
		(a, b) => (DIVISION_LABEL_SORT_ORDER.get(a) ?? 999) - (DIVISION_LABEL_SORT_ORDER.get(b) ?? 999),
	);
}

function addPlayerDivision(divisions: string[], label: string): void {
	const canon = canonicalDivisionLabel(label);
	if (!divisions.includes(canon)) divisions.push(canon);
}

export function getAllPlayers(): PlayerProfile[] {
	const map = new Map<string, PlayerProfile>();

	Object.entries(lbData).forEach(([category, divisions]) => {
		Object.entries(divisions).forEach(([divisionId, rows]) => {
			const label = DIVISION_DISPLAY_LABELS[`${category}:${divisionId}`] ?? divisionId;
			rows.forEach((row) => {
				if (!isIndividual(row.name)) return;
				const slug = getPlayerSlug(row.name);
			const existing = map.get(slug) ?? {
				name: row.name,
				slug,
				city: row.city,
				imageUrl: getPlayerImageForDisplay(row.name, 64) ?? row.image,
				bio: row.tagline,
				divisions: [],
				events: [],
			};
				if (!existing.bio && row.tagline) {
					existing.bio = row.tagline;
				}
				addPlayerDivision(existing.divisions, label);
				if (!existing.city && row.city) {
					existing.city = row.city;
				}
				map.set(slug, existing);
			});
		});
	});

	EVENTS.forEach((event) => {
		event.profiles?.forEach((profile) => {
			if (!isIndividual(profile.name)) return;
			const slug = getPlayerSlug(profile.name);
			const existing = map.get(slug) ?? {
				name: profile.name,
				slug,
				imageUrl: getPlayerImageForDisplay(profile.name, 64),
				divisions: [],
				events: [],
			};
			// Apply image from lookup if not already set
			if (!existing.imageUrl) {
				const img = getPlayerImageForDisplay(profile.name, 64);
				if (img) existing.imageUrl = img;
			}
			const eventEntry: PlayerEventCall = {
				eventName: event.name,
				division: profile.division,
				time: profile.time,
				note: profile.note,
			};
			existing.events.push(eventEntry);
			addPlayerDivision(existing.divisions, profile.division);
			map.set(slug, existing);
		});
	});

	return Array.from(map.values())
		.map((player) => ({ ...player, divisions: sortDivisionLabels(player.divisions) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export interface PlayerMatchRecord {
	eventSlug: string;
	eventName: string;
	divisionId: string;
	divisionLabel: string;
	roundLabel: string;
	opponent: string;
	score?: string;
	/** Bye advances are not match wins and are excluded from W–L on profiles. */
	result: 'win' | 'loss' | 'pending' | 'bye' | 'walkover';
}

function isGhostOpponent(name: string): boolean {
	const u = name.trim().toUpperCase();
	return u === 'BYE' || u === 'TBD' || u === '';
}

function resultForSide(
	side: 1 | 2,
	winner: 1 | 2 | undefined,
	opponent: string,
): PlayerMatchRecord['result'] {
	if (winner !== 1 && winner !== 2) return 'pending';
	const oppGhost = isGhostOpponent(opponent);
	if (winner === side) {
		// A win by forfeit / no-show (WBF) still advances the player: counts as a win.
		return oppGhost ? 'bye' : 'win';
	}
	if (oppGhost) return 'pending';
	// The no-show player takes the loss.
	return 'loss';
}

/** Matches from published event brackets (singles elim + round robin). */
export function getPlayerMatchHistory(playerName: string): PlayerMatchRecord[] {
	const out: PlayerMatchRecord[] = [];
	for (const event of EVENTS) {
		for (const div of event.divisionDetails ?? []) {
			for (const round of div.rounds ?? []) {
				for (const m of round.matches ?? []) {
					const p1 = (m.player1 ?? '').trim();
					const p2 = (m.player2 ?? '').trim();
					const side = playerMatchesEntry(playerName, p1) ? 1 : playerMatchesEntry(playerName, p2) ? 2 : null;
					if (side === null) continue;
					const opp = side === 1 ? p2 : p1;
					out.push({
						eventSlug: event.slug,
						eventName: event.name,
						divisionId: div.id,
						divisionLabel: div.label,
						roundLabel: round.label,
						opponent: opp || 'TBD',
						score: m.score,
						result: resultForSide(side, m.winner, opp),
					});
				}
			}

			for (const m of div.roundRobinMatches ?? []) {
				const side = playerMatchesEntry(playerName, m.team1) ? 1 : playerMatchesEntry(playerName, m.team2) ? 2 : null;
				if (side === null) continue;
				const opp = side === 1 ? m.team2 : m.team1;
				out.push({
					eventSlug: event.slug,
					eventName: event.name,
					divisionId: div.id,
					divisionLabel: div.label,
					roundLabel: m.round,
					opponent: opp || 'TBD',
					score: m.score,
					result: resultForSide(side, m.winner, opp),
				});
			}
		}
	}
	return out;
}

export interface PlayerGrandPrixStanding {
	category: LbCategory;
	divisionId: string;
	divisionLabel: string;
	place: number;
	s1: number;
	s2: number;
	total: number;
}

/** Season GP points per division for this player (from synced sheet standings). */
export function getPlayerGrandPrixStandings(playerName: string): PlayerGrandPrixStanding[] {
	const out: PlayerGrandPrixStanding[] = [];

	for (const [category, divisions] of Object.entries(lbData) as [LbCategory, Record<string, LbRow[]>][]) {
		const catHeading = LB_CATEGORY_HEADING[category];
		for (const [divisionId, rows] of Object.entries(divisions)) {
			const meta = LB_DIVISIONS_BY_CATEGORY[category].find((d) => d.id === divisionId);
			const divisionLabel = meta ? `${catHeading} · ${meta.label}` : divisionId;
			for (const row of rows) {
				if (!playerMatchesEntry(playerName, row.name)) continue;
				out.push({
					category,
					divisionId,
					divisionLabel,
					place: row.place,
					s1: row.s1,
					s2: row.s2,
					total: leaderboardTotal(row),
				});
			}
		}
	}

	return out.sort((a, b) => b.total - a.total || a.divisionLabel.localeCompare(b.divisionLabel));
}

export interface SeriesPost {
	title: string;
	date: string;
	excerpt: string;
	href?: string;
}

/** Short-form series updates shown on player profiles (replace with CMS or feed later). */
export const GP_SERIES_POSTS: SeriesPost[] = [
	{
		title: 'Lap 1 preview: what is at stake in Ocala?',
		date: 'May 2026',
		excerpt: 'The points race starts here, with open draws stacked across every division.',
		href: '/tournaments',
	},
	{
		title: 'How Grand Prix scoring works this season',
		date: 'Apr 2026',
		excerpt: 'Singles, doubles, and mixed each track separately toward year-end honors.',
		href: '/points',
	},
];
