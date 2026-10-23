import type { APIRoute } from 'astro';
import { createAdminClient, env, json } from '../../../lib/accounts/supabase';
import { processResultFeed, type ResultFeed } from '../../../lib/notify/results';

export const prerender = false;

let lastRun = 0;

/**
 * Turn new live results into notifications. Idempotent, so anyone may call it:
 * the live page pings it when the feed changes, and the cron secret works too.
 * Reads this deployment's own /data/live-activity.json.
 */
async function run(origin: string): Promise<Response> {
	const admin = createAdminClient();
	if (!admin) return json({ ok: false, error: 'Not configured.' }, 503);
	// Cheap throttle per function instance; result_events makes it safe regardless.
	if (Date.now() - lastRun < 15_000) return json({ ok: true, throttled: true });
	lastRun = Date.now();
	const feed = (await fetch(new URL('/data/live-activity.json', origin), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as ResultFeed | null;
	if (!feed) return json({ ok: false, error: 'No feed.' }, 502);
	const result = await processResultFeed(admin, feed);
	return json({ ok: true, ...result });
}

export const POST: APIRoute = async ({ url }) => run(url.origin);
export const GET: APIRoute = async ({ request, url }) => {
	const secret = env('CRON_SECRET');
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Unauthorized' }, 401);
	lastRun = 0;
	return run(url.origin);
};
