import { applyResultsToEvent, EVENTS, getEventStatus, type EventData } from '../../data/events';
import { readLiveResults } from './store';
import { eventsInWindow, isAnyEventInWindow } from './config';

export async function resolveLiveEvent(slug: string | undefined): Promise<EventData | null> {
	if (!slug) return null;
	const base = EVENTS.find((event) => event.slug === slug);
	if (!base) return null;
	try {
		const live = await readLiveResults(slug);
		const divisions = live.divisions ?? {};
		if (!Object.keys(divisions).length) return base;
		return applyResultsToEvent(base, divisions);
	} catch {
		return base;
	}
}

/**
 * Every event, with Blob results merged into the ones currently in a scrape
 * window. Other events keep their bundled results, so this costs at most one
 * Blob read per live event.
 */
export async function resolveLiveEvents(now = new Date()): Promise<EventData[]> {
	const liveSlugs = new Set(eventsInWindow(now).map((e) => e.slug));
	return Promise.all(
		EVENTS.map(async (event) => {
			if (!liveSlugs.has(event.slug)) return event;
			return (await resolveLiveEvent(event.slug)) ?? event;
		}),
	);
}

/** Short cache while any event is live, long otherwise. */
export function applyLiveWindowCacheHeaders(response: Response, now = new Date()): void {
	response.headers.set(
		'Cache-Control',
		isAnyEventInWindow(now) ? 'public, s-maxage=30, stale-while-revalidate=120' : 'public, s-maxage=3600, stale-while-revalidate=86400',
	);
}

export function applyLiveCacheHeaders(response: Response, event: EventData, now = new Date()): void {
	if (getEventStatus(event, now) === 'live') {
		response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
		return;
	}
	response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
}
