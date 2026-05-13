import { LB_CATEGORY_HEADING, LB_DIVISIONS_BY_CATEGORY, lbData } from './leaderboard';
import { EVENTS } from './events';

export interface PlayerEventCall {
	eventName: string;
	division: string;
	time: string;
	note?: string;
}

export interface PlayerScheduleEntry extends PlayerEventCall {
	/** First-round opponent name (null if BYE/TBD or round-robin) */
	opponent?: string;
	/** URL-slug for the opponent's player profile */
	opponentSlug?: string;
	/** Slug of the event (for bracket deep-link) */
	eventSlug?: string;
	/** Division detail ID (for bracket deep-link) */
	divisionId?: string;
}

/** Enriches a player's event list with opponent and bracket-link data from live bracket. */
export function getPlayerScheduleEntries(
	playerName: string,
	profileEvents: PlayerEventCall[],
): PlayerScheduleEntry[] {
	const normalized = playerName.trim().toLowerCase();
	return profileEvents.map((entry) => {
		const result: PlayerScheduleEntry = { ...entry };
		const event = EVENTS.find((e) => e.name === entry.eventName);
		if (!event) return result;
		result.eventSlug = event.slug;
		const div = event.divisionDetails.find((d) => d.label === entry.division);
		if (!div) return result;
		result.divisionId = div.id;
		if (div.format !== 'single' || !div.rounds) return result;
		outer: for (const round of div.rounds) {
			for (const match of round.matches) {
				const p1 = (match.player1 ?? '').trim().toLowerCase();
				const p2 = (match.player2 ?? '').trim().toLowerCase();
				if (p1 !== normalized && p2 !== normalized) continue;
				if (match.scheduledTime && match.scheduledTime !== entry.time) continue;
				const rawOpp = (p1 === normalized ? match.player2 : match.player1)?.trim() ?? '';
				const upper = rawOpp.toUpperCase();
				if (rawOpp && upper !== 'BYE' && upper !== 'TBD' && upper !== '') {
					result.opponent = rawOpp;
					result.opponentSlug = getPlayerSlug(rawOpp);
				}
				break outer;
			}
		}
		return result;
	});
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
					imageUrl: row.image,
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
				divisions: [],
				events: [],
			};
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
		.map((player) => ({
			...player,
			bio:
				player.bio ||
				`Grand Prix competitor from ${player.city ?? 'Florida'}. Focused on steady finishes and building points across every stop.`,
		}))
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
	result: 'win' | 'loss' | 'pending';
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
						if (m.winner === side) {
							result = 'win';
						} else if (isGhostOpponent(opp)) {
							result = 'win';
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
		title: 'Stop 1 preview: what is at stake in Ocala?',
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
