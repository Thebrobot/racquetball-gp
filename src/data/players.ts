import { LB_CATEGORY_HEADING, LB_DIVISIONS_BY_CATEGORY, LB_OVERVIEW_CATEGORY_ORDER, lbData, leaderboardTotal, type LbCategory, type LbRow } from './leaderboard';
import playerAliases from './player-aliases.json';
import { EVENTS, getEventStatus, type EventData, type EventStatus } from './events';
import type { EventBracketMatch, EventBracketRound } from './events';
import { getPlayerImageForDisplay } from './player-images';
import { individualsFromSlot, playerAppearsInSlot } from '../lib/live/r2-names';
export {
	PLAYER_IMAGES,
	getPlayerImageForDisplay,
	getPlayerImageSrcSet,
	resolvePlayerImage,
} from './player-images';

/** City overrides for players who appear in events but not yet in the leaderboard sheet. */
const PLAYER_CITIES: Record<string, string> = {
	'joe-alonso':              'Miami, FL',
	'troy-ayers':              'Gainesville, FL',
	'ivars-blums':             'Palmetto, FL',
	'joseph-boyette':          'Sarasota, FL',
	'timothy-burke':           'Easley, SC',
	'chris-cournoyer':         'Sarasota, FL',
	'heriberto-cruz-anaya':    'Orlando, FL',
	'miguel-angel-gonzalez':   'Zacatecas, Mexico',
	'mike-harmon':             'Sarasota, FL',
	'mike-kinkin':             'North Port, FL',
	'bailey-lewis':            'Fort Pierce, FL',
	'luis-macias':             'Cape Coral, FL',
	'bobby-morales':           'Bonita Springs, FL',
	'marco-port':              'Cape Coral, FL',
	'eduardo-portillo-torres': 'San Luis Potosí, Mexico',
	'nicholas-ramos':          'Tampa, FL',
	'oscar-sanchez':           'Miami, FL',
	'alan-schiebe':            'Venice, FL',
	'van-soles':               'Osprey, FL',
	'richard-unzueta':         'Miami, FL',
	'oscar-urquidi':           'St. Petersburg, FL',
	'robert-voor':             'Brandon, FL',
	'david-wilmore-jr':        'Lakeland, FL',
	'jaime-abondano':          'Oviedo, FL',
	'alex-bartolome':          'Miami, FL',
	'mike-boyar':              'Delray Beach, FL',
	'ann-brandt':              'Southwest Ranches, FL',
	'greg-caruso':             'Gainesville, FL',
	'jason-cheng':             'Sebring, FL',
	'shane-de-witt':           'Vero Beach, FL',
	'chris-dermody':           'Vero Beach, FL',
	'steve-disalvo':           'Hollywood, FL',
	'jose-gallegos':           'Mobile, AL',
	'bryon-haacke':            'Ocala, FL',
	'dirk-huck':               'Port St. Lucie, FL',
	'john-joseph':             'Port St. Lucie, FL',
	'ben-kniesly':             'Tampa, FL',
	'joe-linnell':             'Port St. Lucie, FL',
	'jack-mcdonald':           'Gainesville, FL',
	'terry-money':             'Palm City, FL',
	'trevor-morgan':           'Fort Pierce, FL',
	'tyson-peco':              'Bradenton, FL',
	'val-peco':                'Port St. Lucie, FL',
	'larry-prince-jr':         'Delray Beach, FL',
	'naomi-ros':               'San Antonio, TX',
	'annie-sanchez':           'Gresham, OR',
	'john-wuchte':             'Fort Pierce, FL',
	'elijah-saunders':         'Palm Coast, FL',
	'yelandi-rivero':          'West Palm Beach, FL',
	'scott-gill':              'Winter Haven, FL',
	'gene-fry':                'Casselberry, FL',
	'brian-grantham':          'Sarasota, FL',
	'tony-gutierrez':          'Oviedo, FL',
	'isaac-taylor':            'Lakeland, FL',
	'ben-mordkovich':          'Longwood, FL',
};

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
	/** Whether the event is live, upcoming, or completed */
	eventStatus?: EventStatus;
	/** Human-readable date range for the event, e.g. "July 10–12, 2026" */
	eventDateRange?: string;
}

/**
 * Returns true if playerName matches entryName.
 * Handles exact-name singles ("Trace Gunsch") and last-name doubles teams ("Gunsch / Smith").
 */
function playerMatchesEntry(playerName: string, entryName: string): boolean {
	return playerAppearsInSlot(playerName, entryName);
}

function eventNameRoster(event: EventData): string[] {
	const names = (event.profiles ?? []).map((p) => p.name);
	for (const div of event.divisionDetails ?? []) {
		for (const round of div.rounds ?? []) {
			for (const m of round.matches ?? []) {
				names.push(m.player1, m.player2);
			}
		}
		for (const m of div.roundRobinMatches ?? []) {
			names.push(m.team1, m.team2);
		}
		names.push(...(div.roundRobinPlayers ?? []));
	}
	return [...new Set(names.filter((n) => n && !/^(tbd|bye)$/i.test(n.trim()) && !n.includes('/')))];
}

function playerOnMatch(playerName: string, a: string, b: string, roster: string[]): 1 | 2 | null {
	if (playerAppearsInSlot(playerName, a, roster)) return 1;
	if (playerAppearsInSlot(playerName, b, roster)) return 2;
	return null;
}

function isGhostName(name: string): boolean {
	const u = name.trim().toUpperCase();
	return u === 'BYE' || u === 'TBD' || u === '';
}

/** Day order for schedule sorting, starting with Friday to match the event weekend. */
const SCHEDULE_DAY_ORDER: Record<string, number> = {
	friday: 0,
	saturday: 1,
	sunday: 2,
	monday: 3,
	tuesday: 4,
	wednesday: 5,
	thursday: 6,
};

/** Parses a schedule time string like "Friday · 6:30 PM" into a sortable value
 *  (day-of-week, starting Friday, combined with minutes-since-midnight).
 *  Unrecognized formats sort last so they don't disrupt the rest of the order. */
function scheduleSortKey(time: string | undefined): number {
	if (!time) return Number.MAX_SAFE_INTEGER;
	const m = time.match(/([a-z]+)\D*(\d{1,2}):(\d{2})\s*(am|pm)/i);
	if (!m) return Number.MAX_SAFE_INTEGER;
	const dayIdx = SCHEDULE_DAY_ORDER[m[1].toLowerCase()];
	if (dayIdx === undefined) return Number.MAX_SAFE_INTEGER;
	let hour = parseInt(m[2], 10) % 12;
	if (m[4].toLowerCase() === 'pm') hour += 12;
	const minutes = hour * 60 + parseInt(m[3], 10);
	return dayIdx * 24 * 60 + minutes;
}

/** Enriches a player's event list with opponent and bracket-link data from live bracket.
 *  Round-robin divisions with per-match data expand into one entry per match.
 */
export function getPlayerScheduleEntries(
	playerName: string,
	profileEvents: PlayerEventCall[],
	/** Pass live-merged events (see lib/live/event.ts) to reflect results posted since the last deploy. */
	events: EventData[] = EVENTS,
	opts?: { discoverExtraDivisions?: boolean },
): PlayerScheduleEntry[] {
	const out: PlayerScheduleEntry[] = [];

	const calls = [...profileEvents];
	const have = new Set(calls.map((e) => `${e.eventName}::${e.division}`));
	// Roster name-matching across every draw slot is O(players × matches × roster).
	// Event hub / participants already have a profile row per division — skip it.
	if (opts?.discoverExtraDivisions !== false) {
		for (const event of events) {
			const roster = eventNameRoster(event);
			for (const div of event.divisionDetails ?? []) {
				const key = `${event.name}::${div.label}`;
				if (have.has(key)) continue;
				const appears = [
					...(div.rounds ?? []).flatMap((r) => r.matches ?? []).flatMap((m) => [m.player1, m.player2]),
					...(div.roundRobinMatches ?? []).flatMap((m) => [m.team1, m.team2]),
					...(div.roundRobinPlayers ?? []),
				].some((slot) => playerAppearsInSlot(playerName, slot, roster));
				if (!appears) continue;
				calls.push({ eventName: event.name, division: div.label, time: '' });
				have.add(key);
			}
		}
	}

	for (const entry of calls) {
		const event = events.find((e) => e.name === entry.eventName);
		if (!event) { out.push(entry); continue; }

		const div = event.divisionDetails.find((d) => d.label === entry.division);
		const base: PlayerScheduleEntry = {
			...entry,
			eventSlug: event.slug,
			divisionId: div?.id,
			eventStatus: getEventStatus(event),
			eventDateRange: event.dateRange,
		};

		// ── Round robin WITH per-match schedule → one ticket per match ──────────
		// Completed matches (winner decided) drop off the schedule; they show in
		// Match History instead.
		if (div?.format === 'roundrobin' && div.roundRobinMatches?.length) {
			const myMatches = div.roundRobinMatches.filter(
				(m) =>
					m.winner == null &&
					(playerMatchesEntry(playerName, m.team1) || playerMatchesEntry(playerName, m.team2)),
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
		// Only pending matches count — once a match has a winner it moves to
		// Match History, so the ticket should advance to the player's next match
		// (or disappear if they have none left).
		if (div?.rounds) {
			const cands: { round: EventBracketRound; match: EventBracketMatch; side: 1 | 2 }[] = [];
			let hadCompleted = false;
			for (const round of div.rounds) {
				for (const match of round.matches) {
					const p1 = (match.player1 ?? '').trim();
					const p2 = (match.player2 ?? '').trim();
					const side = playerMatchesEntry(playerName, p1) ? 1 : playerMatchesEntry(playerName, p2) ? 2 : null;
					if (side === null) continue;
					if (match.winner != null) {
						hadCompleted = true;
						continue;
					}
					cands.push({ round, match, side });
				}
			}

			// Player appeared in the bracket but every one of their matches is
			// decided → nothing upcoming, drop the ticket entirely.
			if (!cands.length && hadCompleted) continue;

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

	return out.sort((a, b) => scheduleSortKey(a.time) - scheduleSortKey(b.time));
}

/**
 * Court shown on the event hub / participants next-call row.
 * When a next match exists, use only that match's court — never the previous
 * match's court from the profile row. Empty → caller renders TBD.
 */
export function nextCallCourt(
	nextNote: string | undefined,
	profileNote: string | undefined,
	nextMatchExists: boolean,
): string | null {
	const note = nextMatchExists ? (nextNote ?? '') : (profileNote ?? '');
	return note.match(/court\s*#?\s*(\w+)/i)?.[1] ?? null;
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

function rawPlayerSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '');
}

type Alias = { slug: string; name: string };
const PLAYER_ALIASES: Record<string, Alias> = Object.fromEntries(
	Object.entries(playerAliases as Record<string, Alias | string>).filter((e): e is [string, Alias] => typeof e[1] === 'object'),
);

/** Slug for a player name. Alternate spellings resolve to the canonical player (src/data/player-aliases.json). */
export function getPlayerSlug(name: string): string {
	const raw = rawPlayerSlug(name);
	return PLAYER_ALIASES[raw]?.slug ?? raw;
}

/** The spelling we show for a player, whichever spelling the data used. */
export function canonicalPlayerName(name: string): string {
	return PLAYER_ALIASES[rawPlayerSlug(name)]?.name ?? name;
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
				name: canonicalPlayerName(row.name),
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
				name: canonicalPlayerName(profile.name),
				slug,
				city: PLAYER_CITIES[slug],
				imageUrl: getPlayerImageForDisplay(profile.name, 64),
				divisions: [],
				events: [],
			};
			// Apply image from lookup if not already set
			if (!existing.imageUrl) {
				const img = getPlayerImageForDisplay(profile.name, 64);
				if (img) existing.imageUrl = img;
			}
			// Apply city from lookup if not already set
			if (!existing.city && PLAYER_CITIES[slug]) {
				existing.city = PLAYER_CITIES[slug];
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

		const roster = eventNameRoster(event);
		for (const div of event.divisionDetails ?? []) {
			const slots: string[] = [];
			for (const round of div.rounds ?? []) {
				for (const m of round.matches ?? []) slots.push(m.player1, m.player2);
			}
			for (const m of div.roundRobinMatches ?? []) slots.push(m.team1, m.team2);
			slots.push(...(div.roundRobinPlayers ?? []));
			for (const name of new Set(slots.flatMap((s) => individualsFromSlot(s, roster)))) {
				if (!isIndividual(name)) continue;
				const slug = getPlayerSlug(name);
				const existing = map.get(slug) ?? {
					name: canonicalPlayerName(name),
					slug,
					city: PLAYER_CITIES[slug],
					imageUrl: getPlayerImageForDisplay(name, 64),
					divisions: [],
					events: [],
				};
				addPlayerDivision(existing.divisions, div.label);
				if (!existing.events.some((e) => e.eventName === event.name && e.division === div.label)) {
					existing.events.push({ eventName: event.name, division: div.label, time: '' });
				}
				map.set(slug, existing);
			}
		}
	});

	return Array.from(map.values())
		.map((player) => ({ ...player, divisions: sortDivisionLabels(player.divisions) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export interface PlayerMatchRecord {
	eventSlug: string;
	eventName: string;
	eventDateRange: string;
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
export function getPlayerMatchHistory(playerName: string, events: EventData[] = EVENTS): PlayerMatchRecord[] {
	const out: PlayerMatchRecord[] = [];
	for (const event of events) {
		const roster = eventNameRoster(event);
		for (const div of event.divisionDetails ?? []) {
			for (const round of div.rounds ?? []) {
				for (const m of round.matches ?? []) {
					const p1 = (m.player1 ?? '').trim();
					const p2 = (m.player2 ?? '').trim();
					const side = playerOnMatch(playerName, p1, p2, roster);
					if (side === null) continue;
					const opp = side === 1 ? p2 : p1;
					out.push({
						eventSlug: event.slug,
						eventName: event.name,
						eventDateRange: event.dateRange,
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
				const side = playerOnMatch(playerName, m.team1, m.team2, roster);
				if (side === null) continue;
				const opp = side === 1 ? m.team2 : m.team1;
				out.push({
					eventSlug: event.slug,
					eventName: event.name,
					eventDateRange: event.dateRange,
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

export type MissingDivisionLink = { name: string; division: string };

/** Players who appear in a division's matches but have no profile row for that division. */
export function missingEventDivisionLinks(event: EventData): MissingDivisionLink[] {
	const roster = eventNameRoster(event);
	const profiled = new Set((event.profiles ?? []).map((p) => `${p.name}::${p.division}`));
	const found = new Map<string, Set<string>>();

	const add = (slot: string, division: string) => {
		for (const name of individualsFromSlot(slot, roster)) {
			if (!found.has(name)) found.set(name, new Set());
			found.get(name)!.add(division);
		}
	};

	for (const div of event.divisionDetails ?? []) {
		for (const round of div.rounds ?? []) {
			for (const m of round.matches ?? []) {
				add(m.player1, div.label);
				add(m.player2, div.label);
			}
		}
		for (const m of div.roundRobinMatches ?? []) {
			add(m.team1, div.label);
			add(m.team2, div.label);
		}
		for (const p of div.roundRobinPlayers ?? []) add(p, div.label);
	}

	const missing: MissingDivisionLink[] = [];
	for (const [name, divisions] of found) {
		for (const division of divisions) {
			if (!profiled.has(`${name}::${division}`)) missing.push({ name, division });
		}
	}
	return missing.sort((a, b) => a.name.localeCompare(b.name) || a.division.localeCompare(b.division));
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
