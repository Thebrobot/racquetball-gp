import type { APIRoute } from 'astro';
import { getLiveHealth } from '../../../lib/results/live';
import { R2_SYNC_EVENTS } from '../../../lib/results/config';
import { eventWindow, isEventWindowOpen } from '../../../lib/results/window';

export const prerender = false;

export const GET: APIRoute = async () => {
	const health = await getLiveHealth();
	const now = new Date();
	const payload = health ?? {
		version: 1 as const,
		ok: true,
		generatedAt: now.toISOString(),
		scheduler: { lastRunAt: null, lastTrigger: null, skipped: null },
		staleCount: 0,
		quarantineCount: 0,
		lastSuccessAt: null,
		events: R2_SYNC_EVENTS.map((event) => {
			const win = eventWindow(event);
			return {
				slug: event.slug,
				tid: event.tid,
				name: event.name,
				window: {
					start: win.start.toISOString(),
					end: win.end.toISOString(),
					timezone: win.timezone,
					active: isEventWindowOpen(event, now),
				},
				lastSuccessAt: null,
				lastAttemptAt: null,
				status: 'idle' as const,
				staleDivisions: 0,
				quarantineCount: 0,
				divisions: [],
				quarantine: [],
				overridesApplied: [],
			};
		}),
	};

	return new Response(JSON.stringify(payload), {
		status: payload.ok ? 200 : 503,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
		},
	});
};
