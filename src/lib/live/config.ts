export type EventKey = 'ocala' | 'sarasota' | 'psl';

export type DivisionUrl = {
	code: string;
	divID: number;
	combinedID: number;
};

export type LiveEventConfig = {
	key: EventKey;
	slug: string;
	tid: string;
	divisionLabels: Record<string, string>;
	codeIdMap: Record<string, string>;
	divisionUrls: DivisionUrl[];
	/** Inclusive UTC start of the Fri–Sun scrape window. */
	windowStart: string;
	/** Exclusive UTC end of the scrape window (Monday buffer). */
	windowEnd: string;
};

export const LIVE_EVENTS: Record<EventKey, LiveEventConfig> = {
	ocala: {
		key: 'ocala',
		slug: 'ocala-open',
		tid: '53697',
		windowStart: '2026-05-14T04:00:00.000Z',
		windowEnd: '2026-05-18T06:00:00.000Z',
		divisionLabels: {
			'mens-singles-open': "Men's Singles: Open",
			'mens-singles-elite': "Men's Singles: Elite",
			'mens-singles-a': "Men's Singles: A",
			'mens-singles-b': "Men's Singles: B",
			'mens-singles-c': "Men's Singles: C",
			'mens-age-50': "Men's Age Singles: 50+",
			'mens-age-60': "Men's Age Singles: 60+",
			'mens-age-70': "Men's Age Singles: 70+",
			'mens-doubles-open': "Men's Doubles: Open",
			'mens-doubles-elite': "Men's Doubles: Elite",
			'mens-doubles-a': "Men's Doubles: A",
			'mens-doubles-b': "Men's Doubles: B",
			'mens-doubles-centurion': "Men's Doubles: Centurion+ Open",
			'mens-doubles-super-centurion': "Men's Doubles: Super Centurion (120+)",
			'mixed-doubles': 'Mixed Doubles: Open/A',
		},
		codeIdMap: {
			MO: 'mens-singles-open',
			ME: 'mens-singles-elite',
			MA: 'mens-singles-a',
			MB: 'mens-singles-b',
			MC: 'mens-singles-c',
			'M50+': 'mens-age-50',
			'M60+': 'mens-age-60',
			'M70+': 'mens-age-70',
			MOD: 'mens-doubles-open',
			MED: 'mens-doubles-elite',
			MAD: 'mens-doubles-a',
			MBD: 'mens-doubles-b',
			MCOD: 'mens-doubles-centurion',
			MSCD: 'mens-doubles-super-centurion',
			MXOA: 'mixed-doubles',
		},
		divisionUrls: [
			{ code: 'MO', divID: 2, combinedID: 0 },
			{ code: 'ME', divID: 753, combinedID: 0 },
			{ code: 'MA', divID: 3, combinedID: 0 },
			{ code: 'MB', divID: 4, combinedID: 0 },
			{ code: 'MC', divID: 5, combinedID: 0 },
			{ code: 'M50+', divID: 22, combinedID: 0 },
			{ code: 'M60+', divID: 26, combinedID: 0 },
			{ code: 'M70+', divID: 30, combinedID: 0 },
			{ code: 'MOD', divID: 68, combinedID: 0 },
			{ code: 'MED', divID: 756, combinedID: 0 },
			{ code: 'MAD', divID: 69, combinedID: 0 },
			{ code: 'MBD', divID: 70, combinedID: 0 },
			{ code: 'MCOD', divID: 10146, combinedID: 0 },
			{ code: 'MSCD', divID: 28003, combinedID: 0 },
			{ code: 'MXOA', divID: 0, combinedID: 236959 },
		],
	},
	sarasota: {
		key: 'sarasota',
		slug: 'sarasota-open',
		tid: '54249',
		windowStart: '2026-08-21T04:00:00.000Z',
		windowEnd: '2026-08-24T06:00:00.000Z',
		divisionLabels: {
			'mens-singles-open': "Men's Singles: Open",
			'mens-singles-elite': "Men's Singles: Elite",
			'mens-singles-a': "Men's Singles: A",
			'mens-singles-b': "Men's Singles: B",
			'mens-singles-c': "Men's Singles: C",
			'mens-age-3040': "Men's Age Singles: 30/40+",
			'mens-age-50': "Men's Age Singles: 50+",
			'mens-age-60': "Men's Age Singles: 60+",
			'mens-age-70': "Men's Age Singles: 70+",
			'mens-doubles-open': "Men's Doubles: Open",
			'mens-doubles-elite': "Men's Doubles: Elite",
			'mens-doubles-a': "Men's Doubles: A",
			'mens-doubles-b': "Men's Doubles: B",
			'mens-doubles-centurion': "Men's Doubles: Centurion/",
		},
		codeIdMap: {
			MO: 'mens-singles-open',
			ME: 'mens-singles-elite',
			MA: 'mens-singles-a',
			MB: 'mens-singles-b',
			MC: 'mens-singles-c',
			M3040: 'mens-age-3040',
			'M50+': 'mens-age-50',
			'M60+': 'mens-age-60',
			'M70+': 'mens-age-70',
			MOD: 'mens-doubles-open',
			MED: 'mens-doubles-elite',
			MAD: 'mens-doubles-a',
			MBD: 'mens-doubles-b',
			MDS: 'mens-doubles-centurion',
		},
		divisionUrls: [
			{ code: 'MO', divID: 2, combinedID: 0 },
			{ code: 'ME', divID: 753, combinedID: 0 },
			{ code: 'MA', divID: 3, combinedID: 0 },
			{ code: 'MB', divID: 4, combinedID: 0 },
			{ code: 'MC', divID: 5, combinedID: 0 },
			{ code: 'M3040', divID: 0, combinedID: 237435 },
			{ code: 'M50+', divID: 22, combinedID: 0 },
			{ code: 'M60+', divID: 26, combinedID: 0 },
			{ code: 'M70+', divID: 30, combinedID: 0 },
			{ code: 'MOD', divID: 68, combinedID: 0 },
			{ code: 'MED', divID: 756, combinedID: 0 },
			{ code: 'MAD', divID: 69, combinedID: 0 },
			{ code: 'MBD', divID: 70, combinedID: 0 },
			{ code: 'MDS', divID: 0, combinedID: 237436 },
		],
	},
	psl: {
		key: 'psl',
		slug: 'port-st-lucie-open',
		tid: '54248',
		// Friday 00:00 ET Oct 23 through Monday 02:00 ET Oct 26 (same end as the GH Action).
		windowStart: '2026-10-23T04:00:00.000Z',
		windowEnd: '2026-10-26T06:00:00.000Z',
		divisionLabels: {
			'mens-singles-open': "Men's Singles: Open",
			'mens-singles-elite': "Men's Singles: Elite",
			'mens-singles-a': "Men's Singles: A",
			'mens-singles-b': "Men's Singles: B",
			'mens-age-3040': "Men's Age Singles: 24/30/40",
			'mens-age-50': "Men's Age Singles: 50+",
			'mens-age-60': "Men's Age Singles: 60+",
			'mens-doubles-open': "Men's Doubles: Open",
			'mens-doubles-elite': "Men's Doubles: Elite",
			'mens-doubles-a': "Men's Doubles: A",
			'mens-doubles-b': "Men's Doubles: B",
			'mens-doubles-centurion': "Men's Doubles: Centurion/Super",
		},
		codeIdMap: {
			MO: 'mens-singles-open',
			ME: 'mens-singles-elite',
			MA: 'mens-singles-a',
			MB: 'mens-singles-b',
			M3040: 'mens-age-3040',
			'M50+': 'mens-age-50',
			'M60+': 'mens-age-60',
			MOD: 'mens-doubles-open',
			MED: 'mens-doubles-elite',
			MAD: 'mens-doubles-a',
			MBD: 'mens-doubles-b',
			MCSD: 'mens-doubles-centurion',
		},
		divisionUrls: [
			{ code: 'MO', divID: 2, combinedID: 0 },
			{ code: 'ME', divID: 753, combinedID: 0 },
			{ code: 'MA', divID: 3, combinedID: 0 },
			{ code: 'MB', divID: 4, combinedID: 0 },
			{ code: 'M3040', divID: 0, combinedID: 239162 },
			{ code: 'M50+', divID: 22, combinedID: 0 },
			{ code: 'M60+', divID: 26, combinedID: 0 },
			{ code: 'MOD', divID: 68, combinedID: 0 },
			{ code: 'MED', divID: 756, combinedID: 0 },
			{ code: 'MAD', divID: 69, combinedID: 0 },
			{ code: 'MBD', divID: 70, combinedID: 0 },
			{ code: 'MCSD', divID: 0, combinedID: 239171 },
		],
	},
};

export const LIVE_EVENT_BY_SLUG = Object.fromEntries(
	Object.values(LIVE_EVENTS).map((event) => [event.slug, event]),
) as Record<string, LiveEventConfig>;

export function drawOutUrl(event: LiveEventConfig, divID: number, combinedID: number): string {
	return `https://www.r2sports.com/tourney/drawsOut/drawOut.asp?TID=${event.tid}&divID=${divID}&combinedID=${combinedID}`;
}

export function eventsInWindow(now = new Date(), force = false): LiveEventConfig[] {
	if (force) {
		return Object.values(LIVE_EVENTS).filter((event) => {
			const end = Date.parse(event.windowEnd);
			return Number.isFinite(end) && now.getTime() <= end + 7 * 24 * 60 * 60 * 1000;
		});
	}
	return Object.values(LIVE_EVENTS).filter((event) => isEventInWindow(event, now));
}

export function isEventInWindow(event: LiveEventConfig, now = new Date()): boolean {
	const start = Date.parse(event.windowStart);
	const end = Date.parse(event.windowEnd);
	const t = now.getTime();
	return Number.isFinite(start) && Number.isFinite(end) && t >= start && t < end;
}

export function isAnyEventInWindow(now = new Date()): boolean {
	return Object.values(LIVE_EVENTS).some((event) => isEventInWindow(event, now));
}
