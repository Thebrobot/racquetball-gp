/**
 * R2 Sports bracket HTML parsers. Ported from scripts/sync-r2-brackets.mjs
 * page.evaluate() callbacks so the Vercel cron can scrape with fetch + linkedom
 * instead of Playwright/Chromium.
 */
import { parseHTML } from 'linkedom';

export type MatchRecord = {
	player1?: string | null;
	player2?: string | null;
	winner?: 1 | 2;
	score?: string;
};

export type MatchMap = Record<string, MatchRecord>;

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

export function resolveDivCodeFromHtml(html: string): string | null {
	const document = asDoc(html);
	// R2's HTML is invalid (scripts before doctype). linkedom's body.textContent
	// is often empty, but heading nodes still parse. Prefer those over a raw
	// HTML scan — the stylesheet comments mention other division codes.
	const heading = document.querySelector('font[size="6"]') ?? document.querySelector('font[size="5"]');
	const headingMatch = textOf(heading).match(DIV_CODE_RE);
	if (headingMatch) return headingMatch[1];
	for (const el of Array.from(document.querySelectorAll('b, strong, title'))) {
		const m = textOf(el).match(DIV_CODE_RE);
		if (m) return m[1];
	}
	return null;
}

export function extractSingleElimFromHtml(html: string): MatchMap {
	const document = asDoc(html);
	const cleanName = (s: string) =>
		(s ?? '').replace(/\s*:\s*.*$/, '').replace(/\s+-\s*W\s*$/, '').replace(/\s+/g, ' ').trim();

	const isPlayerName = (s: string) => {
		const t = (s ?? '').trim();
		return t.length >= 3 && (t.includes(' ') || t.includes('/')) && /[A-Za-z]/.test(t);
	};

	const isFullName = (s: string) =>
		isPlayerName(s) &&
		s.split('/').every((part) => {
			const words = part.trim().split(/\s+/);
			return words.length >= 2 && (words[0]?.length ?? 0) > 1;
		});

	const extractScore = (text: string) => {
		const t = String(text ?? '');
		const wbf = t.match(/WBF[^\n\r]*/i) ?? t.match(/No[\s-]?Show[^\n\r]*/i) ?? t.match(/Forfeit[^\n\r]*/i);
		if (wbf) return wbf[0].trim();
		const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
		return m ? m[0].replace(/–/g, '-').replace(/\s+/g, '') : null;
	};

	const lastNames = (name: string) =>
		(name ?? '')
			.split('/')
			.map((p) => p.trim().split(/\s+/).pop()?.toLowerCase())
			.filter((n): n is string => Boolean(n));

	const allTables = Array.from(document.querySelectorAll('table'));
	const matchBoxes = allTables.filter((t) => t.querySelector('a[href*="viewAppMatch"]'));

	const matchMap: MatchMap = {};

	for (const box of matchBoxes) {
		const link = box.querySelector('a[href*="viewAppMatch"]');
		const matchId = textOf(link);
		if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(matchId)) continue;

		const names = Array.from(box.querySelectorAll('strong, b'))
			.map((el) => cleanName(el.textContent ?? ''))
			.filter(isPlayerName);

		if (names.length === 0) continue;
		matchMap[matchId] = {
			player1: names[0] ?? null,
			player2: names[1] ?? null,
		};
	}

	const results: MatchMap = { ...matchMap };

	{
		const cells = Array.from(document.querySelectorAll('td')).filter((td) => !td.querySelector('table'));
		for (const cell of cells) {
			const closestTable = cell.closest('table');
			const isMatchBox = !!closestTable?.querySelector('a[href*="viewAppMatch"]');
			const strong = cell.querySelector('strong, b');
			if (!strong) continue;
			const advancerName = cleanName(strong.textContent ?? '');
			if (!isPlayerName(advancerName)) continue;
			if (isMatchBox && !isFullName(advancerName)) continue;

			const score = extractScore(cell.textContent ?? '');
			if (!score) continue;

			const advLN = lastNames(advancerName);
			if (!advLN.length) continue;

			let fullMatch: { matchId: string; data: MatchRecord; side: 1 | 2 } | null = null;
			let abbrMatch: { matchId: string; data: MatchRecord; side: 1 | 2 } | null = null;
			let ambiguous = false;

			for (const [matchId, data] of Object.entries(results)) {
				if (data.winner != null) continue;
				const p1LN = lastNames(data.player1 ?? '');
				const p2LN = lastNames(data.player2 ?? '');

				const hitsP1 = advLN.every((ln) => p1LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
				const hitsP2 = advLN.every((ln) => p2LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));

				if (hitsP1 && !hitsP2) {
					if (isFullName(data.player1 ?? '')) {
						if (fullMatch) {
							ambiguous = true;
							break;
						}
						fullMatch = { matchId, data, side: 1 };
					} else if (!fullMatch) {
						abbrMatch = { matchId, data, side: 1 };
					}
				} else if (hitsP2 && !hitsP1) {
					if (isFullName(data.player2 ?? '')) {
						if (fullMatch) {
							ambiguous = true;
							break;
						}
						fullMatch = { matchId, data, side: 2 };
					} else if (!fullMatch) {
						abbrMatch = { matchId, data, side: 2 };
					}
				}
			}

			if (ambiguous) continue;
			const target = fullMatch ?? abbrMatch;
			if (!target) continue;
			results[target.matchId] = { ...target.data, winner: target.side, score };
		}
	}

	const matchNum = (matchId: string) => {
		const m = matchId.match(/\d+$/);
		return m ? parseInt(m[0], 10) : Infinity;
	};

	const isWinnerBorder = (style: string | null) => /3\.0?pt solid (?!black)/.test(style ?? '');

	for (const nameEl of Array.from(document.querySelectorAll('b, strong'))) {
		const advancerName = cleanName(nameEl.textContent ?? '');
		if (!isPlayerName(advancerName)) continue;

		const parentTd = nameEl.closest('td');
		if (!parentTd) continue;
		const hasWinnerBorder = isWinnerBorder(parentTd.getAttribute('style'));
		if (isFullName(advancerName) && !hasWinnerBorder) continue;

		const parentTable = nameEl.closest('table');
		const link = parentTable?.querySelector('a[href*="viewAppMatch"]');
		const targetMatchId = textOf(link);
		if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(targetMatchId)) continue;
		if (!matchMap[targetMatchId]) continue;
		const targetNum = matchNum(targetMatchId);

		const winnerTr = parentTd.closest('tr');
		const scoreTd = winnerTr?.nextElementSibling?.querySelector('td') ?? null;
		const score = scoreTd ? extractScore(scoreTd.textContent ?? '') : null;

		const advLN = lastNames(advancerName);
		if (!advLN.length) continue;

		const advInitial = (() => {
			const parts = advancerName.trim().split(/\s+/);
			return !advancerName.includes('/') && (parts[0]?.length ?? 0) === 1
				? parts[0]!.toUpperCase()
				: null;
		})();

		if (isFullName(advancerName)) {
			const data = results[targetMatchId];
			if (!data || data.winner != null) continue;
			const p1LN = lastNames(data.player1 ?? '');
			const p2LN = lastNames(data.player2 ?? '');
			const hitsP1 = advLN.every((ln) => p1LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
			const hitsP2 = advLN.every((ln) => p2LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
			if (hitsP1 && !hitsP2) results[targetMatchId] = { ...data, winner: 1 };
			else if (hitsP2 && !hitsP1) results[targetMatchId] = { ...data, winner: 2 };
			continue;
		}

		if (!score) continue;

		let best: { matchId: string; data: MatchRecord; side: 1 | 2; num: number } | null = null;
		let ambiguous = false;

		for (const [matchId, data] of Object.entries(results)) {
			if (matchId === targetMatchId) continue;
			if (data.winner != null && data.score != null) continue;
			const yNum = matchNum(matchId);
			if (yNum <= targetNum) continue;

			const p1LN = lastNames(data.player1 ?? '');
			const p2LN = lastNames(data.player2 ?? '');

			const hitsP1 = advLN.every((ln) => p1LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
			const hitsP2 = advLN.every((ln) => p2LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));

			const verifyInitial = (playerName: string | null | undefined, hits: boolean) => {
				if (!hits || !advInitial) return hits;
				const pFirst = (playerName ?? '').trim().split(/\s+/)[0];
				return pFirst?.[0]?.toUpperCase() === advInitial;
			};
			const validP1 = verifyInitial(data.player1, hitsP1 && !hitsP2);
			const validP2 = verifyInitial(data.player2, hitsP2 && !hitsP1);

			if (validP1) {
				if (best === null || yNum < best.num) {
					best = { matchId, data, side: 1, num: yNum };
					ambiguous = false;
				} else if (yNum === best.num) {
					ambiguous = true;
				}
			} else if (validP2) {
				if (best === null || yNum < best.num) {
					best = { matchId, data, side: 2, num: yNum };
					ambiguous = false;
				} else if (yNum === best.num) {
					ambiguous = true;
				}
			}
		}

		if (ambiguous || !best) continue;
		const existing = results[best.matchId];
		if (!existing) continue;
		if (existing.winner == null) {
			results[best.matchId] = { ...existing, winner: best.side, score };
		} else if (existing.score == null && existing.winner === best.side) {
			results[best.matchId] = { ...existing, score };
		}
	}

	const championScoreFor = (playerName: string) => {
		const champTd = Array.from(document.querySelectorAll('td')).find((td) =>
			/^CHAMPION$/i.test((td.textContent ?? '').trim()),
		);
		if (!champTd) return null;
		const table = champTd.closest('table');
		const champName = cleanName(table?.querySelector('strong, b')?.textContent ?? '');
		if (!isPlayerName(champName)) return null;
		const pLN = lastNames(playerName);
		const cLN = lastNames(champName);
		const matches = pLN.every((ln) => cLN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
		if (!matches) return null;
		return extractScore(champTd.closest('tr')?.nextElementSibling?.textContent ?? '');
	};

	for (const box of matchBoxes) {
		const link = box.querySelector('a[href*="viewAppMatch"]');
		const matchId = textOf(link);
		if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(matchId)) continue;

		const data = results[matchId];
		if (!data || data.winner != null) continue;
		if (!isPlayerName(data.player1 ?? '') || !isPlayerName(data.player2 ?? '')) continue;

		for (const tr of Array.from(box.querySelectorAll('tr'))) {
			const nameEl = tr.querySelector('strong, b');
			if (!nameEl) continue;
			const nameTd = nameEl.closest('td');
			if (!nameTd || !isWinnerBorder(nameTd.getAttribute('style'))) continue;

			const winnerName = cleanName(nameEl.textContent ?? '');
			if (!isPlayerName(winnerName)) continue;

			const scoreTr = tr.nextElementSibling;
			const score = scoreTr ? extractScore(scoreTr.textContent ?? '') : null;
			if (!score) continue;

			const winLN = lastNames(winnerName);
			const p1LN = lastNames(data.player1 ?? '');
			const p2LN = lastNames(data.player2 ?? '');
			const hitsP1 = winLN.every((ln) => p1LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
			const hitsP2 = winLN.every((ln) => p2LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));

			if (hitsP1 && !hitsP2) {
				results[matchId] = { ...data, winner: 1, score: championScoreFor(winnerName) ?? score };
				break;
			}
			if (hitsP2 && !hitsP1) {
				results[matchId] = { ...data, winner: 2, score: championScoreFor(winnerName) ?? score };
				break;
			}
		}
	}

	return results;
}

export function extractRoundRobinFromHtml(html: string): MatchMap {
	const document = asDoc(html);
	const results: MatchMap = {};

	const extractScore = (text: string) => {
		const t = String(text ?? '');
		const wbf = t.match(/WBF[^\n\r]*/i) ?? t.match(/No[\s-]?Show[^\n\r]*/i);
		if (wbf) return wbf[0].trim();
		const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
		return m ? m[0].replace(/–/g, '-').replace(/\s+/g, '') : null;
	};

	const codeRe = /^[A-Z][A-Z0-9+]{0,4}\s+\d{1,3}$/;
	const matchLinks = Array.from(document.querySelectorAll('a')).filter((a) =>
		codeRe.test(textOf(a)),
	);

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

		const stripW = (s: string) => s.replace(/\s+-\s+W$/, '').trim();
		const player1 = stripW(versus[1] ?? '');
		const player2 = stripW(versus[2] ?? '');
		const score = extractScore(rowText);

		let winner: 1 | 2 | undefined;
		if (/vs\.?\s+[A-Z][\w .'\-/]+?\s+-\s+W\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|F|M|W)\s+\d/.test(rowText)) {
			winner = 2;
		} else if (/-\s+W\s+vs\.?/.test(rowText)) {
			winner = 1;
		}

		const entry: MatchRecord = { player1, player2 };
		if (score) entry.score = score;
		if (winner) entry.winner = winner;
		results[matchId] = entry;
	}

	return results;
}

export function parseBracketPage(html: string, finalUrl: string): MatchMap {
	if (/roundRobin\.asp/i.test(finalUrl)) return extractRoundRobinFromHtml(html);
	return extractSingleElimFromHtml(html);
}
