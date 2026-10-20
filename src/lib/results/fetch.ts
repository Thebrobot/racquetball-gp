const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 20_000;

export class FetchError extends Error {
	status?: number;
	url: string;
	constructor(message: string, url: string, status?: number) {
		super(message);
		this.name = 'FetchError';
		this.url = url;
		this.status = status;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchText(
	url: string,
	opts: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {},
): Promise<{ url: string; html: string; status: number }> {
	const retries = opts.retries ?? 4;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let lastErr: unknown;

	for (let attempt = 0; attempt < retries; attempt++) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetch(url, {
				redirect: 'follow',
				signal: ctrl.signal,
				headers: {
					'User-Agent': UA,
					Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
					'Accept-Language': 'en-US,en;q=0.8',
					...opts.headers,
				},
			});
			const html = await res.text();
			if (res.ok && isRateLimitedHtml(html)) {
				lastErr = new FetchError(`R2 rate-limited ${url}`, res.url, 429);
			} else if (res.ok) {
				return { url: res.url, html, status: res.status };
			} else {
				lastErr = new FetchError(`HTTP ${res.status} for ${url}`, res.url, res.status);
				if (res.status === 404 || res.status === 401 || res.status === 403) break;
			}
		} catch (err) {
			lastErr = err;
		} finally {
			clearTimeout(timer);
		}
		const rateLimited = lastErr instanceof FetchError && lastErr.status === 429;
		const backoff = (rateLimited ? 2500 : 400) * 2 ** attempt + Math.floor(Math.random() * 400);
		await sleep(backoff);
	}

	if (lastErr instanceof Error) throw lastErr;
	throw new FetchError(`Failed to fetch ${url}`, url);
}

export const R2_BASE = 'https://www.r2sports.com';

export function divisionListUrl(tid: string): string {
	return `${R2_BASE}/tourney/divisions/listAllDivs.asp?TID=${encodeURIComponent(tid)}&sortBy=defaultOrder`;
}

export function drawOutUrl(tid: string, divID: number, combinedID: number): string {
	return `${R2_BASE}/tourney/drawsOut/drawOut.asp?TID=${encodeURIComponent(tid)}&divID=${divID}&combinedID=${combinedID}`;
}

export function matchPageUrl(tid: string, matchId: string): string {
	return `${R2_BASE}/r2-push.asp?TID=${encodeURIComponent(tid)}&matchID=${encodeURIComponent(matchId)}`;
}

export function isRateLimitedHtml(html: string): boolean {
	return /too many page views|verify you are not a robot|are not a robot|nothing done, no validation/i.test(html);
}

/** R2 list/draw page before the director activates brackets. */
export function isAwaitingDrawsHtml(html: string): boolean {
	if (isRateLimitedHtml(html)) return false;
	return /no draws|brackets are currently unavailable|draws will be available when activated|all draws will be available/i.test(
		html,
	);
}

export function looksLikeR2Html(html: string): boolean {
	if (isRateLimitedHtml(html)) return false;
	return (
		/viewBracket\(|viewAppMatch\(|r2p-versus-grid|r2p-match-result|listAllDivs/i.test(html) ||
		isAwaitingDrawsHtml(html)
	);
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]!, i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
	return results;
}
