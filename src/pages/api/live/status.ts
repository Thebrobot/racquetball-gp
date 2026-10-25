import type { APIRoute } from 'astro';
import { json } from '../../../lib/accounts/supabase';
import { isAnyEventInWindow } from '../../../lib/live/config';
import { backoffFields } from '../../../lib/live/r2-match-fetch';
import { readSyncStatus } from '../../../lib/live/store';

export const prerender = false;

const STALE_MS = 20 * 60 * 1000;

export const GET: APIRoute = async () => {
	const now = new Date();
	const status = await readSyncStatus();
	const inWindow = isAnyEventInWindow(now);
	const lastSuccess = status.lastSuccessAt ? Date.parse(status.lastSuccessAt) : NaN;
	const stale = inWindow && (!Number.isFinite(lastSuccess) || now.getTime() - lastSuccess > STALE_MS);
	const remaining = status.r2SkipRunsRemaining ?? status.backoffRemaining ?? 0;
	return json(
		{
			...status,
			inWindow,
			stale,
			ok: status.ok && !stale && !status.r2Blocked,
			now: now.toISOString(),
			...backoffFields(status.lastRunAt, remaining, now),
		},
		200,
		{ 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' },
	);
};
