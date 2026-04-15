/** Grand Prix season stops: homepage bento + tournaments page (single source). */

export type StopKind = 'done' | 'next' | 'upcoming' | 'champ';

export interface SeasonStop {
	id: string;
	/** Named grid cell for homepage bento (CSS grid-template-areas) */
	gridArea: 's1' | 's2' | 'next' | 's4' | 'ch';
	label: string;
	cityLine: string;
	dateHint: string;
	kind: StopKind;
	image: string;
	/** Short name for tournament cards */
	eventName: string;
	/** Full date line for schedule cards */
	dateFull: string;
	/** One line for bento tiles: why this stop matters */
	teaser?: string;
}

/** Four statewide tour stops + season finale (inaugural 2026 season). */
export const TOUR_STOP_COUNT = 4;

export const SEASON_STOPS: SeasonStop[] = [
	{
		id: 'stop-1',
		gridArea: 's1',
		label: 'Stop 1 · Season opener',
		cityLine: 'Ocala, FL',
		dateHint: 'May 2026',
		kind: 'upcoming',
		image: '/images/stops/stop-ocala.webp',
		eventName: 'Ocala Open',
		dateFull: 'May 2026 · Ocala, FL',
		teaser: 'The first Grand Prix stop in history. Be there when the clock starts.',
	},
	{
		id: 'stop-2',
		gridArea: 's2',
		label: 'Stop 2',
		cityLine: 'Tallahassee, FL',
		dateHint: 'June 2026',
		kind: 'upcoming',
		image: '/images/stops/stop-tallahassee.webp',
		eventName: 'Capital City Grand Prix',
		dateFull: 'June 2026 · Tallahassee, FL',
		teaser: 'Capital-city courts under the oaks, where statewide bragging rights start to take shape.',
	},
	{
		id: 'stop-3',
		gridArea: 's4',
		label: 'Stop 3',
		cityLine: 'Sarasota, FL',
		dateHint: 'July 2026',
		kind: 'upcoming',
		image: '/images/stops/stop-sarasota.webp',
		eventName: 'Sarasota Classic',
		dateFull: 'July 2026 · Sarasota, FL',
		teaser: 'Gulf Coast energy, club crowds, and points that reshape the standings.',
	},
	{
		id: 'stop-4',
		gridArea: 'next',
		label: 'Stop 4 · The marquee stop',
		cityLine: 'Miami, FL',
		dateHint: 'August 2026',
		kind: 'next',
		image: '/images/stops/stop-miami.webp',
		eventName: 'Miami Invitational',
		dateFull: 'August 2026 · Miami, FL',
		teaser: 'Big-city lights, elite pace, and the summer swing every player circles on the calendar.',
	},
	{
		id: 'finale',
		gridArea: 'ch',
		label: 'Championship',
		cityLine: 'Ocala, FL',
		dateHint: 'October 2026',
		kind: 'champ',
		image: '/images/stops/stop-championship-ocala.webp',
		eventName: 'Florida GP Championship',
		dateFull: 'October 2026 · Ocala, FL',
		teaser: 'Qualified athletes only: one weekend, one title, one season on the line.',
	},
];
