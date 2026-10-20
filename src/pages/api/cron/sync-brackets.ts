import type { APIRoute } from 'astro';
import { isAuthorizedSyncRequest, isManualTrigger } from '../../../lib/results/auth';
import { syncBrackets } from '../../../lib/results/sync';

export const prerender = false;
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
	if (!isAuthorizedSyncRequest(request)) {
		return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const manual = isManualTrigger(request);
	const result = await syncBrackets({
		force: manual,
		trigger: manual ? 'manual' : 'cron',
	});

	return new Response(JSON.stringify({ ok: true, ...result }, null, 2), {
		status: 200,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}

export const GET: APIRoute = async ({ request }) => handle(request);
export const POST: APIRoute = async ({ request }) => handle(request);
