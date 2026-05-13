import resultsData from './ocala-results.json';

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
}

export interface EventBracketRound {
	label: string;
	matches: EventBracketMatch[];
}

export type DivisionFormat = 'single' | 'roundrobin';

export interface EventDivisionDetail {
	id: string;
	label: string;
	format: DivisionFormat;
	rounds?: EventBracketRound[];
	roundRobinPlayers?: string[];
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
	/** YouTube / R2 / etc. — shown as "Watch live" on the home spotlight when set */
	spotlightWatchLiveUrl?: string;
}

const EVENTS_RAW: EventData[] = [
	{
		slug: 'ocala-open',
		name: 'Ocala Open',
		cityLine: 'Ocala, FL',
		dateRange: 'May 15–17, 2026',
		startDate: '2026-05-15',
		endDate: '2026-05-17',
		spotlightImage: '/images/stops/ocala-spotlight.webp',
		spotlightVenue: 'Frank DeLuca YMCA',
		spotlightWatchLiveUrl: 'https://www.r2sports.com/tourney/home.asp?TID=53697',
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
						label: 'Quarterfinals',
						matches: [
							{ player1: 'Scott Haacke',     player2: 'Mario Andres Huyke', scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 3' },
							{ player1: 'Amir Baig',        player2: 'Orlando Josu Huyke', scheduledTime: 'Saturday · 11:00 AM', court: 'Court 2' },
							{ player1: 'Jordan Deeney',    player2: 'Chris Steinheiser',  scheduledTime: 'Saturday · 12:00 PM', court: 'Court 1' },
							{ player1: 'Andres Ramirez',   player2: 'Samuel Schulze',     scheduledTime: 'Saturday · 2:00 PM',  court: 'Court 4' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Trace Gunsch',    player2: 'Jorge Moreno',        scheduledTime: 'Saturday · 8:00 AM',  court: 'Court 3' },
							{ player1: 'Jiovanni Garcia', player2: 'Orlando Josu Huyke',  scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 2' },
							{ player1: 'Scott Haacke',    player2: 'Mario Andres Huyke',  scheduledTime: 'Saturday · 11:00 AM' },
							{ player1: 'Samuel Schulze',  player2: 'Darron Toston',       scheduledTime: 'Saturday · 4:00 PM',  court: 'Court 2' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Wade Stubanas',  player2: 'Robert Yanchis', scheduledTime: 'Friday · 4:30 PM',   court: 'Court 1' },
							{ player1: 'Kyle Artman',    player2: "Russell O'Neal", scheduledTime: 'Friday · 4:30 PM',   court: 'Court 4' },
							{ player1: 'Ron Jennings',   player2: 'Jorge Moreno',   scheduledTime: 'Saturday · 11:00 AM', court: 'Court 1' },
							{ player1: 'Brian Grantham', player2: 'Gordon Henry',    scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 4' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Matthew Brice',    player2: 'Jonathan Estepan', scheduledTime: 'Friday · 5:30 PM', court: 'Court 1' },
							{ player1: 'Mark Manzano',     player2: 'Ashley Medlock',   scheduledTime: 'Friday · 5:30 PM', court: 'Court 2' },
							{ player1: 'Ryan Appleby',     player2: 'Mike Caldwell',    scheduledTime: 'Friday · 5:30 PM',    court: 'Court 3' },
							{ player1: 'Havan Artman',     player2: 'Daniel Bray',      scheduledTime: 'Friday · 7:30 PM',    court: 'Court 4' },
							{ player1: 'Edgar Martinez',   player2: 'Matt Kern',         scheduledTime: 'Saturday · 8:00 AM',  court: 'Court 1' },
						],
					},
				],
			},
			{
				id: 'mens-singles-c',
				label: "Men's Singles: C",
				format: 'roundrobin',
				roundRobinPlayers: ['Michael Ammen', 'Ben Mordkovich', 'Gordon Kelly'],
			},
			// ── Age Singles ────────────────────────────────────────────────────────
			{
				id: 'mens-age-50',
				label: "Men's Age Singles: 50+",
				format: 'single',
				rounds: [
					{
						label: 'Round 1',
						matches: [
							{ player1: 'Trace Gunsch',          player2: 'Chris Steinheiser',     scheduledTime: 'Friday · 6:30 PM', court: 'Court 1' },
							{ player1: 'Charles Cole',          player2: 'John Johnston',         scheduledTime: 'Friday · 7:30 PM', court: 'Court 1' },
							{ player1: 'Kleber Oliveira',       player2: 'Timothy Schnellenberger', scheduledTime: 'Friday · 7:30 PM', court: 'Court 3' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Laura Brandt',  player2: 'Eric Foley',      scheduledTime: 'Saturday · 10:00 AM', court: 'Court 2' },
							{ player1: 'Michael Ammen', player2: "Russell O'Neal",  scheduledTime: 'Saturday · 3:00 PM',  court: 'Court 1' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Michael Ammen',  player2: 'Gordon Kelly', scheduledTime: 'Friday · 6:30 PM',   court: 'Court 3' },
							{ player1: 'Philip Gaerlan', player2: 'Scott Gill',   scheduledTime: 'Saturday · 1:00 PM', court: 'Court 1' },
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
			},
			{
				id: 'mens-doubles-elite',
				label: "Men's Doubles: Elite",
				format: 'single',
				rounds: [
					{
						label: 'Round 1',
						matches: [
							{ player1: 'Deeney / Saunders',      player2: 'B. Haacke / S. Haacke', scheduledTime: 'Friday · 6:30 PM',    court: 'Court 4' },
							{ player1: 'Garcia / Nolan',         player2: 'Fajardo / Russell',     scheduledTime: 'Friday · 7:30 PM',    court: 'Court 2' },
							{ player1: 'Johnston / Lopez',       player2: 'Oliveira / TBD',        scheduledTime: 'Saturday · 10:00 AM', court: 'Court 3' },
							{ player1: 'Anthony / Schulze',      player2: 'Beacher / Toston',      scheduledTime: 'Saturday · 12:00 PM', court: 'Court 3' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Artman / Jennings',       player2: 'Hernandez / Moreno',    scheduledTime: 'Friday · 5:30 PM',    court: 'Court 4' },
							{ player1: 'Russell / Van Zant-Russell', player2: 'Sotolongo / Urzua', scheduledTime: 'Saturday · 12:00 PM', court: 'Court 2' },
							{ player1: 'Grantham / Stubanas',     player2: 'Medlock / Yanchis',     scheduledTime: 'Saturday · 1:00 PM',  court: 'Court 4' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Appleby / Kern',      player2: 'Estepan / Strickland', scheduledTime: 'Saturday · 5:00 PM', court: 'Court 1' },
							{ player1: 'Brice / Martinez',    player2: 'Manzano / Sotolongo',  scheduledTime: 'Sunday · 9:00 AM',   court: 'Court 3' },
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
						label: 'Round 1',
						matches: [
							{ player1: 'Foley / Nolan',       player2: 'Haacke / Urzua',        scheduledTime: 'Saturday · 9:00 AM',  court: 'Court 1' },
							{ player1: 'Baig / Rivero',       player2: 'Gutierrez / Ramirez',   scheduledTime: 'Saturday · 10:00 AM', court: 'Court 1' },
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
// cron).  It carries live match scores/winners and any new rounds added as the
// tournament progresses.  We merge it here at build-time so the static site
// always reflects the latest committed snapshot.

interface MatchResult {
	score?: string | null;
	winner?: 1 | 2 | null;
	player1?: string;
	player2?: string;
	scheduledTime?: string;
	court?: string;
}
interface RoundResult {
	label: string;
	matches: MatchResult[];
}
interface DivisionResult {
	rounds?: RoundResult[];
}

function applyResults(events: EventData[]): EventData[] {
	const divResults = (resultsData as { divisions?: Record<string, DivisionResult> }).divisions ?? {};
	if (!Object.keys(divResults).length) return events;

	return events.map((event) => ({
		...event,
		divisionDetails: event.divisionDetails.map((div) => {
			const divResult = divResults[div.id];
			if (!divResult?.rounds || !div.rounds) return div;

			const existingLabels = new Set(div.rounds.map((r) => r.label));

			// Update scores/winners on existing rounds
			const updatedRounds = div.rounds.map((round) => {
				const resultRound = divResult.rounds!.find((r) => r.label === round.label);
				if (!resultRound) return round;
				return {
					...round,
					matches: round.matches.map((match, idx) => {
						const res = resultRound.matches?.[idx];
						if (!res) return match;
						return {
							...match,
							...(res.score != null ? { score: res.score } : {}),
							...(res.winner != null ? { winner: res.winner } : {}),
						};
					}),
				};
			});

			// Append new rounds (semifinals, finals, etc.) added by the scraper
			const newRounds: EventBracketRound[] = divResult.rounds
				.filter((r) => !existingLabels.has(r.label))
				.map((r) => ({
					label: r.label,
					matches: (r.matches ?? []).map((m) => ({
						player1: m.player1 ?? 'TBD',
						player2: m.player2 ?? 'TBD',
						...(m.score != null ? { score: m.score } : {}),
						...(m.winner != null ? { winner: m.winner } : {}),
						...(m.scheduledTime ? { scheduledTime: m.scheduledTime } : {}),
						...(m.court ? { court: m.court } : {}),
					})),
				}));

			return { ...div, rounds: [...updatedRounds, ...newRounds] };
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
