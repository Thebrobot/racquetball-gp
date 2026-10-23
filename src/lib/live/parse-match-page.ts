/**
 * Parse an R2 per-match page (r2-push.asp?TID=&matchID=).
 * Winner is the side marked with a "✓ Winner" label (also `.r2p-side-winner`
 * / `.r2p-winner-badge`). A score with no winner label is not a result.
 */
import { parseHTML } from 'linkedom';
import { cleanPlayerName, formatScore, isPlayerName } from './r2-names';
import { parseMatchPageSchedule } from './r2-schedule';

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

function classAttr(el: DomEl | null | undefined): string {
	return el?.getAttribute?.('class') ?? '';
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
	const t = String(text ?? '');
	const wbf = t.match(/WBF(?:\s*[-–]\s*(?:No\s*Show|Forfeit|[A-Za-z][A-Za-z .]{0,24}))?/i);
	if (wbf) return wbf[0].replace(/\s+/g, ' ').trim();
	const noShow = t.match(/\bNo\s*Show\b/i);
	if (noShow) return 'WBF - No Show';
	const forfeit = t.match(/\bForfeit\b/i);
	if (forfeit) return 'Forfeit';
	const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
	return m ? formatScore(m[0]) : null;
}

function sideHasWinnerLabel(side: DomEl): boolean {
	const cls = classAttr(side);
	if (/\br2p-side-winner\b/.test(cls)) return true;
	if (side.classList?.contains('r2p-side-winner')) return true;
	if (side.querySelector('.r2p-winner-badge')) return true;
	const heading = side.querySelector('.r2p-side-heading');
	if (heading && WINNER_LABEL.test(textOf(heading))) return true;
	return WINNER_LABEL.test(textOf(side.querySelector('.r2p-winner-badge')));
}

function parseWinnerFromRawHtml(html: string): { winnerName: string | null; ambiguous: boolean } {
	const blocks = [...html.matchAll(/<div[^>]*class=['"][^'"]*r2p-versus-side[^'"]*['"][^>]*>[\s\S]*?(?=<div[^>]*class=['"][^'"]*r2p-versus-side|<\/div>\s*<div class="r2p-versus-chip"|<div class="r2p-match-result")/gi)];
	const marked: string[] = [];
	for (const block of blocks) {
		const chunk = block[0] ?? '';
		if (!/r2p-side-winner|r2p-winner-badge|✓\s*Winner|&#10003;\s*Winner/i.test(chunk)) continue;
		const names = chunk.match(/r2p-side-names['"][^>]*>([\s\S]*?)<\/div>/i);
		const inner = names?.[1] ?? '';
		const parts = [...inner.matchAll(/<(?:a|span)[^>]*>([^<]+)<\//gi)]
			.map((m) => cleanPlayerName(m[1] ?? ''))
			.filter((n) => n.length >= 2 && !WINNER_LABEL.test(n));
		const joined = parts.join(' / ') || cleanPlayerName(inner.replace(/<[^>]+>/g, ' '));
		if (joined) marked.push(joined);
	}
	if (marked.length > 1) return { winnerName: null, ambiguous: true };
	if (marked.length === 1 && isPlayerName(marked[0]!)) return { winnerName: marked[0]!, ambiguous: false };
	return { winnerName: null, ambiguous: false };
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
	} else {
		const raw = parseWinnerFromRawHtml(html);
		winnerName = raw.winnerName;
		ambiguous = raw.ambiguous;
	}

	const resultBox = document.querySelector('.r2p-match-result');
	const scoreStrong = resultBox?.querySelector('strong');
	const score = extractMatchScore(textOf(scoreStrong) || textOf(resultBox));
	const winMethod = textOf(document.querySelector('.r2p-win-method')) || null;
	const isFinal = Boolean(document.querySelector('.r2p-final-badge')) || /r2p-final-badge/i.test(html);
	const schedule = parseMatchPageSchedule(textOf(document.querySelector('.r2p-scheduled')));

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
