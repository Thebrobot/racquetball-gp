import ocalaFallback from '../../data/ocala-results.json';
import sarasotaFallback from '../../data/sarasota-results.json';
import { EVENT_SKELETONS, type EventData } from '../../data/events';
import { applyResultsToEvent, type DivisionResultMap } from './apply';
import { readActivity, readHealth, readSnapshot, snapshotToDivisionResults } from './store';
import type { EventSnapshot, HealthReport, LiveActivityFeed } from './types';

const FALLBACK: Record<string, { divisions?: Record<string, DivisionResultMap> }> = {
	'ocala-open': ocalaFallback as { divisions?: Record<string, DivisionResultMap> },
	'sarasota-open': sarasotaFallback as { divisions?: Record<string, DivisionResultMap> },
};

type CacheEntry<T> = { at: number; value: T };
const TTL_MS = 15_000;
let eventsCache: CacheEntry<EventData[]> | null = null;

function mergeEvent(event: EventData, snapshot: EventSnapshot | null): EventData {
	if (snapshot?.divisions && Object.keys(snapshot.divisions).length) {
		return applyResultsToEvent(event, snapshotToDivisionResults(snapshot));
	}
	const fallback = FALLBACK[event.slug]?.divisions ?? {};
	return Object.keys(fallback).length ? applyResultsToEvent(event, fallback) : event;
}

export async function getLiveEvents(): Promise<EventData[]> {
	if (eventsCache && Date.now() - eventsCache.at < TTL_MS) return eventsCache.value;
	const events = await Promise.all(
		EVENT_SKELETONS.map(async (event) => mergeEvent(event, await readSnapshot(event.slug))),
	);
	eventsCache = { at: Date.now(), value: events };
	return events;
}

export async function getLiveEvent(slug: string): Promise<EventData | undefined> {
	const events = await getLiveEvents();
	return events.find((e) => e.slug === slug);
}

export async function getLiveActivity(): Promise<LiveActivityFeed> {
	return (
		(await readActivity()) ?? {
			lastUpdated: null,
			eventSlug: EVENT_SKELETONS[0]?.slug ?? 'ocala-open',
			events: [],
		}
	);
}

export async function getLiveHealth(): Promise<HealthReport | null> {
	return readHealth();
}

export function fallbackResultsFor(slug: string): Record<string, DivisionResultMap> {
	return FALLBACK[slug]?.divisions ?? {};
}
