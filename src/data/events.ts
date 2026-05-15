import resultsData from './ocala-results.json';
import { GRAND_PRIX_FACEBOOK_URL } from './social';

export type EventStatus = 'live' | 'recent' | 'upcoming';

export interface EventProfile {
	name: string;
	division: string;
	time: string;
	note?: string;
}

export interface EventDrawBlock {
	label: string;
	items: string[];
	note?: string;
}

export interface EventBracketMatch {
	player1: string;
	player2: string;
	score?: string;
	seed1?: number;
	seed2?: number;
	winner?: 1 | 2;
	player1Id?: string;
	player2Id?: string;
	/** Scheduled start time for this match, e.g. "Saturday · 9:00 AM" */
	scheduledTime?: string;
	/** Court assignment for this match, e.g. "Court 3" */
	court?: string;
	/** R2 Sports match identifier, e.g. "MO9" */
	matchId?: string;
}

export interface EventBracketRound {
	label: string;
	matches: EventBracketMatch[];
}

export type DivisionFormat = 'single' | 'roundrobin';

export interface RoundRobinMatch {
	/** Round label, e.g. "Round 1" */
	round: string;
	/** First team or player (last-name form for doubles, full name for singles) */
	team1: string;
	/** Second team or player */
	team2: string;
	/** Scheduled time in same format as profile entries, e.g. "Saturday · 2:00 PM" */
	scheduledTime: string;
	/** Court assignment, e.g. "Court 3" */
	court?: string;
	/** Final score string, e.g. "15-8, 15-6" */
	score?: string;
	/** Which team won: 1 = team1, 2 = team2 */
	winner?: 1 | 2;
}

export interface EventDivisionDetail {
	id: string;
	label: string;
	format: DivisionFormat;
	rounds?: EventBracketRound[];
	roundRobinPlayers?: string[];
	/** Per-match schedule for round-robin divisions (generates individual ticket per match) */
	roundRobinMatches?: RoundRobinMatch[];
}

export interface EventData {
	slug: string;
	name: string;
	cityLine: string;
	dateRange: string;
	startDate: string;
	endDate: string;
	drawBlocks: EventDrawBlock[];
	divisionDetails: EventDivisionDetail[];
	divisions: string[];
	profiles: EventProfile[];
	/** Home featured strip: hero photo and venue line */
	spotlightImage?: string;
	spotlightVenue?: string;
	/** Facebook / etc., shown as "Watch live" on the home spotlight when set */
	spotlightWatchLiveUrl?: string;
}

const EVENTS_RAW: EventData[] = [
	{
		slug: 'ocala-open',
		name: 'Ocala Open',
		cityLine: 'Ocala, FL',
		dateRange: 'May 14–17, 2026',
		startDate: '2026-05-14',
		endDate: '2026-05-17',
		spotlightImage: '/images/stops/ocala-spotlight.webp',
		spotlightVenue: 'Frank DeLuca YMCA',
		spotlightWatchLiveUrl: GRAND_PRIX_FACEBOOK_URL,
		drawBlocks: [],
		divisions: [
			"Men's Singles: Open",
			"Men's Singles: Elite",
			"Men's Singles: A",
			"Men's Singles: B",
			"Men's Singles: C",
			"Men's Age Singles: 50+",
			"Men's Age Singles: 60+",
			"Men's Age Singles: 70+",
			"Men's Doubles: Open",
			"Men's Doubles: Elite",
			"Men's Doubles: A",
			"Men's Doubles: B",
			"Men's Doubles: Centurion+ Open",
			"Men's Doubles: Super Centurion (120+)",
			"Mixed Doubles: Open/A",
		],
		divisionDetails: [
			// ── Singles ────────────────────────────────────────────────────────────
		{
			id: 'mens-singles-open',
			label: "Men's Singles: Open",
			format: 'single',
			rounds: [
				{
					label: 'Round of 16',
					matches: [
						{ player1: 'Alejandro Herrera',  player2: 'BYE',              seed1: 1,              winner: 1, matchId: 'MO16' },
						{ player1: 'Mario Andres Huyke', player2: 'Scott Haacke',     seed1: 9, seed2: 8,   scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 3', matchId: 'MO9' },
						{ player1: 'Chris Steinheiser',  player2: 'BYE',              seed1: 5,              winner: 1, matchId: 'MO12' },
						{ player1: 'BYE',                player2: 'Jordan Deeney',              seed2: 4,   winner: 2, matchId: 'MO13' },
						{ player1: 'Andres Ramirez',     player2: 'BYE',              seed1: 3,              winner: 1, matchId: 'MO14' },
						{ player1: 'BYE',                player2: 'Samuel Schulze',              seed2: 6,   winner: 2, matchId: 'MO11' },
						{ player1: 'Orlando Josu Huyke', player2: 'Amir Baig',        seed1: 7, seed2: 10,  scheduledTime: 'Saturday · 11:00 AM', court: 'Court 2', matchId: 'MO10' },
						{ player1: 'BYE',                player2: 'Dylan Pruitt',                seed2: 2,   winner: 2, matchId: 'MO15' },
					],
				},
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Alejandro Herrera',  player2: 'TBD',              seed1: 1,              scheduledTime: 'Saturday · 1:00 PM',  court: 'Court 3', matchId: 'MO8' },
						{ player1: 'Chris Steinheiser',  player2: 'Jordan Deeney',    seed1: 5, seed2: 4,   scheduledTime: 'Saturday · 12:00 PM', court: 'Court 1', matchId: 'MO5' },
						{ player1: 'Andres Ramirez',     player2: 'Samuel Schulze',   seed1: 3, seed2: 6,   scheduledTime: 'Saturday · 2:00 PM',  court: 'Court 4', matchId: 'MO6' },
						{ player1: 'TBD',                player2: 'Dylan Pruitt',                seed2: 2,   scheduledTime: 'Saturday · 3:00 PM',  court: 'Court 2', matchId: 'MO7' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Saturday · 6:00 PM', court: 'Court 1', matchId: 'MO4' },
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Saturday · 7:00 PM', court: 'Court 1', matchId: 'MO3' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 2:00 PM', court: 'Court 1', matchId: 'MO1' },
					],
				},
			],
		},
		{
			id: 'mens-singles-elite',
			label: "Men's Singles: Elite",
			format: 'single',
			rounds: [
				{
					label: 'Round of 16',
					matches: [
						{ player1: 'Jordan Deeney',          player2: 'BYE',                 seed1: 1,              winner: 1, matchId: 'ME16' },
						{ player1: 'Mario Andres Huyke',     player2: 'Scott Haacke',        seed1: 9, seed2: 8,   scheduledTime: 'Saturday · 11:00 AM', matchId: 'ME9' },
						{ player1: 'Isaac Taylor',           player2: 'BYE',                 seed1: 5,              winner: 1, matchId: 'ME12' },
						{ player1: 'BYE',                    player2: 'Samuel Schulze',                seed2: 4,   winner: 2, matchId: 'ME13' },
						{ player1: 'Darron Toston',          player2: 'BYE',                 seed1: 3,              winner: 1, matchId: 'ME14' },
						{ player1: 'Jiovanni Garcia',        player2: 'Orlando Josu Huyke',  seed1: 11, seed2: 6,  scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 2', matchId: 'ME11' },
						{ player1: 'Trace Gunsch',           player2: 'Jorge Moreno',        seed1: 7, seed2: 10,  scheduledTime: 'Saturday · 8:00 AM',  court: 'Court 3', matchId: 'ME10' },
						{ player1: 'BYE',                    player2: 'Timothy Schnellenberger',        seed2: 2,  winner: 2, matchId: 'ME15' },
					],
				},
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Jordan Deeney',          player2: 'TBD',                 seed1: 1,              scheduledTime: 'Saturday · 3:00 PM',  court: 'Court 4', matchId: 'ME8' },
						{ player1: 'Isaac Taylor',           player2: 'Samuel Schulze',      seed1: 5, seed2: 4,   scheduledTime: 'Saturday · 4:00 PM',  court: 'Court 2', matchId: 'ME5' },
						{ player1: 'Darron Toston',          player2: 'TBD',                 seed1: 3,              scheduledTime: 'Saturday · 6:00 PM',  matchId: 'ME6' },
						{ player1: 'TBD',                    player2: 'Timothy Schnellenberger',        seed2: 2,  scheduledTime: 'Saturday · 3:00 PM',  court: 'Court 3', matchId: 'ME7' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 9:00 AM',  court: 'Court 4', matchId: 'ME4' },
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 10:00 AM', court: 'Court 3', matchId: 'ME3' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 2:00 PM', court: 'Court 2', matchId: 'ME1' },
					],
				},
			],
		},
		{
			id: 'mens-singles-a',
			label: "Men's Singles: A",
			format: 'single',
			rounds: [
				{
					label: 'Round of 16',
					matches: [
						{ player1: 'Brendan Anthony',  player2: 'BYE',              seed1: 1,              winner: 1, matchId: 'MA16' },
						{ player1: "Russell O'Neal",   player2: 'Kyle Artman',      seed1: 9, seed2: 8,   scheduledTime: 'Friday · 4:30 PM',    court: 'Court 4', matchId: 'MA9' },
						{ player1: 'Mauricio Muriel',  player2: 'BYE',              seed1: 5,              winner: 1, matchId: 'MA12' },
						{ player1: 'BYE',              player2: 'Brian Grantham',              seed2: 4,   winner: 2, matchId: 'MA13' },
						{ player1: 'Gordon Henry',     player2: 'BYE',              seed1: 3,              winner: 1, matchId: 'MA14' },
						{ player1: 'Robert Yanchis',   player2: 'Wade Stubanas',    seed1: 11, seed2: 6,  scheduledTime: 'Friday · 4:30 PM',    court: 'Court 1', matchId: 'MA11' },
						{ player1: 'Jorge Moreno',     player2: 'Ron Jennings',     seed1: 7, seed2: 10,  scheduledTime: 'Saturday · 11:00 AM', court: 'Court 1', matchId: 'MA10' },
						{ player1: 'BYE',              player2: 'Kleber Oliveira',             seed2: 2,   winner: 2, matchId: 'MA15' },
					],
				},
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Brendan Anthony',  player2: 'TBD',              seed1: 1,              scheduledTime: 'Saturday · 1:00 PM',  court: 'Court 2', matchId: 'MA8' },
						{ player1: 'Mauricio Muriel',  player2: 'Brian Grantham',   seed1: 5, seed2: 4,   scheduledTime: 'Saturday · 6:00 PM',  court: 'Court 4', matchId: 'MA5' },
						{ player1: 'Gordon Henry',     player2: 'TBD',              seed1: 3,              scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 4', matchId: 'MA6' },
						{ player1: 'TBD',              player2: 'Kleber Oliveira',             seed2: 2,   scheduledTime: 'Saturday · 8:00 PM',  court: 'Court 2', matchId: 'MA7' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 11:00 AM', court: 'Court 4', matchId: 'MA4' },
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 10:00 AM', court: 'Court 2', matchId: 'MA3' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 1:00 PM', court: 'Court 3', matchId: 'MA1' },
					],
				},
			],
		},
		{
			id: 'mens-singles-b',
			label: "Men's Singles: B",
			format: 'single',
			rounds: [
				{
					label: 'Round of 16',
					matches: [
						{ player1: 'Scott Gill',       player2: 'BYE',              seed1: 1,               winner: 1, matchId: 'MB16' },
						{ player1: 'Matthew Brice',    player2: 'Jonathan Estepan', seed1: 9,  seed2: 8,   scheduledTime: 'Friday · 5:30 PM',   court: 'Court 1', matchId: 'MB9' },
						{ player1: 'Daniel Bray',      player2: 'Havan Artman',     seed1: 5,  seed2: 12,  scheduledTime: 'Friday · 7:30 PM',   court: 'Court 4', matchId: 'MB12' },
						{ player1: 'BYE',              player2: 'Edgar Martinez',               seed2: 4,  winner: 2, matchId: 'MB13' },
						{ player1: 'Matt Kern',        player2: 'BYE',              seed1: 3,               winner: 1, matchId: 'MB14' },
						{ player1: 'Ashley Medlock',   player2: 'Mark Manzano',     seed1: 11, seed2: 6,   scheduledTime: 'Friday · 5:30 PM',   court: 'Court 2', matchId: 'MB11' },
						{ player1: 'Ryan Appleby',     player2: 'Mike Caldwell',    seed1: 7,  seed2: 10,  scheduledTime: 'Friday · 5:30 PM',   court: 'Court 3', matchId: 'MB10' },
						{ player1: 'BYE',              player2: 'Kyle Artman',                  seed2: 2,  winner: 2, matchId: 'MB15' },
					],
				},
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Scott Gill',       player2: 'TBD',              seed1: 1,               scheduledTime: 'Saturday · 11:00 AM', court: 'Court 3', matchId: 'MB8' },
						{ player1: 'Edgar Martinez',   player2: 'TBD',              seed1: 4,               scheduledTime: 'Saturday · 8:00 AM',  court: 'Court 1', matchId: 'MB5' },
						{ player1: 'Matt Kern',        player2: 'TBD',              seed1: 3,               scheduledTime: 'Saturday · 11:00 AM', court: 'Court 4', matchId: 'MB6' },
						{ player1: 'TBD',              player2: 'Kyle Artman',                  seed2: 2,  scheduledTime: 'Saturday · 8:00 AM',  court: 'Court 4', matchId: 'MB7' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Saturday · 7:00 PM', court: 'Court 3', matchId: 'MB4' },
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Saturday · 6:00 PM', court: 'Court 3', matchId: 'MB3' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD', scheduledTime: 'Sunday · 1:00 PM', court: 'Court 2', matchId: 'MB1' },
					],
				},
			],
		},
			{
				id: 'mens-singles-c',
				label: "Men's Singles: C",
				format: 'roundrobin',
				roundRobinPlayers: ['Michael Ammen', 'Ben Mordkovich', 'Gordon Kelly'],
				roundRobinMatches: [
					{ round: 'Round 1', team1: 'Michael Ammen', team2: 'Ben Mordkovich', scheduledTime: 'Saturday · 8:00 AM',  court: 'Court 2' },
					{ round: 'Round 2', team1: 'Michael Ammen', team2: 'Gordon Kelly',   scheduledTime: 'Saturday · 10:00 AM', court: 'Court 2' },
					{ round: 'Round 3', team1: 'Gordon Kelly',  team2: 'Ben Mordkovich', scheduledTime: 'Saturday · 12:00 PM', court: 'Court 2' },
				],
			},
			// ── Age Singles ────────────────────────────────────────────────────────
		{
			id: 'mens-age-50',
			label: "Men's Age Singles: 50+",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Chad Beacher',    player2: 'BYE',                      seed1: 1,             winner: 1 },
						{ player1: 'Trace Gunsch',    player2: 'Chris Steinheiser',         seed1: 4, seed2: 5,  scheduledTime: 'Friday · 6:30 PM', court: 'Court 1' },
						{ player1: 'Charles Cole',    player2: 'John Johnston',             seed1: 3, seed2: 6,  scheduledTime: 'Friday · 7:30 PM', court: 'Court 1' },
						{ player1: 'Kleber Oliveira', player2: 'Timothy Schnellenberger',   seed1: 7, seed2: 2,  scheduledTime: 'Friday · 7:30 PM', court: 'Court 3' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'Chad Beacher', player2: 'TBD', seed1: 1, scheduledTime: 'Sunday · 8:00 AM', court: 'Court 2' },
						{ player1: 'TBD',          player2: 'TBD' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
		{
			id: 'mens-age-60',
			label: "Men's Age Singles: 60+",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Gordon Henry',  player2: 'BYE',            seed1: 1,             winner: 1 },
						{ player1: 'Laura Brandt',  player2: 'Eric Foley',     seed1: 4, seed2: 5,  scheduledTime: 'Saturday · 10:00 AM', court: 'Court 2' },
						{ player1: 'Michael Ammen', player2: "Russell O'Neal", seed1: 3, seed2: 6,  scheduledTime: 'Saturday · 3:00 PM',  court: 'Court 1' },
						{ player1: 'BYE',           player2: 'Charles Cole',              seed2: 2, winner: 2 },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'Gordon Henry',  player2: 'TBD', seed1: 1, scheduledTime: 'Sunday · 8:00 AM', court: 'Court 3' },
						{ player1: 'TBD',           player2: 'Charles Cole',   seed2: 2, scheduledTime: 'Sunday · 9:00 AM', court: 'Court 1' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
		{
			id: 'mens-age-70',
			label: "Men's Age Singles: 70+",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Gene Fry',       player2: 'BYE',          seed1: 1,             winner: 1 },
						{ player1: 'Michael Ammen',  player2: 'Gordon Kelly', seed1: 4, seed2: 5,  scheduledTime: 'Friday · 6:30 PM',   court: 'Court 3' },
						{ player1: 'Philip Gaerlan', player2: 'Scott Gill',   seed1: 3, seed2: 6,  scheduledTime: 'Saturday · 1:00 PM', court: 'Court 1' },
						{ player1: 'BYE',            player2: 'TBD',                    seed2: 2,  winner: 2 },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'Gene Fry', player2: 'TBD', seed1: 1, scheduledTime: 'Saturday · 2:00 PM', court: 'Court 2' },
						{ player1: 'TBD',      player2: 'TBD' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
			// ── Doubles ────────────────────────────────────────────────────────────
			{
				id: 'mens-doubles-open',
				label: "Men's Doubles: Open",
				format: 'roundrobin',
				roundRobinPlayers: [
					'Beacher / Toston',
					'Garcia / Nolan',
					'M. Huyke / O. Huyke',
					'Rivero / Steinheiser',
				],
				// Full schedule from R2 Sports
				roundRobinMatches: [
					{ round: 'Round 1', team1: 'Garcia / Nolan',      team2: 'Beacher / Toston',      scheduledTime: 'Saturday · 2:00 PM' },
					{ round: 'Round 1', team1: 'M. Huyke / O. Huyke', team2: 'Rivero / Steinheiser',  scheduledTime: 'Saturday · 4:00 PM', court: 'Court 3' },
					{ round: 'Round 2', team1: 'Garcia / Nolan',      team2: 'Rivero / Steinheiser',  scheduledTime: 'Saturday · 5:00 PM', court: 'Court 2' },
					{ round: 'Round 2', team1: 'M. Huyke / O. Huyke', team2: 'Beacher / Toston',      scheduledTime: 'Saturday · 7:00 PM', court: 'Court 4' },
					{ round: 'Round 3', team1: 'Rivero / Steinheiser', team2: 'Beacher / Toston',     scheduledTime: 'Sunday · 12:00 PM',  court: 'Court 3' },
					{ round: 'Round 3', team1: 'Garcia / Nolan',      team2: 'M. Huyke / O. Huyke',  scheduledTime: 'Sunday · 12:00 PM' },
				],
			},
		{
			id: 'mens-doubles-elite',
			label: "Men's Doubles: Elite",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Deeney / Saunders',  player2: 'B. Haacke / S. Haacke', scheduledTime: 'Friday · 6:30 PM',    court: 'Court 4' },
						{ player1: 'Garcia / Nolan',     player2: 'Fajardo / Russell',     scheduledTime: 'Friday · 7:30 PM',    court: 'Court 2' },
						{ player1: 'Johnston / Lopez',   player2: 'Oliveira / TBD',        scheduledTime: 'Saturday · 10:00 AM', court: 'Court 3' },
						{ player1: 'Anthony / Schulze',  player2: 'Beacher / Toston',      scheduledTime: 'Saturday · 12:00 PM', court: 'Court 3' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
		{
			id: 'mens-doubles-a',
			label: "Men's Doubles: A",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Haacke / Muriel',            player2: 'BYE',                seed1: 1,             winner: 1 },
						{ player1: 'Artman / Jennings',          player2: 'Hernandez / Moreno', seed1: 4, seed2: 5,  scheduledTime: 'Friday · 5:30 PM',    court: 'Court 4' },
						{ player1: 'Russell / Van Zant-Russell', player2: 'Sotolongo / Urzua',  seed1: 3, seed2: 6,  scheduledTime: 'Saturday · 12:00 PM', court: 'Court 2' },
						{ player1: 'Grantham / Stubanas',        player2: 'Medlock / Yanchis',  seed1: 7, seed2: 2,  scheduledTime: 'Saturday · 1:00 PM',  court: 'Court 4' },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'Haacke / Muriel', player2: 'TBD', seed1: 1, scheduledTime: 'Sunday · 9:00 AM', court: 'Court 2' },
						{ player1: 'TBD',             player2: 'TBD' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
		{
			id: 'mens-doubles-b',
			label: "Men's Doubles: B",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Hernandez / Swartz', player2: 'BYE',                seed1: 1,             winner: 1 },
						{ player1: 'Appleby / Kern',     player2: 'Estepan / Strickland', seed1: 4, seed2: 5, scheduledTime: 'Saturday · 5:00 PM', court: 'Court 1' },
						{ player1: 'Brice / Martinez',   player2: 'Manzano / Sotolongo', seed1: 3, seed2: 6, scheduledTime: 'Sunday · 9:00 AM',   court: 'Court 3' },
						{ player1: 'BYE',                player2: 'TBD',                            seed2: 2, winner: 2 },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'Hernandez / Swartz', player2: 'TBD', seed1: 1, scheduledTime: 'Sunday · 8:00 AM', court: 'Court 4' },
						{ player1: 'TBD',                player2: 'TBD' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
		{
			id: 'mens-doubles-centurion',
			label: "Men's Doubles: Centurion+ Open",
			format: 'single',
			rounds: [
				{
					label: 'Quarterfinals',
					matches: [
						{ player1: 'Hernandez / Herrera', player2: 'BYE',                seed1: 1,             winner: 1 },
						{ player1: 'Foley / Nolan',       player2: 'Haacke / Urzua',     seed1: 4, seed2: 5,  scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 1' },
						{ player1: 'Baig / Rivero',       player2: 'Gutierrez / Ramirez', seed1: 3, seed2: 6, scheduledTime: 'Saturday · 10:00 AM', court: 'Court 1' },
						{ player1: 'BYE',                 player2: 'Johnston / Lopez',               seed2: 2, winner: 2 },
					],
				},
				{
					label: 'Semifinals',
					matches: [
						{ player1: 'Hernandez / Herrera', player2: 'TBD', seed1: 1, scheduledTime: 'Saturday · 4:00 PM', court: 'Court 1' },
						{ player1: 'TBD',                 player2: 'Johnston / Lopez', seed2: 2, scheduledTime: 'Saturday · 5:00 PM', court: 'Court 4' },
					],
				},
				{
					label: 'Finals',
					matches: [
						{ player1: 'TBD', player2: 'TBD' },
					],
				},
			],
		},
			{
				id: 'mens-doubles-super-centurion',
				label: "Men's Doubles: Super Centurion (120+)",
				format: 'roundrobin',
				roundRobinPlayers: [
					'Fry / Gutierrez',
					'Gaerlan / Lewis',
					'Hernandez / Martinez',
				],
				roundRobinMatches: [
					{ round: 'Round 1', team1: 'Gaerlan / Lewis',    team2: 'Hernandez / Martinez', scheduledTime: 'Saturday · 10:00 AM', court: 'Court 4' },
					{ round: 'Round 2', team1: 'Fry / Gutierrez',    team2: 'Hernandez / Martinez', scheduledTime: 'Saturday · 4:00 PM' },
					{ round: 'Round 3', team1: 'Fry / Gutierrez',    team2: 'Gaerlan / Lewis',      scheduledTime: 'Sunday · 9:00 AM' },
				],
			},
			{
				id: 'mixed-doubles',
				label: 'Mixed Doubles: Open/A',
				format: 'roundrobin',
				roundRobinPlayers: [
					'Anthony / Artman',
					'Brandt / Henry',
					'Jennings / Jennings',
					'Russell / Van Zant-Russell',
				],
				roundRobinMatches: [
					{ round: 'Round 1', team1: 'Brandt / Henry',           team2: 'Jennings / Jennings',       scheduledTime: 'Friday · 6:30 PM',    court: 'Court 2' },
					{ round: 'Round 2', team1: 'Russell / Van Zant-Russell', team2: 'Jennings / Jennings',     scheduledTime: 'Saturday · 2:00 PM',  court: 'Court 3' },
					{ round: 'Round 2', team1: 'Anthony / Artman',         team2: 'Brandt / Henry',            scheduledTime: 'Saturday · 4:00 PM',  court: 'Court 4' },
					{ round: 'Round 3', team1: 'Anthony / Artman',         team2: 'Russell / Van Zant-Russell', scheduledTime: 'Saturday · 6:00 PM', court: 'Court 4' },
					{ round: 'Round 3', team1: 'Brandt / Henry',           team2: 'Russell / Van Zant-Russell', scheduledTime: 'Sunday · 9:00 AM',   court: 'Court 2' },
					{ round: 'Round 1', team1: 'Anthony / Artman',         team2: 'Jennings / Jennings',       scheduledTime: 'Saturday · 10:00 AM', court: 'Court 1' },
				],
			},
		],
		// ── Player profiles: all 64 participants, every division + time ─────────
		profiles: [
			// Michael Ammen
			{ name: 'Michael Ammen', division: "Men's Age Singles: 70+",          time: 'Friday · 6:30 PM',    note: 'Court 3' },
			{ name: 'Michael Ammen', division: "Men's Singles: C",                time: 'Saturday · 8:00 AM',  note: 'Court 2' },
			{ name: 'Michael Ammen', division: "Men's Age Singles: 60+",          time: 'Saturday · 3:00 PM',  note: 'Court 1' },
			// Brendan Anthony
			{ name: 'Brendan Anthony', division: "Men's Doubles: Elite",          time: 'Saturday · 12:00 PM', note: 'Court 3' },
			{ name: 'Brendan Anthony', division: "Men's Singles: A",              time: 'Saturday · 1:00 PM',  note: 'Court 2' },
			{ name: 'Brendan Anthony', division: 'Mixed Doubles: Open/A',         time: 'Saturday · 4:00 PM',  note: 'Court 4' },
			// Ryan Appleby
			{ name: 'Ryan Appleby', division: "Men's Singles: B",                 time: 'Friday · 5:30 PM',    note: 'Court 3' },
			{ name: 'Ryan Appleby', division: "Men's Doubles: B",                 time: 'Saturday · 5:00 PM',  note: 'Court 1' },
			// Havan Artman
			{ name: 'Havan Artman', division: "Men's Singles: B",                 time: 'Friday · 7:30 PM',    note: 'Court 4' },
			{ name: 'Havan Artman', division: 'Mixed Doubles: Open/A',            time: 'Saturday · 4:00 PM',  note: 'Court 4' },
			// Kyle Artman
			{ name: 'Kyle Artman', division: "Men's Singles: A",                  time: 'Friday · 4:30 PM',    note: 'Court 4' },
			{ name: 'Kyle Artman', division: "Men's Doubles: A",                  time: 'Friday · 5:30 PM',    note: 'Court 4' },
			{ name: 'Kyle Artman', division: "Men's Singles: B",                  time: 'Saturday · 8:00 AM',  note: 'Court 4' },
			// Amir Baig
			{ name: 'Amir Baig', division: "Men's Doubles: Centurion+ Open",      time: 'Saturday · 10:00 AM', note: 'Court 1' },
			{ name: 'Amir Baig', division: "Men's Singles: Open",                 time: 'Saturday · 11:00 AM', note: 'Court 2' },
			// Chad Beacher
			{ name: 'Chad Beacher', division: "Men's Doubles: Elite",             time: 'Saturday · 12:00 PM', note: 'Court 3' },
			{ name: 'Chad Beacher', division: "Men's Doubles: Open",              time: 'Saturday · 2:00 PM' },
			{ name: 'Chad Beacher', division: "Men's Age Singles: 50+",           time: 'Sunday · 8:00 AM',    note: 'Court 2' },
			// Laura Brandt
			{ name: 'Laura Brandt', division: 'Mixed Doubles: Open/A',            time: 'Friday · 6:30 PM',    note: 'Court 2' },
			{ name: 'Laura Brandt', division: "Men's Age Singles: 60+",           time: 'Saturday · 10:00 AM', note: 'Court 2' },
			// Daniel Bray
			{ name: 'Daniel Bray', division: "Men's Singles: B",                  time: 'Friday · 7:30 PM',    note: 'Court 4' },
			// Matthew Brice
			{ name: 'Matthew Brice', division: "Men's Singles: B",                time: 'Friday · 5:30 PM',    note: 'Court 1' },
			{ name: 'Matthew Brice', division: "Men's Doubles: B",                time: 'Sunday · 9:00 AM',    note: 'Court 3' },
			// Mike Caldwell
			{ name: 'Mike Caldwell', division: "Men's Singles: B",                time: 'Friday · 5:30 PM',    note: 'Court 3' },
			// Charles Cole
			{ name: 'Charles Cole', division: "Men's Age Singles: 50+",           time: 'Friday · 7:30 PM',    note: 'Court 1' },
			{ name: 'Charles Cole', division: "Men's Age Singles: 60+",           time: 'Sunday · 9:00 AM',    note: 'Court 1' },
			// Jordan Deeney
			{ name: 'Jordan Deeney', division: "Men's Doubles: Elite",            time: 'Friday · 6:30 PM',    note: 'Court 4' },
			{ name: 'Jordan Deeney', division: "Men's Singles: Open",             time: 'Saturday · 12:00 PM', note: 'Court 1' },
			{ name: 'Jordan Deeney', division: "Men's Singles: Elite",            time: 'Saturday · 3:00 PM',  note: 'Court 4' },
			// Jonathan Estepan
			{ name: 'Jonathan Estepan', division: "Men's Singles: B",             time: 'Friday · 5:30 PM',    note: 'Court 1' },
			{ name: 'Jonathan Estepan', division: "Men's Doubles: B",             time: 'Saturday · 5:00 PM',  note: 'Court 1' },
			// Alexis Fajardo
			{ name: 'Alexis Fajardo', division: "Men's Doubles: Elite",           time: 'Friday · 7:30 PM',    note: 'Court 2' },
			// Eric Foley
			{ name: 'Eric Foley', division: "Men's Doubles: Centurion+ Open",     time: 'Saturday · 9:00 AM',  note: 'Court 1' },
			{ name: 'Eric Foley', division: "Men's Age Singles: 60+",             time: 'Saturday · 10:00 AM', note: 'Court 2' },
			// Gene Fry
			{ name: 'Gene Fry', division: "Men's Age Singles: 70+",               time: 'Saturday · 2:00 PM',  note: 'Court 2' },
			{ name: 'Gene Fry', division: "Men's Doubles: Super Centurion (120+)", time: 'Saturday · 4:00 PM' },
			// Philip Gaerlan
			{ name: 'Philip Gaerlan', division: "Men's Doubles: Super Centurion (120+)", time: 'Saturday · 10:00 AM', note: 'Court 4' },
			{ name: 'Philip Gaerlan', division: "Men's Age Singles: 70+",         time: 'Saturday · 1:00 PM',  note: 'Court 1' },
			// Jiovanni Garcia
			{ name: 'Jiovanni Garcia', division: "Men's Doubles: Elite",          time: 'Friday · 7:30 PM',    note: 'Court 2' },
			{ name: 'Jiovanni Garcia', division: "Men's Singles: Elite",          time: 'Saturday · 9:00 AM',  note: 'Court 2' },
			{ name: 'Jiovanni Garcia', division: "Men's Doubles: Open",           time: 'Saturday · 2:00 PM' },
			// Scott Gill
			{ name: 'Scott Gill', division: "Men's Singles: B",                   time: 'Saturday · 11:00 AM', note: 'Court 3' },
			{ name: 'Scott Gill', division: "Men's Age Singles: 70+",             time: 'Saturday · 1:00 PM',  note: 'Court 1' },
			// Brian Grantham
			{ name: 'Brian Grantham', division: "Men's Doubles: A",               time: 'Saturday · 1:00 PM',  note: 'Court 4' },
			{ name: 'Brian Grantham', division: "Men's Singles: A",               time: 'Saturday · 6:00 PM',  note: 'Court 4' },
			// Trace Gunsch
			{ name: 'Trace Gunsch', division: "Men's Age Singles: 50+",           time: 'Friday · 6:30 PM',    note: 'Court 1' },
			{ name: 'Trace Gunsch', division: "Men's Singles: Elite",             time: 'Saturday · 8:00 AM',  note: 'Court 3' },
			// Tony Gutierrez
			{ name: 'Tony Gutierrez', division: "Men's Doubles: Centurion+ Open", time: 'Saturday · 10:00 AM', note: 'Court 1' },
			{ name: 'Tony Gutierrez', division: "Men's Doubles: Super Centurion (120+)", time: 'Saturday · 4:00 PM' },
			// Bryon Haacke
			{ name: 'Bryon Haacke', division: "Men's Doubles: Elite",             time: 'Friday · 6:30 PM',    note: 'Court 4' },
			{ name: 'Bryon Haacke', division: "Men's Doubles: Centurion+ Open",   time: 'Saturday · 9:00 AM',  note: 'Court 1' },
			{ name: 'Bryon Haacke', division: "Men's Doubles: A",                 time: 'Sunday · 9:00 AM',    note: 'Court 2' },
			// Scott Haacke
			{ name: 'Scott Haacke', division: "Men's Doubles: Elite",             time: 'Friday · 6:30 PM',    note: 'Court 4' },
			{ name: 'Scott Haacke', division: "Men's Singles: Open",              time: 'Saturday · 9:00 AM',  note: 'Court 3' },
			{ name: 'Scott Haacke', division: "Men's Singles: Elite",             time: 'Saturday · 11:00 AM' },
			// Gordon Henry
			{ name: 'Gordon Henry', division: 'Mixed Doubles: Open/A',            time: 'Friday · 6:30 PM',    note: 'Court 2' },
			{ name: 'Gordon Henry', division: "Men's Singles: A",                 time: 'Saturday · 9:00 AM',  note: 'Court 4' },
			{ name: 'Gordon Henry', division: "Men's Age Singles: 60+",           time: 'Sunday · 8:00 AM',    note: 'Court 3' },
			// Felix Hernandez
			{ name: 'Felix Hernandez', division: "Men's Doubles: Centurion+ Open", time: 'Saturday · 4:00 PM', note: 'Court 1' },
			// Hector Hernandez
			{ name: 'Hector Hernandez', division: "Men's Doubles: A",             time: 'Friday · 5:30 PM',    note: 'Court 4' },
			{ name: 'Hector Hernandez', division: "Men's Doubles: Super Centurion (120+)", time: 'Saturday · 10:00 AM', note: 'Court 4' },
			{ name: 'Hector Hernandez', division: "Men's Doubles: B",             time: 'Sunday · 8:00 AM',    note: 'Court 4' },
			// Alejandro Herrera
			{ name: 'Alejandro Herrera', division: "Men's Singles: Open",         time: 'Saturday · 1:00 PM',  note: 'Court 3' },
			{ name: 'Alejandro Herrera', division: "Men's Doubles: Centurion+ Open", time: 'Saturday · 4:00 PM', note: 'Court 1' },
			// Mario Andres Huyke
			{ name: 'Mario Andres Huyke', division: "Men's Singles: Open",        time: 'Saturday · 9:00 AM',  note: 'Court 3' },
			{ name: 'Mario Andres Huyke', division: "Men's Singles: Elite",       time: 'Saturday · 11:00 AM' },
			{ name: 'Mario Andres Huyke', division: "Men's Doubles: Open",        time: 'Saturday · 4:00 PM',  note: 'Court 3' },
			// Orlando Josu Huyke
			{ name: 'Orlando Josu Huyke', division: "Men's Singles: Elite",       time: 'Saturday · 9:00 AM',  note: 'Court 2' },
			{ name: 'Orlando Josu Huyke', division: "Men's Singles: Open",        time: 'Saturday · 11:00 AM', note: 'Court 2' },
			{ name: 'Orlando Josu Huyke', division: "Men's Doubles: Open",        time: 'Saturday · 4:00 PM',  note: 'Court 3' },
			// Michelle Jennings
			{ name: 'Michelle Jennings', division: 'Mixed Doubles: Open/A',       time: 'Friday · 6:30 PM',    note: 'Court 2' },
			// Ron Jennings
			{ name: 'Ron Jennings', division: "Men's Doubles: A",                 time: 'Friday · 5:30 PM',    note: 'Court 4' },
			{ name: 'Ron Jennings', division: 'Mixed Doubles: Open/A',            time: 'Friday · 6:30 PM',    note: 'Court 2' },
			{ name: 'Ron Jennings', division: "Men's Singles: A",                 time: 'Saturday · 11:00 AM', note: 'Court 1' },
			// John Johnston
			{ name: 'John Johnston', division: "Men's Age Singles: 50+",          time: 'Friday · 7:30 PM',    note: 'Court 1' },
			{ name: 'John Johnston', division: "Men's Doubles: Elite",            time: 'Saturday · 10:00 AM', note: 'Court 3' },
			{ name: 'John Johnston', division: "Men's Doubles: Centurion+ Open",  time: 'Saturday · 5:00 PM',  note: 'Court 4' },
			// Gordon Kelly
			{ name: 'Gordon Kelly', division: "Men's Age Singles: 70+",           time: 'Friday · 6:30 PM',    note: 'Court 3' },
			{ name: 'Gordon Kelly', division: "Men's Singles: C",                 time: 'Saturday · 12:00 PM', note: 'Court 4' },
			// Matt Kern
			{ name: 'Matt Kern', division: "Men's Singles: B",                    time: 'Saturday · 11:00 AM', note: 'Court 4' },
			{ name: 'Matt Kern', division: "Men's Doubles: B",                    time: 'Saturday · 5:00 PM',  note: 'Court 1' },
			// Steven Lewis
			{ name: 'Steven Lewis', division: "Men's Doubles: Super Centurion (120+)", time: 'Saturday · 10:00 AM', note: 'Court 4' },
			// Frank Lopez
			{ name: 'Frank Lopez', division: "Men's Doubles: Elite",              time: 'Saturday · 10:00 AM', note: 'Court 3' },
			{ name: 'Frank Lopez', division: "Men's Doubles: Centurion+ Open",    time: 'Saturday · 5:00 PM',  note: 'Court 4' },
			// Mark Manzano
			{ name: 'Mark Manzano', division: "Men's Singles: B",                 time: 'Friday · 5:30 PM',    note: 'Court 2' },
			{ name: 'Mark Manzano', division: "Men's Doubles: B",                 time: 'Sunday · 9:00 AM',    note: 'Court 3' },
			// Edgar Martinez
			{ name: 'Edgar Martinez', division: "Men's Singles: B",               time: 'Saturday · 8:00 AM',  note: 'Court 1' },
			{ name: 'Edgar Martinez', division: "Men's Doubles: Super Centurion (120+)", time: 'Saturday · 10:00 AM', note: 'Court 4' },
			{ name: 'Edgar Martinez', division: "Men's Doubles: B",               time: 'Sunday · 9:00 AM',    note: 'Court 3' },
			// Ashley Medlock
			{ name: 'Ashley Medlock', division: "Men's Singles: B",               time: 'Friday · 5:30 PM',    note: 'Court 2' },
			{ name: 'Ashley Medlock', division: "Men's Doubles: A",               time: 'Saturday · 1:00 PM',  note: 'Court 4' },
			// Ben Mordkovich
			{ name: 'Ben Mordkovich', division: "Men's Singles: C",               time: 'Saturday · 8:00 AM',  note: 'Court 2' },
			// Jorge Moreno
			{ name: 'Jorge Moreno', division: "Men's Doubles: A",                 time: 'Friday · 5:30 PM',    note: 'Court 4' },
			{ name: 'Jorge Moreno', division: "Men's Singles: Elite",             time: 'Saturday · 8:00 AM',  note: 'Court 3' },
			{ name: 'Jorge Moreno', division: "Men's Singles: A",                 time: 'Saturday · 11:00 AM', note: 'Court 1' },
			// Mauricio Muriel
			{ name: 'Mauricio Muriel', division: "Men's Singles: A",              time: 'Saturday · 6:00 PM',  note: 'Court 4' },
			{ name: 'Mauricio Muriel', division: "Men's Doubles: A",              time: 'Sunday · 9:00 AM',    note: 'Court 2' },
			// Charles Nolan
			{ name: 'Charles Nolan', division: "Men's Doubles: Elite",            time: 'Friday · 7:30 PM',    note: 'Court 2' },
			{ name: 'Charles Nolan', division: "Men's Doubles: Centurion+ Open",  time: 'Saturday · 9:00 AM',  note: 'Court 1' },
			{ name: 'Charles Nolan', division: "Men's Doubles: Open",             time: 'Saturday · 2:00 PM' },
			// Kleber Oliveira
			{ name: 'Kleber Oliveira', division: "Men's Age Singles: 50+",        time: 'Friday · 7:30 PM',    note: 'Court 3' },
			{ name: 'Kleber Oliveira', division: "Men's Doubles: Elite",          time: 'Saturday · 10:00 AM', note: 'Court 3' },
			{ name: 'Kleber Oliveira', division: "Men's Singles: A",              time: 'Saturday · 8:00 PM',  note: 'Court 2' },
			// Russell O'Neal
			{ name: "Russell O'Neal", division: "Men's Singles: A",               time: 'Friday · 4:30 PM',    note: 'Court 4' },
			{ name: "Russell O'Neal", division: "Men's Age Singles: 60+",         time: 'Saturday · 3:00 PM',  note: 'Court 1' },
			// Dylan Pruitt
			{ name: 'Dylan Pruitt', division: "Men's Singles: Open",              time: 'Saturday · 3:00 PM',  note: 'Court 2' },
			// Andres Ramirez
			{ name: 'Andres Ramirez', division: "Men's Doubles: Centurion+ Open", time: 'Saturday · 10:00 AM', note: 'Court 1' },
			{ name: 'Andres Ramirez', division: "Men's Singles: Open",            time: 'Saturday · 2:00 PM',  note: 'Court 4' },
			// Yelandi Rivero
			{ name: 'Yelandi Rivero', division: "Men's Doubles: Centurion+ Open", time: 'Saturday · 10:00 AM', note: 'Court 1' },
			{ name: 'Yelandi Rivero', division: "Men's Doubles: Open",            time: 'Saturday · 4:00 PM',  note: 'Court 3' },
			// Jim Russell
			{ name: 'Jim Russell', division: "Men's Doubles: Elite",              time: 'Friday · 7:30 PM',    note: 'Court 2' },
			{ name: 'Jim Russell', division: "Men's Doubles: A",                  time: 'Saturday · 12:00 PM', note: 'Court 2' },
			{ name: 'Jim Russell', division: 'Mixed Doubles: Open/A',             time: 'Saturday · 2:00 PM',  note: 'Court 3' },
			// Elijah Saunders
			{ name: 'Elijah Saunders', division: "Men's Doubles: Elite",          time: 'Friday · 6:30 PM',    note: 'Court 4' },
			// Timothy Schnellenberger
			{ name: 'Timothy Schnellenberger', division: "Men's Age Singles: 50+", time: 'Friday · 7:30 PM',   note: 'Court 3' },
			{ name: 'Timothy Schnellenberger', division: "Men's Singles: Elite",   time: 'Saturday · 3:00 PM', note: 'Court 3' },
			// Samuel Schulze
			{ name: 'Samuel Schulze', division: "Men's Doubles: Elite",           time: 'Saturday · 12:00 PM', note: 'Court 3' },
			{ name: 'Samuel Schulze', division: "Men's Singles: Open",            time: 'Saturday · 2:00 PM',  note: 'Court 4' },
			{ name: 'Samuel Schulze', division: "Men's Singles: Elite",           time: 'Saturday · 4:00 PM',  note: 'Court 2' },
			// Paul Sotolongo
			{ name: 'Paul Sotolongo', division: "Men's Doubles: A",               time: 'Saturday · 12:00 PM', note: 'Court 2' },
			{ name: 'Paul Sotolongo', division: "Men's Doubles: B",               time: 'Sunday · 9:00 AM',    note: 'Court 3' },
			// Chris Steinheiser
			{ name: 'Chris Steinheiser', division: "Men's Age Singles: 50+",      time: 'Friday · 6:30 PM',    note: 'Court 1' },
			{ name: 'Chris Steinheiser', division: "Men's Singles: Open",         time: 'Saturday · 12:00 PM', note: 'Court 1' },
			{ name: 'Chris Steinheiser', division: "Men's Doubles: Open",         time: 'Saturday · 4:00 PM',  note: 'Court 3' },
			// Don Strickland
			{ name: 'Don Strickland', division: "Men's Doubles: B",               time: 'Saturday · 5:00 PM',  note: 'Court 1' },
			// Wade Stubanas
			{ name: 'Wade Stubanas', division: "Men's Singles: A",                time: 'Friday · 4:30 PM',    note: 'Court 1' },
			{ name: 'Wade Stubanas', division: "Men's Doubles: A",                time: 'Saturday · 1:00 PM',  note: 'Court 4' },
			// Scott Swartz
			{ name: 'Scott Swartz', division: "Men's Doubles: B",                 time: 'Sunday · 8:00 AM',    note: 'Court 4' },
			// Isaac Taylor
			{ name: 'Isaac Taylor', division: "Men's Singles: Elite",             time: 'Saturday · 4:00 PM',  note: 'Court 2' },
			// Darron Toston
			{ name: 'Darron Toston', division: "Men's Doubles: Elite",            time: 'Saturday · 12:00 PM', note: 'Court 3' },
			{ name: 'Darron Toston', division: "Men's Doubles: Open",             time: 'Saturday · 2:00 PM' },
			{ name: 'Darron Toston', division: "Men's Singles: Elite",            time: 'Saturday · 6:00 PM' },
			// Andres Urzua
			{ name: 'Andres Urzua', division: "Men's Doubles: Centurion+ Open",   time: 'Saturday · 9:00 AM',  note: 'Court 1' },
			{ name: 'Andres Urzua', division: "Men's Doubles: A",                 time: 'Saturday · 12:00 PM', note: 'Court 2' },
			// Kelly Van Zant-Russell
			{ name: 'Kelly Van Zant-Russell', division: "Men's Doubles: A",       time: 'Saturday · 12:00 PM', note: 'Court 2' },
			{ name: 'Kelly Van Zant-Russell', division: 'Mixed Doubles: Open/A',  time: 'Saturday · 2:00 PM',  note: 'Court 3' },
			// Robert Yanchis
			{ name: 'Robert Yanchis', division: "Men's Singles: A",               time: 'Friday · 4:30 PM',    note: 'Court 1' },
			{ name: 'Robert Yanchis', division: "Men's Doubles: A",               time: 'Saturday · 1:00 PM',  note: 'Court 4' },
		],
	},
];

// ── Live-results merge ─────────────────────────────────────────────────────
// ocala-results.json is written by scripts/sync-r2-brackets.mjs (GitHub Actions
// cron).  It carries live match scores/winners keyed by match ID (e.g. "MO9").
// We merge at build-time so the static site always reflects the latest snapshot.

interface MatchResult {
	score?: string | null;
	winner?: 1 | 2 | null;
	player1?: string;
	player2?: string;
}

type DivisionResult = Record<string, MatchResult>;

function applyResults(events: EventData[]): EventData[] {
	const divResults = (resultsData as { divisions?: Record<string, DivisionResult> }).divisions ?? {};
	if (!Object.keys(divResults).length) return events;

	// Name-based fallback lookup — used by both SE rounds and RR matches.
	const findByNames = (
		matchMap: DivisionResult,
		a: string,
		b: string,
	): MatchResult | undefined => {
		const ax = a.toLowerCase();
		const bx = b.toLowerCase();
		return Object.values(matchMap).find((r) => {
			const rp1 = (r.player1 ?? '').toLowerCase();
			const rp2 = (r.player2 ?? '').toLowerCase();
			return (rp1 === ax && rp2 === bx) || (rp1 === bx && rp2 === ax);
		});
	};

	return events.map((event) => ({
		...event,
		divisionDetails: event.divisionDetails.map((div) => {
			const matchMap = divResults[div.id];
			if (!matchMap) return div;

			// ── Single Elimination ───────────────────────────────────────────
			if (div.rounds) {
				const updatedRounds = div.rounds.map((round) => ({
					...round,
					matches: round.matches.map((match) => {
						let res: MatchResult | undefined;
						if (match.matchId) res = matchMap[match.matchId];
						if (!res) res = findByNames(matchMap, match.player1, match.player2);
						if (!res) return match;
						return {
							...match,
							...(res.score != null ? { score: res.score } : {}),
							...(res.winner != null ? { winner: res.winner } : {}),
							...(match.player1 === 'TBD' && res.player1 ? { player1: res.player1 } : {}),
							...(match.player2 === 'TBD' && res.player2 ? { player2: res.player2 } : {}),
						};
					}),
				}));
				return { ...div, rounds: updatedRounds };
			}

			// ── Round Robin ──────────────────────────────────────────────────
			// RR matches don't carry matchId in the static data, so the merge
			// uses name-based lookup against the scraped team1/team2 pairs.
			if (div.roundRobinMatches) {
				const updatedRR = div.roundRobinMatches.map((m) => {
					const res = findByNames(matchMap, m.team1, m.team2);
					if (!res) return m;
					return {
						...m,
						...(res.score != null ? { score: res.score } : {}),
						...(res.winner != null ? { winner: res.winner } : {}),
					};
				});
				return { ...div, roundRobinMatches: updatedRR };
			}

			return div;
		}),
	}));
}

export const EVENTS: EventData[] = applyResults(EVENTS_RAW);

function parseDate(dateStr: string, isEnd = false): Date {
	return new Date(`${dateStr}T${isEnd ? '23:59:59' : '00:00:00'}`);
}

export function getEventStatus(event: EventData, now = new Date()): EventStatus {
	const start = parseDate(event.startDate);
	const end = parseDate(event.endDate, true);
	if (now >= start && now <= end) return 'live';
	if (now > end) return 'recent';
	return 'upcoming';
}

export function getFeaturedEvent(now = new Date()): { event: EventData; status: EventStatus } | null {
	if (!EVENTS.length) return null;
	const withDates = EVENTS.map((event) => ({
		event,
		start: parseDate(event.startDate),
		end: parseDate(event.endDate, true),
	}));
	const live = withDates
		.filter(({ start, end }) => now >= start && now <= end)
		.sort((a, b) => b.start.getTime() - a.start.getTime());
	if (live.length) {
		return { event: live[0].event, status: 'live' };
	}
	const recent = withDates
		.filter(({ end }) => now > end)
		.sort((a, b) => b.end.getTime() - a.end.getTime());
	if (recent.length) {
		return { event: recent[0].event, status: 'recent' };
	}
	const upcoming = withDates
		.filter(({ start }) => now < start)
		.sort((a, b) => a.start.getTime() - b.start.getTime());
	if (upcoming.length) {
		return { event: upcoming[0].event, status: 'upcoming' };
	}
	return { event: withDates[0].event, status: 'upcoming' };
}
