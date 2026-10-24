/**
 * Parse an R2 per-match page (r2-push.asp?TID=&matchID=).
 * Winner is the side marked with a "✓ Winner" label (also `.r2p-side-winner`
 * / `.r2p-winner-badge`). A score with no winner label is not a result.
 */
import { parseHTML } from 'linkedom';
import { cleanPlayerName, formatScore, isPlayerName } from './r2-names';
import { scheduleFromMatchHtml } from './r2-schedule';

type DomEl = {
	textContent: string | null;
	classList?: { contains(name: string): boolean };
	getAttribute?(name: string): string | null;
	querySelector(selector: string): DomEl | null;
	querySelectorAll(selector: string): ArrayLike<DomEl>;
};

type DomDoc = {
	querySelector(selector: string): DomEl | null;
	querySelectorAll(selector: string): ArrayLike<DomEl>;
};

function asDoc(html: string): DomDoc {
	return parseHTML(html).document as unknown as DomDoc;
}

function textOf(el: DomEl | null | undefined): string {
	return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const WINNER_LABEL = /(?:✓|✔|√|&#10003;|&#10004;)\s*Winner|\bWinner\b/i;
const WINNER_CHECK = /(?:✓|✔|√|&#10003;|&#10004;)\s*Winner/i;
const WINNER_MARK_IN_HTML = /r2p-side-winner|r2p-winner-badge|✓\s*Winner|&#10003;\s*Winner/i;
const VERSUS_SIDE_OPEN = /<div[^>]*class=['"][^'"]*r2p-versus-side[^'"]*['"][^>]*>/gi;
const VERSUS_CHIP = /<div[^>]*class=['"][^'"]*r2p-versus-chip[^'"]*['"][^>]*>[\s\S]*?<\/div>/i;

function classAttr(el: DomEl | null | undefined): string {
	return el?.getAttribute?.('class') ?? '';
}

function namesFromChunk(inner: string): string | null {
	const parts = [...inner.matchAll(/<(?:a|span)[^>]*>([^<]+)<\//gi)]
		.map((m) => cleanPlayerName(m[1] ?? ''))
		.filter((n) => n.length >= 2 && !WINNER_LABEL.test(n));
	const joined = parts.join(' / ') || cleanPlayerName(inner.replace(/<[^>]+>/g, ' '));
	return joined || null;
}

function sideName(side: DomEl | null): string | null {
	if (!side) return null;
	const namesRoot = side.querySelector('.r2p-side-names');
	if (!namesRoot) return null;
	const parts = Array.from(namesRoot.querySelectorAll('a, span'))
		.map((el) => cleanPlayerName(textOf(el)))
		.filter((n) => n.length >= 2 && !WINNER_LABEL.test(n));
	const joined = parts.length ? parts.join(' / ') : cleanPlayerName(textOf(namesRoot));
	return joined || null;
}

export function extractMatchScore(text: string): string | null {
	const t = String(text ?? '').replace(/\s+/g, ' ').trim();
	const games = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
	const winByForfeit = /\bWin by forfeit\b/i.test(t);
	const wbf = t.match(/WBF(?:\s*[-–]\s*(?:No\s*Show|Forfeit|[A-Za-z][A-Za-z .]{0,24}))?/i);
	if (games && winByForfeit) return `${formatScore(games[0]!)}, Win by forfeit`;
	if (wbf && !games) return wbf[0]!.replace(/\s+/g, ' ').trim();
	if (games) return formatScore(games[0]!);
	if (winByForfeit) return 'Win by forfeit';
	if (/\bNo\s*Show\b/i.test(t)) return 'WBF - No Show';
	if (/\bForfeit\b/i.test(t)) return 'Win by forfeit';
	return null;
}

function sideHasWinnerLabel(side: DomEl): boolean {
	const cls = classAttr(side);
	if (/\br2p-side-winner\b/.test(cls)) return true;
	if (side.classList?.contains('r2p-side-winner')) return true;
	if (side.querySelector('.r2p-winner-badge')) return true;
	const heading = side.querySelector('.r2p-side-heading');
	if (heading && WINNER_LABEL.test(textOf(heading))) return true;
	if (WINNER_LABEL.test(textOf(side.querySelector('.r2p-winner-badge')))) return true;
	// Player-2 winners put ✓ Winner on the side after VS; read the side text too.
	return WINNER_CHECK.test(textOf(side));
}

function lastVersusChunk(html: string): string | null {
	const opens = [...html.matchAll(new RegExp(VERSUS_SIDE_OPEN.source, 'gi'))];
	const last = opens[opens.length - 1];
	if (!last || last.index == null) return null;
	return html.slice(last.index);
}

function firstVersusChunk(html: string): string | null {
	const open = new RegExp(VERSUS_SIDE_OPEN.source, 'i').exec(html);
	if (!open || open.index == null) return null;
	return html.slice(open.index);
}

/** Each versus card, including the side after the VS chip (player 2). */
function versusSideChunks(html: string): string[] {
	const parts = html.split(VERSUS_CHIP);
	if (parts.length >= 2) {
		const left = lastVersusChunk(parts[0] ?? '');
		const right = firstVersusChunk(parts.slice(1).join('\n'));
		const sides = [left, right].filter((s): s is string => Boolean(s));
		if (sides.length) return sides;
	}
	return [...html.matchAll(new RegExp(VERSUS_SIDE_OPEN.source, 'gi'))]
		.map((m) => (m.index == null ? null : html.slice(m.index)))
		.filter((s): s is string => Boolean(s));
}

function nameFromSideChunk(chunk: string): string | null {
	const names = chunk.match(/r2p-side-names['"][^>]*>([\s\S]*?)<\/div>/i);
	return namesFromChunk(names?.[1] ?? '');
}

function chunkHasWinner(chunk: string): boolean {
	return WINNER_MARK_IN_HTML.test(chunk) || WINNER_CHECK.test(chunk);
}

/** Pull the ✓ Winner side from raw HTML so linkedom class bugs cannot hide it. */
export function winnerNameFromHtml(html: string): { winnerName: string | null; ambiguous: boolean } {
	const marked = versusSideChunks(html)
		.filter(chunkHasWinner)
		.map(nameFromSideChunk)
		.filter((n): n is string => Boolean(n) && isPlayerName(n));
	const unique = [...new Set(marked)];
	if (unique.length > 1) return { winnerName: null, ambiguous: true };
	if (unique.length === 1) return { winnerName: unique[0]!, ambiguous: false };

	// Badge-first: names follow ✓ Winner, including when that badge is after VS.
	const badge = html.match(
		/(?:r2p-winner-badge[^>]*>[\s\S]{0,160}?(?:✓|✔|√|&#10003;|&#10004;)\s*Winner|(?:✓|✔|√|&#10003;|&#10004;)\s*Winner)[\s\S]{0,500}?r2p-side-names['"][^>]*>([\s\S]*?)<\/div>/i,
	);
	const joined = namesFromChunk(badge?.[1] ?? '');
	if (joined && isPlayerName(joined)) return { winnerName: joined, ambiguous: false };
	return { winnerName: null, ambiguous: false };
}

export function htmlLooksLikeMatchPage(html: string): boolean {
	return /r2p-versus-side|r2p-versus-grid|r2p-match-result/i.test(html);
}

export function htmlHasWinnerMark(html: string): boolean {
	return WINNER_MARK_IN_HTML.test(html);
}

/** Compact snippet for status/quarantine when r2-push did not return a match page. */
export function describeBadMatchHtml(html: string, max = 140): string {
	const compact = String(html ?? '').replace(/\s+/g, ' ').trim();
	const snippet = compact.slice(0, max);
	return `match page HTML missing versus/result markup (${compact.length} bytes: ${snippet || 'empty'})`;
}

export type ParsedMatchPage = {
	player1: string | null;
	player2: string | null;
	winnerName: string | null;
	score: string | null;
	winMethod: string | null;
	isFinal: boolean;
	court?: string;
	scheduledTime?: string;
	/** Winner badge present but could not be mapped to exactly one side. */
	ambiguous: boolean;
};

export function parseMatchPage(html: string): ParsedMatchPage {
	const document = asDoc(html);
	let sides = Array.from(document.querySelectorAll('.r2p-versus-side'));
	if (!sides.length) {
		sides = Array.from(document.querySelectorAll('[class*="r2p-versus-side"]'));
	}
	const player1 = sideName(sides[0] ?? null);
	const player2 = sideName(sides[1] ?? null);

	const winnerSides = sides.filter((side) => sideHasWinnerLabel(side));

	let winnerName: string | null = null;
	let ambiguous = false;
	if (winnerSides.length > 1) {
		ambiguous = true;
	} else if (winnerSides.length === 1) {
		winnerName = sideName(winnerSides[0] ?? null);
		if (!winnerName || !isPlayerName(winnerName)) {
			ambiguous = true;
			winnerName = null;
		}
	}

	if (!winnerName && !ambiguous) {
		const raw = winnerNameFromHtml(html);
		winnerName = raw.winnerName;
		ambiguous = raw.ambiguous;
	}

	const resultBox = document.querySelector('.r2p-match-result');
	const scoreStrong = resultBox?.querySelector('strong');
	const score = extractMatchScore(textOf(scoreStrong) || textOf(resultBox));
	const winMethod = textOf(document.querySelector('.r2p-win-method')) || null;
	const isFinal = Boolean(document.querySelector('.r2p-final-badge')) || /r2p-final-badge/i.test(html);
	const schedule = scheduleFromMatchHtml(html);

	return {
		player1: player1 && isPlayerName(player1) ? player1 : player1,
		player2: player2 && isPlayerName(player2) ? player2 : player2,
		winnerName,
		score,
		winMethod,
		isFinal,
		court: schedule.court,
		scheduledTime: schedule.scheduledTime,
		ambiguous,
	};
}

export function matchPageUrl(tid: string, r2MatchId: string): string {
	return `https://www.r2sports.com/r2-push.asp?TID=${tid}&matchID=${encodeURIComponent(r2MatchId)}`;
}
