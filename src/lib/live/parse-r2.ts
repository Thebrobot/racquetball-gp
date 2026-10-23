/**
 * R2 Sports bracket HTML parsers.
 * This file extracts the match roster, numeric R2 ids, schedule, and
 * *explicit* same-box winner markers. It does not infer a winner by
 * matching last names into a later-round slot.
 */
import { parseHTML } from 'linkedom';
import { cleanPlayerName, formatScore, isPlayerName, matchWinnerSide } from './r2-names';
import { parseR2Schedule } from './r2-schedule';

export type MatchRecord = {
	player1?: string | null;
	player2?: string | null;
	winner?: 1 | 2;
	score?: string;
	court?: string;
	scheduledTime?: string;
};

export type MatchMap = Record<string, MatchRecord>;

export type DrawWinnerSource = 'box-border' | 'round-robin-w';

export type ParsedDrawMatch = MatchRecord & {
	r2MatchId?: string;
	/** Winner taken only from an explicit marker on this match's own row/box. */
	drawWinner?: 1 | 2;
	drawWinnerName?: string;
	drawScore?: string;
	drawWinnerSource?: DrawWinnerSource;
};

export type DrawAdvancement = {
	name: string;
	score: string | null;
};

export type DrawPageParse = {
	matches: Record<string, ParsedDrawMatch>;
	advancements: DrawAdvancement[];
};

type DomEl = {
	textContent: string | null;
	querySelector(selector: string): DomEl | null;
	querySelectorAll(selector: string): ArrayLike<DomEl>;
	closest(selector: string): DomEl | null;
	getAttribute(name: string): string | null;
	nextElementSibling: DomEl | null;
};

type DomDoc = {
	body: DomEl | null;
	querySelector(selector: string): DomEl | null;
	querySelectorAll(selector: string): ArrayLike<DomEl>;
};

function asDoc(html: string): DomDoc {
	return parseHTML(html).document as unknown as DomDoc;
}

function textOf(el: DomEl | null | undefined): string {
	return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const DIV_CODE_RE = /\(\s*([A-Z][A-Z0-9+]*)\s*\)\s*(?:Men|Women|Mixed)/;
const MATCH_CODE_RE = /^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/;
const VIEW_MATCH_RE = /viewAppMatch\((\d+)\)/i;

export function resolveDivCodeFromHtml(html: string): string | null {
	const document = asDoc(html);
	const heading = document.querySelector('font[size="6"]') ?? document.querySelector('font[size="5"]');
	const headingMatch = textOf(heading).match(DIV_CODE_RE);
	if (headingMatch) return headingMatch[1];
	for (const el of Array.from(document.querySelectorAll('b, strong, title'))) {
		const m = textOf(el).match(DIV_CODE_RE);
		if (m) return m[1];
	}
	return null;
}

export function extractScore(text: string): string | null {
	const t = String(text ?? '');
	const wbf = t.match(/WBF[^\n\r]*/i) ?? t.match(/No[\s-]?Show[^\n\r]*/i) ?? t.match(/Forfeit[^\n\r]*/i);
	if (wbf) return wbf[0].trim();
	const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
	return m ? formatScore(m[0]) : null;
}

const isWinnerBorder = (style: string | null) => /3\.0?pt solid (?!black)/.test(style ?? '');

function r2IdFromHref(href: string | null): string | undefined {
	const m = (href ?? '').match(VIEW_MATCH_RE);
	return m?.[1];
}

function applySchedule(target: ParsedDrawMatch, text: string): void {
	const parsed = parseR2Schedule(text);
	if (parsed.court && !target.court) target.court = parsed.court;
	if (parsed.scheduledTime && !target.scheduledTime) target.scheduledTime = parsed.scheduledTime;
}

export function extractSingleElimFromHtml(html: string): DrawPageParse {
	const document = asDoc(html);
	const allTables = Array.from(document.querySelectorAll('table'));
	const matchBoxes = allTables.filter((t) => t.querySelector('a[href*="viewAppMatch"]'));
	const matches: Record<string, ParsedDrawMatch> = {};

	for (const box of matchBoxes) {
		const link = box.querySelector('a[href*="viewAppMatch"]');
		const matchId = textOf(link);
		if (!MATCH_CODE_RE.test(matchId)) continue;

		const names = Array.from(box.querySelectorAll('strong, b'))
			.map((el) => cleanPlayerName(el.textContent ?? ''))
			.filter(isPlayerName);

		const entry: ParsedDrawMatch = {
			player1: names[0] ?? null,
			player2: names[1] ?? null,
			r2MatchId: r2IdFromHref(link?.getAttribute('href') ?? null),
		};
		applySchedule(entry, textOf(box));

		for (const nameEl of Array.from(box.querySelectorAll('strong, b'))) {
			const nameTd = nameEl.closest('td');
			if (!nameTd || !isWinnerBorder(nameTd.getAttribute('style'))) continue;
			const winnerName = cleanPlayerName(nameEl.textContent ?? '');
			if (!isPlayerName(winnerName)) continue;
			const side = matchWinnerSide(winnerName, entry.player1, entry.player2);
			if (side == null) continue;
			entry.drawWinner = side;
			entry.drawWinnerName = winnerName;
			entry.drawWinnerSource = 'box-border';
			const scoreTr = nameTd.closest('tr')?.nextElementSibling;
			const score = scoreTr ? extractScore(textOf(scoreTr)) : extractScore(textOf(nameTd));
			if (score) entry.drawScore = score;
			break;
		}

		if (!entry.drawScore) {
			const boxScore = extractScore(textOf(box));
			if (boxScore) entry.drawScore = boxScore;
		}

		matches[matchId] = entry;
	}

	const advancements: DrawAdvancement[] = [];
	const cells = Array.from(document.querySelectorAll('td')).filter((td) => !td.querySelector('table'));
	for (const cell of cells) {
		const strong = cell.querySelector('strong, b');
		if (!strong) continue;
		const name = cleanPlayerName(strong.textContent ?? '');
		if (!isPlayerName(name)) continue;
		const own = extractScore(textOf(cell));
		const next = cell.closest('tr')?.nextElementSibling
			? extractScore(textOf(cell.closest('tr')?.nextElementSibling))
			: null;
		const score = own ?? next;
		if (!score) continue;
		const inMatchBox = Boolean(cell.closest('table')?.querySelector('a[href*="viewAppMatch"]'));
		if (inMatchBox && namesAlignBox(cell, name)) continue;
		advancements.push({ name, score });
	}

	return { matches, advancements };
}

function namesAlignBox(cell: DomEl, name: string): boolean {
	const box = cell.closest('table');
	if (!box?.querySelector('a[href*="viewAppMatch"]')) return false;
	const names = Array.from(box.querySelectorAll('strong, b'))
		.map((el) => cleanPlayerName(el.textContent ?? ''))
		.filter(isPlayerName);
	return names.some((n) => n.toLowerCase() === name.toLowerCase());
}

export function extractRoundRobinFromHtml(html: string): DrawPageParse {
	const document = asDoc(html);
	const matches: Record<string, ParsedDrawMatch> = {};
	const codeRe = /^[A-Z][A-Z0-9+]{0,4}\s+\d{1,3}$/;
	const matchLinks = Array.from(document.querySelectorAll('a')).filter((a) => codeRe.test(textOf(a)));

	for (const link of matchLinks) {
		const rawId = textOf(link);
		const matchId = rawId.replace(/\s+/g, '');
		const row = link.closest('tr');
		if (!row) continue;
		const rowText = textOf(row);

		const versus = rowText.match(
			/([A-Z][A-Za-z .'\-\/]+?)\s+vs\.?\s+([A-Z][A-Za-z .'\-\/]+?)(?:\s+-\s+W)?\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|F|M|W)\s+\d{1,2}:\d{2}/,
		);
		if (!versus) continue;

		const stripW = (s: string) => s.replace(/\s+-\s+W$/i, '').trim();
		const player1 = stripW(versus[1] ?? '');
		const player2 = stripW(versus[2] ?? '');
		const score = extractScore(rowText);
		const entry: ParsedDrawMatch = {
			player1,
			player2,
			r2MatchId: r2IdFromHref(link.getAttribute('href')),
		};
		applySchedule(entry, rowText);
		if (score) entry.drawScore = score;

		if (/vs\.?\s+[A-Z][\w .'\-/]+?\s+-\s+W\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|F|M|W)\s+\d/.test(rowText)) {
			entry.drawWinner = 2;
			entry.drawWinnerName = player2;
			entry.drawWinnerSource = 'round-robin-w';
		} else if (/-\s+W\s+vs\.?/.test(rowText)) {
			entry.drawWinner = 1;
			entry.drawWinnerName = player1;
			entry.drawWinnerSource = 'round-robin-w';
		}

		matches[matchId] = entry;
	}

	return { matches, advancements: [] };
}

export function parseBracketPage(html: string, finalUrl: string): DrawPageParse {
	if (/roundRobin\.asp/i.test(finalUrl)) return extractRoundRobinFromHtml(html);
	return extractSingleElimFromHtml(html);
}

/** Publishable fields only — drop draw-only / internal keys. */
export function toMatchRecord(parsed: ParsedDrawMatch): MatchRecord {
	const record: MatchRecord = {
		player1: parsed.player1 ?? null,
		player2: parsed.player2 ?? null,
	};
	if (parsed.winner != null) record.winner = parsed.winner;
	if (parsed.score) record.score = parsed.score;
	if (parsed.court) record.court = parsed.court;
	if (parsed.scheduledTime) record.scheduledTime = parsed.scheduledTime;
	return record;
}
