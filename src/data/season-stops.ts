/** Grand Prix season stops: homepage bento + tournaments page (single source). */

export type StopKind = 'done' | 'next' | 'upcoming' | 'champ';

/** Named area in `.season-bento--creative` (see `grand-prix.css` grid-template-areas). */
export type SeasonBentoGridArea = 'marq' | 'c1' | 'c2' | 'wide' | 'champ';

export interface SeasonStop {
	id: string;
	label: string;
	cityLine: string;
	dateHint: string;
	kind: StopKind;
	image: string;
	eventName: string;
	dateFull: string;
	teaser?: string;
	venue: string;
	/** R2 tournament home (registration) or mailto when not on R2 */
	registerUrl: string;
	bentoGridArea: SeasonBentoGridArea;
	/** Wikimedia / stock photo attribution (CC BY-SA), shown on cards */
	photoCredit?: string;
	/** On-site brackets hub (e.g. `/events/ocala-open#brackets`); omit when not published yet */
	bracketsHref?: string;
	/** On-site participants list (e.g. `/events/ocala-open/participants`); omit when not published yet */
	participantsHref?: string;
	/** R2 tournament home / live scores; shows “Watch live” on tournament cards when set */
	watchLiveUrl?: string;
}

export const TOUR_STOP_COUNT = 4;

export const SEASON_STOPS: SeasonStop[] = [
	{
		id: 'stop-1',
		label: 'Lap 1 · Season opener',
		cityLine: 'Ocala, FL',
		dateHint: 'May 14–17',
		kind: 'next',
		image: '/images/stops/ocala-spotlight.webp',
		eventName: 'Ocala Open',
		dateFull: 'May 14–17, 2026 · Ocala, FL',
		teaser: 'The first Grand Prix stop in history. Be there when the clock starts.',
		venue: 'Frank DeLuca YMCA',
		registerUrl: 'https://www.r2sports.com/tourney/home.asp?TID=53697',
		bentoGridArea: 'marq',
		bracketsHref: '/events/ocala-open#brackets',
		participantsHref: '/events/ocala-open#participants',
		watchLiveUrl: 'https://www.r2sports.com/tourney/home.asp?TID=53697',
	},
	{
		id: 'stop-2',
		label: 'Lap 2',
		cityLine: 'Sarasota, FL',
		dateHint: 'Jul 10–12',
		kind: 'upcoming',
		image: '/images/stops/stop-sarasota.webp',
		eventName: 'Sarasota Open',
		dateFull: 'July 10–12, 2026 · Sarasota, FL',
		teaser: 'Gulf Coast energy at the Sarasota YMCA—full brackets and Grand Prix points on the line.',
		venue: 'Sarasota YMCA',
		registerUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54249',
		bentoGridArea: 'c1',
		watchLiveUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54249',
	},
	{
		id: 'stop-3',
		label: 'Lap 3',
		cityLine: 'Port St. Lucie, FL',
		dateHint: 'Oct 23–25',
		kind: 'upcoming',
		image: '/images/stops/stop-port-st-lucie.webp',
		eventName: 'Port St. Lucie Open',
		dateFull: 'October 23–25, 2026 · Port St. Lucie, FL',
		teaser: 'Treasure Coast racquetball at the civic center—late-season points and playoff positioning.',
		venue: 'Civic Center',
		registerUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54248',
		bentoGridArea: 'c2',
		watchLiveUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54248',
		photoCredit:
			'Photo: Port St. Lucie City Hall — Birbie28 / Wikimedia Commons (CC BY-SA 4.0). Civic Center hosts the tournament.',
	},
	{
		id: 'stop-4',
		label: 'Lap 4 · Last 2026 tour stop',
		cityLine: 'Eustis, FL',
		dateHint: 'Dec 4–5',
		kind: 'upcoming',
		image: '/images/stops/stop-eustis-outdoor.webp',
		eventName: 'Eustis Outdoor Open',
		dateFull: 'December 4–5, 2026 · Eustis, FL',
		teaser: 'Outdoor racquetball at Sunset Island—final Grand Prix tour weekend of 2026.',
		venue: 'Sunset Island (outdoor)',
		registerUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54247',
		bentoGridArea: 'wide',
		watchLiveUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54247',
		photoCredit:
			'Photo: Lake Eustis Lakewalk — Ebyabe / Wikimedia Commons (CC BY-SA 3.0). Sunset Island hosts the outdoor event.',
	},
];

/** Series championship after the four scored tour stops; details TBD. */
export const SERIES_CHAMPIONSHIP: SeasonStop = {
	id: 'series-championship',
	label: 'Series championship',
	cityLine: 'Location TBD',
	dateHint: '2027',
	kind: 'champ',
	image: '/images/stops/series-championship.webp',
	eventName: 'Grand Prix Series Championship',
	dateFull: '2027 · Location TBD',
	teaser:
		'Season-capping championship weekend. Host city and dates to be announced; pending USA Racquetball approval.',
	venue: 'TBD',
	registerUrl: '#',
	bentoGridArea: 'champ',
	photoCredit: 'Photo: Ocala downtown — drinkteatravel.com',
};

/** Homepage bento, tournaments grid, and hero strip: tour stops plus series championship. */
export const GRAND_PRIX_FULL_SCHEDULE: SeasonStop[] = [...SEASON_STOPS, SERIES_CHAMPIONSHIP];
