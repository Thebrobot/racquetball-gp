import { normalizeSpace, stripTags } from './html';
import type { DrawFormat, DrawMatchRef, ParsedDraw } from './types';

const MATCH_CODE_RE = /[A-Z][A-Z0-9+/]{0,10}\s*\d{1,3}/i;

export function normalizeMatchCode(raw: string): string {
	const t = normalizeSpace(raw).replace(/\s+/g, '');
	return t;
}

export function inferDrawFormat(url: string, title: string, html: string): DrawFormat {
	const blob = `${url} ${title} ${html.slice(0, 4000)}`.toLowerCase();
	if (blob.includes('roundrobin')) return 'roundrobin';
	if (blob.includes('olympic')) return 'olympic';
	if (blob.includes('playoff')) return 'playoff';
	if (blob.includes('pool play') || blob.includes('poolplay')) return 'pool';
	if (blob.includes('view-bracket') || blob.includes('single elimination') || blob.includes('consolation')) {
		return 'elimination';
	}
	return 'unknown';
}

function extractTitle(html: string): string {
	const m = html.match(/<title>([\s\S]*?)<\/title>/i);
	return normalizeSpace(stripTags(m?.[1] ?? ''));
}

function extractHeaderCode(html: string, title: string): string | null {
	const fromTitle = title.match(/^\(([^)]+)\)/);
	if (fromTitle) return normalizeSpace(fromTitle[1]!).replace(/\s+/g, '');
	const fromBody = html.match(/\(\s*([A-Z][A-Z0-9+/]*)\s*\)\s*(?:Men|Women|Mixed|Boy|Girl|Open)/i);
	return fromBody ? fromBody[1] : null;
}

/**
 * Collect numeric viewAppMatch IDs and the visible match code next to each link.
 * Works for view-bracket.asp (elimination / Olympic / consolation) and roundRobin.asp.
 */
export function parseDrawPage(
	html: string,
	opts: { divID: number; combinedID: number; finalUrl: string },
): ParsedDraw {
	const title = extractTitle(html);
	const format = inferDrawFormat(opts.finalUrl, title, html);
	const matches: DrawMatchRef[] = [];
	const seen = new Set<string>();

	for (const m of html.matchAll(/javascript:viewAppMatch\((\d+)\)[^>]*>([\s\S]*?)<\/a>/gi)) {
		const r2MatchId = m[1]!;
		if (seen.has(r2MatchId)) continue;
		const rawCode = normalizeSpace(stripTags(m[2] ?? ''));
		const codeMatch = rawCode.match(MATCH_CODE_RE);
		const matchId = normalizeMatchCode(codeMatch?.[0] ?? rawCode);
		if (!matchId && !r2MatchId) continue;
		seen.add(r2MatchId);
		matches.push({ r2MatchId, matchId: matchId || r2MatchId });
	}

	// Fallback: IDs without a capturable label.
	for (const m of html.matchAll(/viewAppMatch\((\d+)\)/g)) {
		const r2MatchId = m[1]!;
		if (seen.has(r2MatchId)) continue;
		seen.add(r2MatchId);
		matches.push({ r2MatchId, matchId: r2MatchId });
	}

	const relatedDraws: ParsedDraw['relatedDraws'] = [];
	const relatedSeen = new Set<string>();
	for (const m of html.matchAll(/viewBracket\((\d+)\s*,\s*(\d+)\)/gi)) {
		const divID = Number(m[1]);
		const combinedID = Number(m[2]);
		const key = `${divID}:${combinedID}`;
		if (relatedSeen.has(key)) continue;
		if (divID === opts.divID && combinedID === opts.combinedID) continue;
		if (divID === 0 && combinedID === 0) continue;
		relatedSeen.add(key);
		relatedDraws.push({ divID, combinedID });
	}

	return {
		divID: opts.divID,
		combinedID: opts.combinedID,
		finalUrl: opts.finalUrl,
		format,
		title,
		code: extractHeaderCode(html, title),
		label: title.replace(/^\([^)]+\)\s*/, '').split(' - ')[0] ?? title,
		matches,
		relatedDraws,
	};
}
