export function cronSecrets(): string[] {
	return [process.env.CRON_SECRET, process.env.RESULTS_SYNC_SECRET].filter((s): s is string => Boolean(s));
}

export function isAuthorizedSyncRequest(request: Request): boolean {
	const secrets = cronSecrets();
	if (!secrets.length) {
		// Local / preview without secrets: allow only non-production.
		return process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production';
	}
	const header = request.headers.get('authorization') ?? '';
	const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
	const query = new URL(request.url).searchParams.get('secret') ?? '';
	return secrets.some((secret) => secret === bearer || secret === query);
}

export function isManualTrigger(request: Request): boolean {
	const url = new URL(request.url);
	if (url.searchParams.get('force') === '1' || url.searchParams.get('manual') === '1') return true;
	const cron = request.headers.get('x-vercel-cron');
	return !cron;
}
