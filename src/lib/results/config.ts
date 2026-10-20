import type { R2EventConfig } from './types';

/**
 * Sync config is a list of events. Division IDs are discovered from R2 at runtime.
 *
 * Window: `startDate`–`endDate` in `timezone` (default America/New_York).
 * The scheduled job opens at `windowStartHour` (default 6) on startDate and
 * closes at `windowEndHour` (default 8) on the morning after endDate — so a
 * Friday–Sunday stop is Friday 6:00 AM through Monday 8:00 AM Eastern.
 * Manual triggers ignore the window.
 */
export const R2_SYNC_EVENTS: R2EventConfig[] = [
	{
		slug: 'ocala-open',
		tid: '53697',
		name: 'Ocala Open',
		startDate: '2026-05-14',
		endDate: '2026-05-17',
		timezone: 'America/New_York',
		scoreRules: 'usar-adult',
	},
	{
		slug: 'sarasota-open',
		tid: '54249',
		name: 'Sarasota Open',
		startDate: '2026-07-10',
		endDate: '2026-07-12',
		timezone: 'America/New_York',
		scoreRules: 'usar-adult',
	},
	{
		slug: 'port-st-lucie-open',
		tid: '54248',
		name: 'Port St. Lucie Open',
		startDate: '2026-10-23',
		endDate: '2026-10-25',
		timezone: 'America/New_York',
		scoreRules: 'usar-adult',
	},
];

export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_WINDOW_START_HOUR = 6;
export const DEFAULT_WINDOW_END_HOUR = 8;

export function getEventConfig(slug: string): R2EventConfig | undefined {
	return R2_SYNC_EVENTS.find((e) => e.slug === slug);
}

export function getEventConfigByTid(tid: string): R2EventConfig | undefined {
	return R2_SYNC_EVENTS.find((e) => e.tid === tid);
}
