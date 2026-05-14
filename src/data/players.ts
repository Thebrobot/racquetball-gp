import { LB_CATEGORY_HEADING, LB_DIVISIONS_BY_CATEGORY, lbData } from './leaderboard';
import { EVENTS } from './events';
import { PLAYER_IMAGES } from './player-images';
export { PLAYER_IMAGES };

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
	// Doubles teams are stored as "LastA / LastB" — match by last name.
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

		// ── Single elimination: find the match containing this player ────────────
		if (div?.rounds) {
			outer: for (const round of div.rounds) {
				for (const match of round.matches) {
					const p1 = (match.player1 ?? '').trim();
					const p2 = (match.player2 ?? '').trim();
					const side = playerMatchesEntry(playerName, p1) ? 1 : playerMatchesEntry(playerName, p2) ? 2 : null;
					if (side === null) continue;
					if (match.scheduledTime && match.scheduledTime !== entry.time) continue;
					const rawOpp = (side === 1 ? p2 : p1).trim();
					if (!isGhostName(rawOpp)) {
						base.opponent = rawOpp;
						if (!rawOpp.includes('/')) base.opponentSlug = getPlayerSlug(rawOpp);
					}
					break outer;
				}
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

export function getAllPlayers(): PlayerProfile[] {
	const map = new Map<string, PlayerProfile>();
	const divisionLabels = Object.fromEntries(
		Object.entries(LB_DIVISIONS_BY_CATEGORY).flatMap(([category, list]) =>
			list.map((div) => [`${category}:${div.id}`, `${LB_CATEGORY_HEADING[category as keyof typeof LB_CATEGORY_HEADING]} · ${div.label}`]),
		),
	);

	Object.entries(lbData).forEach(([category, divisions]) => {
		Object.entries(divisions).forEach(([divisionId, rows]) => {
			const label = divisionLabels[`${category}:${divisionId}`] ?? divisionId;
			rows.forEach((row) => {
				if (!isIndividual(row.name)) return;
				const slug = getPlayerSlug(row.name);
			const existing = map.get(slug) ?? {
				name: row.name,
				slug,
				city: row.city,
				imageUrl: PLAYER_IMAGES[row.name] ?? row.image,
				bio: row.tagline,
				divisions: [],
				events: [],
			};
				if (!existing.bio && row.tagline) {
					existing.bio = row.tagline;
				}
				if (!existing.divisions.includes(label)) {
					existing.divisions.push(label);
				}
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
				imageUrl: PLAYER_IMAGES[profile.name],
				divisions: [],
				events: [],
			};
			// Apply image from lookup if not already set
			if (!existing.imageUrl && PLAYER_IMAGES[profile.name]) {
				existing.imageUrl = PLAYER_IMAGES[profile.name];
			}
			const eventEntry: PlayerEventCall = {
				eventName: event.name,
				division: profile.division,
				time: profile.time,
				note: profile.note,
			};
			existing.events.push(eventEntry);
			if (!existing.divisions.includes(profile.division)) {
				existing.divisions.push(profile.division);
			}
			map.set(slug, existing);
		});
	});

	return Array.from(map.values())
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
	/** Bye advances are not match wins — excluded from W–L on profiles. */
	result: 'win' | 'loss' | 'pending' | 'bye';
}

function isGhostOpponent(name: string): boolean {
	const u = name.trim().toUpperCase();
	return u === 'BYE' || u === 'TBD' || u === '';
}

/** Matches from published event brackets where this player appears (singles elim only in data). */
export function getPlayerMatchHistory(playerName: string): PlayerMatchRecord[] {
	const normalized = playerName.trim().toLowerCase();
	const out: PlayerMatchRecord[] = [];
	for (const event of EVENTS) {
		for (const div of event.divisionDetails ?? []) {
			if (div.format !== 'single') continue;
			for (const round of div.rounds ?? []) {
				for (const m of round.matches ?? []) {
					const p1 = (m.player1 ?? '').trim();
					const p2 = (m.player2 ?? '').trim();
					const p1n = p1.toLowerCase();
					const p2n = p2.toLowerCase();
					const side = p1n === normalized ? 1 : p2n === normalized ? 2 : null;
					if (side === null) continue;
					const opp = side === 1 ? p2 : p1;
					let result: PlayerMatchRecord['result'] = 'pending';
					if (m.winner === 1 || m.winner === 2) {
						const oppGhost = isGhostOpponent(opp);
						if (m.winner === side) {
							result = oppGhost ? 'bye' : 'win';
						} else if (oppGhost) {
							// Inconsistent bracket data (opponent is not a real player but they are marked the winner).
							result = 'pending';
						} else {
							result = 'loss';
						}
					}
					out.push({
						eventSlug: event.slug,
						eventName: event.name,
						divisionId: div.id,
						divisionLabel: div.label,
						roundLabel: round.label,
						opponent: opp || 'TBD',
						score: m.score,
						result,
					});
				}
			}
		}
	}
	return out;
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
		excerpt: 'The points race starts here—open draws stacked across every division.',
		href: '/tournaments',
	},
	{
		title: 'How Grand Prix scoring works this season',
		date: 'Apr 2026',
		excerpt: 'Singles, doubles, and mixed each track separately toward year-end honors.',
		href: '/points',
	},
];
