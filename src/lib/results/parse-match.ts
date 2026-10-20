import { decodeEntities, normalizeSpace, stripTags } from './html';
import { normalizeMatchCode } from './parse-draw';
import type { MatchStatus, ParsedMatch } from './types';

function extractSection(html: string, startRe: RegExp, endRe: RegExp): string {
	const start = html.search(startRe);
	if (start < 0) return '';
	const rest = html.slice(start);
	const end = rest.search(endRe);
	return end > 0 ? rest.slice(0, end) : rest.slice(0, 8000);
}

function namesFromSide(block: string): string[] {
	const fromLinks = [...block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) =>
		normalizeSpace(stripTags(m[1] ?? '')),
	);
	const fromSpans = [...block.matchAll(/<span>([\s\S]*?)<\/span>/gi)].map((m) =>
		normalizeSpace(stripTags(m[1] ?? '')),
	);
	const names = (fromLinks.length ? fromLinks : fromSpans).filter((n) => n && !/^winner$/i.test(n));
	return names;
}

function formatSideName(names: string[]): string | null {
	if (!names.length) return null;
	if (names.length === 1) return names[0]!;
	return names.join(' / ');
}

function classifyStatus(winMethod: string | null, score: string | null, player1: string | null, player2: string | null): MatchStatus {
	const method = (winMethod ?? '').toLowerCase();
	const p1 = (player1 ?? '').trim().toUpperCase();
	const p2 = (player2 ?? '').trim().toUpperCase();
	if (p1 === 'BYE' || p2 === 'BYE') return 'bye';
	if (/wbf|forfeit|default|no[\s-]?show/.test(method) || /wbf|forfeit|default|no[\s-]?show/.test(score ?? '')) {
		return 'forfeit';
	}
	if (/in[\s-]?progress|live/.test(method)) return 'in_progress';
	if (/played/.test(method)) return 'played';
	if (/bye/.test(method)) return 'bye';
	if (!score && !method) return 'unplayed';
	if (/scheduled|not played|unplayed/.test(method)) return 'unplayed';
	if (score) return 'played';
	return 'unknown';
}

function parseScheduled(raw: string | null): { court: string | null; scheduled: string | null } {
	if (!raw) return { court: null, scheduled: null };
	const text = normalizeSpace(raw);
	const court = text.match(/Court\s+(\w+)/i)?.[0] ?? null;
	const scheduled = text.replace(/^Court\s+\w+\s*[·•\-]+\s*/i, '').trim() || text;
	return { court, scheduled };
}

/**
 * Parse an r2-push.asp match page. Content is in the first HTML response
 * (r2p-* classes); no browser is required.
 */
export function parseMatchPage(html: string, r2MatchId: string): ParsedMatch {
	const card = extractSection(html, /<section[^>]*r2p-card r2p-content/i, /<section[^>]*r2p-card r2p-event/i) || html;

	const heading = card.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
	const roundLabel = normalizeSpace(stripTags(heading.replace(/Match\s*#\s*\d+/i, ''))) || null;

	const sideBlocks = card.split(/<div class=['"]r2p-versus-side/i).slice(1);
	const parsedSides = sideBlocks.slice(0, 2).map((block) => {
		const cut = block.search(/<div class=['"]r2p-versus-chip|<div class=['"]r2p-versus-side|<div class="r2p-match-result"/i);
		const inner = cut >= 0 ? block.slice(0, cut) : block;
		const namesBlock = inner.match(/r2p-side-names['"]?>([\s\S]*?)<\/div>/i)?.[1] ?? inner;
		const names = namesFromSide(namesBlock);
		const isWinner = /r2p-side-winner|r2p-winner-badge/i.test(block.slice(0, 400)) || /r2p-winner-badge/i.test(inner);
		return { name: formatSideName(names), isWinner, names };
	});

	// Fallback: title "A vs B"
	const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
	const vsTitle = decodeEntities(title).match(/^\s*(.+?)\s+vs\.?\s+(.+?)\s+\|/i);

	let player1 = parsedSides[0]?.name ?? null;
	let player2 = parsedSides[1]?.name ?? null;
	if ((!player1 || !player2) && vsTitle) {
		player1 = player1 ?? normalizeSpace(vsTitle[1]!);
		player2 = player2 ?? normalizeSpace(vsTitle[2]!);
	}

	let winner: 1 | 2 | null = null;
	if (parsedSides[0]?.isWinner && !parsedSides[1]?.isWinner) winner = 1;
	else if (parsedSides[1]?.isWinner && !parsedSides[0]?.isWinner) winner = 2;

	const score = (() => {
		const raw = card.match(/r2p-match-result[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)?.[1];
		const text = raw ? normalizeSpace(stripTags(raw)) : null;
		if (!text || text === '-' || /^tbd$/i.test(text)) return null;
		return text.replace(/[–—]/g, '-');
	})();

	const winMethod = (() => {
		const raw = card.match(/r2p-win-method['"]?>([\s\S]*?)<\/span>/i)?.[1];
		return raw ? normalizeSpace(stripTags(raw)) : null;
	})();

	const schedRaw = card.match(/r2p-scheduled['"]?>([\s\S]*?)<\/p>/i)?.[1] ?? null;
	const { court, scheduled } = parseScheduled(schedRaw ? stripTags(schedRaw) : null);

	const divBlock = card.match(/r2p-match-division[\s\S]*?<strong>\(([^)]+)\)<\/strong>\s*([^<]*)/i);
	const divisionCode = divBlock ? normalizeSpace(divBlock[1]!).replace(/\s+/g, '') : null;
	const divisionLabel = divBlock ? normalizeSpace(divBlock[2] ?? '') || null : null;

	const matchNum = card.match(/Match\s*#\s*(\d+)/i)?.[1];
	const matchId = divisionCode && matchNum ? normalizeMatchCode(`${divisionCode}${matchNum}`) : null;

	const isDoubles = (parsedSides[0]?.names.length ?? 0) > 1 || (parsedSides[1]?.names.length ?? 0) > 1 || /\s\/\s/.test(player1 ?? '') || /\s\/\s/.test(player2 ?? '');

	const status = classifyStatus(winMethod, score, player1, player2);

	return {
		r2MatchId,
		matchId,
		player1,
		player2,
		winner,
		score,
		status,
		winMethod,
		roundLabel,
		court,
		scheduled,
		divisionCode,
		divisionLabel,
		isDoubles,
	};
}

export function parsedMatchesEqual(a: ParsedMatch, b: ParsedMatch): boolean {
	return (
		a.r2MatchId === b.r2MatchId &&
		a.player1 === b.player1 &&
		a.player2 === b.player2 &&
		a.winner === b.winner &&
		a.score === b.score &&
		a.status === b.status &&
		a.winMethod === b.winMethod
	);
}
