/**
 * Parse an R2 per-match page (r2-push.asp?TID=&matchID=).
 * Winner is the side marked with `.r2p-side-winner` / `.r2p-winner-badge`.
 * A score with no winner badge is not a result.
 */
import { parseHTML } from 'linkedom';
import { cleanPlayerName, formatScore, isPlayerName } from './r2-names';
import { parseMatchPageSchedule } from './r2-schedule';

type DomEl = {
	textContent: string | null;
	classList?: { contains(name: string): boolean };
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

function sideName(side: DomEl | null): string | null {
	if (!side) return null;
	const namesRoot = side.querySelector('.r2p-side-names');
	if (!namesRoot) return null;
	const parts = Array.from(namesRoot.querySelectorAll('a, span'))
		.map((el) => cleanPlayerName(textOf(el)))
		.filter((n) => n.length >= 2);
	const joined = parts.length ? parts.join(' / ') : cleanPlayerName(textOf(namesRoot));
	return joined || null;
}

function extractScore(text: string): string | null {
	const t = String(text ?? '');
	const wbf = t.match(/WBF[^\n\r]*/i) ?? t.match(/No[\s-]?Show[^\n\r]*/i) ?? t.match(/Forfeit[^\n\r]*/i);
	if (wbf) return wbf[0].trim();
	const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
	return m ? formatScore(m[0]) : null;
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
	const sides = Array.from(document.querySelectorAll('.r2p-versus-side'));
	const player1 = sideName(sides[0] ?? null);
	const player2 = sideName(sides[1] ?? null);

	const winnerSides = sides.filter((side) => {
		const cls = (side as DomEl).classList;
		if (cls?.contains('r2p-side-winner')) return true;
		return Boolean(side.querySelector('.r2p-winner-badge'));
	});

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

	const resultBox = document.querySelector('.r2p-match-result');
	const scoreStrong = resultBox?.querySelector('strong');
	const score = extractScore(textOf(scoreStrong) || textOf(resultBox));
	const winMethod = textOf(document.querySelector('.r2p-win-method')) || null;
	const isFinal = Boolean(document.querySelector('.r2p-final-badge'));
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
