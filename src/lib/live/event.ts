import { applyResultsToEvent, EVENTS, getEventStatus, type EventData } from '../../data/events';
import { readLiveResults } from './store';

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

export function applyLiveCacheHeaders(response: Response, event: EventData, now = new Date()): void {
	if (getEventStatus(event, now) === 'live') {
		response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
		return;
	}
	response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
}
