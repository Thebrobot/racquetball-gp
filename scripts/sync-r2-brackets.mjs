/**
 * sync-r2-brackets.mjs
 *
 * Scrapes live bracket results from R2 Sports and writes them to
 * src/data/<event>-results.json.  Called automatically by the GitHub Actions
 * cron workflow every 10 minutes during the tournament weekend.
 *
 * Select the event with a CLI arg (defaults to sarasota):
 *   node scripts/sync-r2-brackets.mjs sarasota
 *   node scripts/sync-r2-brackets.mjs ocala
 *
 * R2 Sports HTML structure (discovered from live pages):
 *
 *   Single-elim match box — a <table> containing:
 *     <strong>Player Name</strong>: City, ST
 *     <a href="javascript:viewAppMatch(N);">matchId</a>
 *
 *   Advancement box (shows who won the previous round and with what score) —
 *   a <table> with NO viewAppMatch link, but with:
 *     <td><strong>AbbreviatedWinner</strong> score-or-WBF-text</td>
 *
 *   Round-robin schedule table — rows containing "Team1 vs Team2" text
 *   and a match-code link like "MC 1".
 *
 * Usage:
 *   node scripts/sync-r2-brackets.mjs
 *
 * Requires Playwright (already a devDependency):
 *   npx playwright install chromium --with-deps
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = resolve(__dirname, 'match-result-overrides.json');
const ACTIVITY_PATH = resolve(__dirname, '../public/data/live-activity.json');
const MAX_ACTIVITY_EVENTS = 80;

// ── Per-event configuration ─────────────────────────────────────────────────
// Select with CLI arg: `node scripts/sync-r2-brackets.mjs sarasota` (default: sarasota)

const EVENT_CONFIGS = {
	ocala: {
		slug: 'ocala-open',
		tid: '53697',
		resultsPath: resolve(__dirname, '../src/data/ocala-results.json'),
		divisionLabels: {
			'mens-singles-open': "Men's Singles: Open",
			'mens-singles-elite': "Men's Singles: Elite",
			'mens-singles-a': "Men's Singles: A",
			'mens-singles-b': "Men's Singles: B",
			'mens-singles-c': "Men's Singles: C",
			'mens-age-50': "Men's Age Singles: 50+",
			'mens-age-60': "Men's Age Singles: 60+",
			'mens-age-70': "Men's Age Singles: 70+",
			'mens-doubles-open': "Men's Doubles: Open",
			'mens-doubles-elite': "Men's Doubles: Elite",
			'mens-doubles-a': "Men's Doubles: A",
			'mens-doubles-b': "Men's Doubles: B",
			'mens-doubles-centurion': "Men's Doubles: Centurion+ Open",
			'mens-doubles-super-centurion': "Men's Doubles: Super Centurion (120+)",
			'mixed-doubles': 'Mixed Doubles: Open/A',
		},
		// Division short-code → our internal ID
		codeIdMap: {
			MO:   'mens-singles-open',
			ME:   'mens-singles-elite',
			MA:   'mens-singles-a',
			MB:   'mens-singles-b',
			MC:   'mens-singles-c',
			'M50+': 'mens-age-50',
			'M60+': 'mens-age-60',
			'M70+': 'mens-age-70',
			MOD:  'mens-doubles-open',
			MED:  'mens-doubles-elite',
			MAD:  'mens-doubles-a',
			MBD:  'mens-doubles-b',
			MCOD: 'mens-doubles-centurion',
			MSCD: 'mens-doubles-super-centurion',
			MXOA: 'mixed-doubles',
		},
		// Discovered divIDs from the bracket page nav bar (javascript:viewBracket(divID, combinedID))
		divisionUrls: [
			{ code: 'MO',   divID: 2,     combinedID: 0 },
			{ code: 'ME',   divID: 753,   combinedID: 0 },
			{ code: 'MA',   divID: 3,     combinedID: 0 },
			{ code: 'MB',   divID: 4,     combinedID: 0 },
			{ code: 'MC',   divID: 5,     combinedID: 0 },
			{ code: 'M50+', divID: 22,    combinedID: 0 },
			{ code: 'M60+', divID: 26,    combinedID: 0 },
			{ code: 'M70+', divID: 30,    combinedID: 0 },
			{ code: 'MOD',  divID: 68,    combinedID: 0 },
			{ code: 'MED',  divID: 756,   combinedID: 0 },
			{ code: 'MAD',  divID: 69,    combinedID: 0 },
			{ code: 'MBD',  divID: 70,    combinedID: 0 },
			{ code: 'MCOD', divID: 10146, combinedID: 0 },
			{ code: 'MSCD', divID: 28003, combinedID: 0 },
			{ code: 'MXOA', divID: 0,     combinedID: 236959 },
		],
	},
	sarasota: {
		slug: 'sarasota-open',
		tid: '54249',
		resultsPath: resolve(__dirname, '../src/data/sarasota-results.json'),
		divisionLabels: {
			'mens-singles-open': "Men's Singles: Open",
			'mens-singles-elite': "Men's Singles: Elite",
			'mens-singles-a': "Men's Singles: A",
			'mens-singles-b': "Men's Singles: B",
			'mens-singles-c': "Men's Singles: C",
			'mens-age-3040': "Men's Age Singles: 30/40+",
			'mens-age-50': "Men's Age Singles: 50+",
			'mens-age-60': "Men's Age Singles: 60+",
			'mens-age-70': "Men's Age Singles: 70+",
			'mens-doubles-open': "Men's Doubles: Open",
			'mens-doubles-elite': "Men's Doubles: Elite",
			'mens-doubles-a': "Men's Doubles: A",
			'mens-doubles-b': "Men's Doubles: B",
			'mens-doubles-centurion': "Men's Doubles: Centurion/",
		},
		codeIdMap: {
			MO:    'mens-singles-open',
			ME:    'mens-singles-elite',
			MA:    'mens-singles-a',
			MB:    'mens-singles-b',
			MC:    'mens-singles-c',
			M3040: 'mens-age-3040',
			'M50+': 'mens-age-50',
			'M60+': 'mens-age-60',
			'M70+': 'mens-age-70',
			MOD:   'mens-doubles-open',
			MED:   'mens-doubles-elite',
			MAD:   'mens-doubles-a',
			MBD:   'mens-doubles-b',
			MDS:   'mens-doubles-centurion',
		},
		// From listAllDivs.asp?TID=54249 viewBracket(divID, combinedID) links
		divisionUrls: [
			{ code: 'MO',    divID: 2,   combinedID: 0 },
			{ code: 'ME',    divID: 753, combinedID: 0 },
			{ code: 'MA',    divID: 3,   combinedID: 0 },
			{ code: 'MB',    divID: 4,   combinedID: 0 },
			{ code: 'MC',    divID: 5,   combinedID: 0 },
			{ code: 'M3040', divID: 0,   combinedID: 237435 },
			{ code: 'M50+',  divID: 22,  combinedID: 0 },
			{ code: 'M60+',  divID: 26,  combinedID: 0 },
			{ code: 'M70+',  divID: 30,  combinedID: 0 },
			{ code: 'MOD',   divID: 68,  combinedID: 0 },
			{ code: 'MED',   divID: 756, combinedID: 0 },
			{ code: 'MAD',   divID: 69,  combinedID: 0 },
			{ code: 'MBD',   divID: 70,  combinedID: 0 },
			{ code: 'MDS',   divID: 0,   combinedID: 237436 },
		],
	},
};

const eventKey = process.argv[2] ?? 'sarasota';
const EVENT = EVENT_CONFIGS[eventKey];
if (!EVENT) {
	console.error(`Unknown event "${eventKey}". Valid: ${Object.keys(EVENT_CONFIGS).join(', ')}`);
	process.exit(1);
}

const RESULTS_PATH = EVENT.resultsPath;
const EVENT_SLUG = EVENT.slug;
const DIVISION_LABELS = EVENT.divisionLabels;
const CODE_ID_MAP = EVENT.codeIdMap;
const DIVISION_URLS = EVENT.divisionUrls;
const DRAWOUT_BASE = `https://www.r2sports.com/tourney/drawsOut/drawOut.asp?TID=${EVENT.tid}`;

/**
 * Single-elimination bracket extractor.
 *
 * R2 Sports bracket structure insight:
 *   - Early-round match boxes contain FULL player names in <strong> tags,
 *     plus a <a href="javascript:viewAppMatch(N);">matchId</a> link.
 *   - Later-round "advancement" cells also have viewAppMatch links, but show
 *     ABBREVIATED names (e.g. "K Artman") — one per player who advanced —
 *     with the score from their previous match in the same <td>.
 *
 * Strategy:
 *  Pass 1 — Build a match map using ONLY full player names (where first name
 *            is more than one character). Abbreviated-name cells are treated as
 *            source-match result carriers, not match-map entries.
 *  Pass 2 — Scan every <strong>+score cell in the page (regardless of whether
 *            its table has a viewAppMatch link) and match the abbreviated
 *            advancing player back to their source match by last name.
 */
async function extractSingleElimData(page) {
	return page.evaluate(() => {
		const cleanName = (s) =>
			(s ?? '').replace(/\s*:\s*.*$/, '').replace(/\s+-\s*W\s*$/, '').replace(/\s+/g, ' ').trim();

		const isPlayerName = (s) => {
			const t = (s ?? '').trim();
			return t.length >= 3 && (t.includes(' ') || t.includes('/')) && /[A-Za-z]/.test(t);
		};

		// A "full" name has a first name longer than one character on each side of "/".
		// "Kyle Artman" → true; "K Artman" → false; "Alexis Fajardo / Jim Russell" → true.
		const isFullName = (s) =>
			isPlayerName(s) &&
			s.split('/').every((part) => {
				const words = part.trim().split(/\s+/);
				return words.length >= 2 && words[0].length > 1;
			});

		const extractScore = (text) => {
			const t = String(text ?? '');
			const wbf = t.match(/WBF[^\n\r]*/i) ?? t.match(/No[\s-]?Show[^\n\r]*/i) ?? t.match(/Forfeit[^\n\r]*/i);
			if (wbf) return wbf[0].trim();
			const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
			return m ? m[0].replace(/–/g, '-').replace(/\s+/g, '') : null;
		};

		// Last names from a player/team string for fuzzy matching.
		// "Kyle Artman" → ["artman"]   "K Artman" → ["artman"]
		// "Alexis Fajardo / Jim Russell" → ["fajardo", "russell"]
		const lastNames = (name) =>
			(name ?? '').split('/').map((p) => p.trim().split(/\s+/).pop()?.toLowerCase()).filter(Boolean);

		// ── Pass 1: match map from ALL match boxes (full AND abbreviated names) ──
		const allTables = Array.from(document.querySelectorAll('table'));
		const matchBoxes = allTables.filter((t) => t.querySelector('a[href*="viewAppMatch"]'));

		const matchMap = {}; // matchId → { player1, player2 }

		for (const box of matchBoxes) {
			const link = box.querySelector('a[href*="viewAppMatch"]');
			const matchId = (link?.textContent ?? '').trim();
			if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(matchId)) continue;

			const names = Array.from(box.querySelectorAll('strong, b'))
				.map((el) => cleanName(el.textContent))
				.filter(isPlayerName);

			if (names.length === 0) continue;
			matchMap[matchId] = {
				player1: names[0] ?? null,
				player2: names[1] ?? null,
			};
		}

		// ── Pass 2: resolve source-match results from score-bearing cells ──
		// Scan all tables for <strong>+score cells. However, if the cell is
		// inside a match box (has viewAppMatch) and the player name is
		// ABBREVIATED, skip it — R2 shows the previous-match score underneath
		// an abbreviated advancing-player name as context for the upcoming
		// match. Reading those caused false positives where the context score
		// was applied to the not-yet-played match instead of the source match.
		// Full names in match boxes are safe to process (early-round results).
		const results = { ...matchMap };

		// Leaf cells only: wrapper-table tds concatenate the whole bracket's text
		// (names + unrelated scores + even analytics script ids like "…609-1"),
		// which caused scores from one match to be attributed to another.
		{
			const cells = Array.from(document.querySelectorAll('td')).filter(
				(td) => !td.querySelector('table'),
			);
			for (const cell of cells) {
				const closestTable = cell.closest('table');
				const isMatchBox = !!closestTable?.querySelector('a[href*="viewAppMatch"]');
				const strong = cell.querySelector('strong, b');
				if (!strong) continue;
				const advancerName = cleanName(strong.textContent);
				if (!isPlayerName(advancerName)) continue;

				// Skip abbreviated names inside match boxes — they are advancement
				// context (previous-match score), not the result of this match.
				if (isMatchBox && !isFullName(advancerName)) continue;

				const score = extractScore(cell.textContent ?? '');
				if (!score) continue;

				const advLN = lastNames(advancerName);
				if (!advLN.length) continue;

				// Track the best match candidate, preferring full-name slots to
				// resolve the ambiguity when a player appears in multiple rounds.
				let fullMatch = null;  // { matchId, data, side } — player in a full-name slot
				let abbrMatch = null;  // { matchId, data, side } — player in an abbreviated slot
				let ambiguous = false;

				for (const [matchId, data] of Object.entries(results)) {
					if (data.winner != null) continue;
					const p1LN = lastNames(data.player1 ?? '');
					const p2LN = lastNames(data.player2 ?? '');

					const hitsP1 = advLN.every((ln) => p1LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
					const hitsP2 = advLN.every((ln) => p2LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));

					if (hitsP1 && !hitsP2) {
						if (isFullName(data.player1 ?? '')) {
							if (fullMatch) { ambiguous = true; break; }
							fullMatch = { matchId, data, side: 1 };
						} else if (!fullMatch) {
							abbrMatch = { matchId, data, side: 1 };
						}
					} else if (hitsP2 && !hitsP1) {
						if (isFullName(data.player2 ?? '')) {
							if (fullMatch) { ambiguous = true; break; }
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

		// ── Pass 3: consolidated-bracket winner detection via colored borders ──
		// In consolidated brackets, R2 draws thick colored borders (3pt solid,
		// not black) on advancing winners inside every round's inner tables.
		// Each winner's `<b>/<strong>` cell has their previous-match score in the
		// immediately following <tr>. The nearest viewAppMatch link in the same
		// table identifies the match they are advancing INTO (targetMatchId).
		//
		// Logic:
		//   • Full name + colored border → direct winner of targetMatchId (no source lookup).
		//   • Abbreviated name + colored border + score → player won a PREVIOUS match
		//     to reach targetMatchId. Find source match: unresolved (or winner set but
		//     score missing), player appears, smallest matchNum suffix > targetNum.
		//     First-initial check prevents "O Huyke" from matching "M Huyke" entries.
		//
		// Example: "M Huyke" (red border, score "15-7,15-4") in ME4's table →
		//   source = ME8 (num 8 > 4, initial M matches M Huyke) → ME8.winner=2 ✓

		const matchNum = (matchId) => {
			const m = matchId.match(/\d+$/);
			return m ? parseInt(m[0], 10) : Infinity;
		};

		// 3pt solid colored border = advancing winner; 2pt solid black = seed/loser.
		const isWinnerBorder = (style) => /3\.0?pt solid (?!black)/.test(style ?? '');

		for (const nameEl of Array.from(document.querySelectorAll('b, strong'))) {
			const advancerName = cleanName(nameEl.textContent);
			if (!isPlayerName(advancerName)) continue;

			const parentTd = nameEl.closest('td');
			if (!parentTd) continue;
			// Full names require the colored winner border. Abbreviated advancement
			// cells are processed border-or-not: newer view-bracket.asp layouts do
			// not draw borders, but a score under an abbreviated name still means
			// this player won the feeder match to advance here (losers never
			// appear in advancement slots).
			const hasWinnerBorder = isWinnerBorder(parentTd.getAttribute('style'));
			if (isFullName(advancerName) && !hasWinnerBorder) continue;

			// The nearest viewAppMatch link tells us which match this player advances into.
			const parentTable = nameEl.closest('table');
			const link = parentTable?.querySelector('a[href*="viewAppMatch"]');
			const targetMatchId = (link?.textContent ?? '').trim();
			if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(targetMatchId)) continue;
			if (!matchMap[targetMatchId]) continue;
			const targetNum = matchNum(targetMatchId);

			// Score lives in the first <td> of the immediately following <tr>.
			const winnerTr = parentTd.closest('tr');
			const scoreTd = winnerTr?.nextElementSibling?.querySelector('td');
			const score = scoreTd ? extractScore(scoreTd.textContent ?? '') : null;

			const advLN = lastNames(advancerName);
			if (!advLN.length) continue;

			// First-initial of abbreviated advancer for disambiguation (e.g. "O" ≠ "M").
			const advInitial = (() => {
				const parts = advancerName.trim().split(/\s+/);
				// Only singles abbreviated names (e.g. "O Huyke"); skip doubles/full names.
				return !advancerName.includes('/') && parts[0].length === 1
					? parts[0].toUpperCase()
					: null;
			})();

			if (isFullName(advancerName)) {
				// Direct winner: this full-name player won targetMatchId itself.
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

			if (!score) continue; // abbreviated name but no adjacent score — skip

			// Abbreviated name + score: find the source match they won to get here.
			// Consider matches that have a winner but no score yet (score can be added).
			let best = null;
			let ambiguous = false;

			for (const [matchId, data] of Object.entries(results)) {
				if (matchId === targetMatchId) continue;
				if (data.winner != null && data.score != null) continue; // fully resolved
				const yNum = matchNum(matchId);
				if (yNum <= targetNum) continue;

				const p1LN = lastNames(data.player1 ?? '');
				const p2LN = lastNames(data.player2 ?? '');

				const hitsP1 = advLN.every((ln) => p1LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
				const hitsP2 = advLN.every((ln) => p2LN.some((p) => p === ln || p.includes(ln) || ln.includes(p)));

				// Apply first-initial check when advancer is abbreviated.
				const verifyInitial = (playerName, hits) => {
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
			if (existing.winner == null) {
				results[best.matchId] = { ...existing, winner: best.side, score };
			} else if (existing.score == null && existing.winner === best.side) {
				// Winner already detected directly; just fill in the score.
				results[best.matchId] = { ...existing, score };
			}
		}

		// ── Pass 4: in-box championship / final results ───────────────────────
		// Finals show both players inside the match box with scores on the next
		// row. The winner's name cell has a 3pt colored border (blue on R2).
		// Names like "E Portillo Torres" or "W Stubanas" fail isFullName (single-
		// letter first names), so Passes 2–3 never pick these up.
		//
		// R2 also renders a separate CHAMPION block with the authoritative final
		// score. The in-box winner row can show a stale feeder score (e.g. MB1
		// displays the semi score 15-11,12-15,15-10 instead of 15-13,9-15,11-3).
		const championScoreFor = (playerName) => {
			const champTd = Array.from(document.querySelectorAll('td')).find((td) =>
				/^CHAMPION$/i.test((td.textContent ?? '').trim()),
			);
			if (!champTd) return null;
			const table = champTd.closest('table');
			const champName = cleanName(table?.querySelector('strong, b')?.textContent ?? '');
			if (!isPlayerName(champName)) return null;
			const pLN = lastNames(playerName);
			const cLN = lastNames(champName);
			const matches = pLN.every((ln) =>
				cLN.some((p) => p === ln || p.includes(ln) || ln.includes(p)),
			);
			if (!matches) return null;
			return extractScore(champTd.closest('tr')?.nextElementSibling?.textContent ?? '');
		};

		for (const box of matchBoxes) {
			const link = box.querySelector('a[href*="viewAppMatch"]');
			const matchId = (link?.textContent ?? '').trim();
			if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(matchId)) continue;

			const data = results[matchId];
			if (!data || data.winner != null) continue;
			// Need both slots filled — skip TBD placeholders.
			if (!isPlayerName(data.player1 ?? '') || !isPlayerName(data.player2 ?? '')) continue;

			for (const tr of Array.from(box.querySelectorAll('tr'))) {
				const nameEl = tr.querySelector('strong, b');
				if (!nameEl) continue;
				const nameTd = nameEl.closest('td');
				if (!nameTd || !isWinnerBorder(nameTd.getAttribute('style'))) continue;

				const winnerName = cleanName(nameEl.textContent);
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
	});
}

/**
 * Round-robin extractor (roundRobin.asp pages).
 *
 * Looks for table rows containing "Team1 vs Team2" and a match-code link
 * (e.g. "MC 1" → normalised to "MC1"). Extracts player names, score, and
 * winner from each row.
 */
async function extractRoundRobinData(page) {
	return page.evaluate(() => {
		const results = {};

		const extractScore = (text) => {
			const t = String(text ?? '');
			const wbf = t.match(/WBF[^\n\r]*/i) ?? t.match(/No[\s-]?Show[^\n\r]*/i);
			if (wbf) return wbf[0].trim();
			const m = t.match(/\d{1,3}[-–]\d{1,3}(?:[,\s]+\d{1,3}[-–]\d{1,3})*/);
			return m ? m[0].replace(/–/g, '-').replace(/\s+/g, '') : null;
		};

		// RR match code links look like "MC 1", "MOD 2", "MXOA 3", etc.
		const codeRe = /^[A-Z][A-Z0-9+]{0,4}\s+\d{1,3}$/;
		const matchLinks = Array.from(document.querySelectorAll('a')).filter((a) =>
			codeRe.test((a.textContent ?? '').trim()),
		);

		for (const link of matchLinks) {
			const rawId = (link.textContent ?? '').trim();
			const matchId = rawId.replace(/\s+/g, ''); // "MC 1" → "MC1"

			const row = link.closest('tr');
			if (!row) continue;
			const rowText = (row.innerText ?? '').replace(/\s+/g, ' ').trim();

			// Match "Team1 vs Team2" pattern before a day-of-week abbreviation.
			// R2 uses both two-letter (Sa/Su/Fr) and one-letter (F/M/W) day codes.
			const versus = rowText.match(
				/([A-Z][A-Za-z .'\-\/]+?)\s+vs\.?\s+([A-Z][A-Za-z .'\-\/]+?)(?:\s+-\s+W)?\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|F|M|W)\s+\d{1,2}:\d{2}/,
			);
			if (!versus) continue;

			// "- W" winner marker is part of the free-text name capture; strip it.
			const stripW = (s) => s.replace(/\s+-\s+W$/, '').trim();
			const player1 = stripW(versus[1]);
			const player2 = stripW(versus[2]);
			const score = extractScore(rowText);

			// "W" marker: "Team2 - W Sa …" means team2 won (default WBF style)
			let winner;
			if (/vs\.?\s+[A-Z][\w .'\-/]+?\s+-\s+W\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|F|M|W)\s+\d/.test(rowText)) {
				winner = 2;
			} else if (/-\s+W\s+vs\.?/.test(rowText)) {
				winner = 1;
			}

			const entry = { player1, player2 };
			if (score) entry.score = score;
			if (winner) entry.winner = winner;

			results[matchId] = entry;
		}

		return results;
	});
}

/** Resolve the division short code from a bracket page's header text. */
async function resolveDivCode(page) {
	return page.evaluate(() => {
		const text = (document.body?.innerText ?? '').slice(0, 8000);
		const m = text.match(/\(\s*([A-Z][A-Z0-9+]*)\s*\)\s*(?:Men|Women|Mixed)/);
		return m ? m[1] : null;
	});
}

async function processDivision(page, divID, combinedID) {
	const url = `${DRAWOUT_BASE}&divID=${divID}&combinedID=${combinedID}`;
	await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

	const finalUrl = page.url();
	const divCode = await resolveDivCode(page);
	const divId = divCode ? CODE_ID_MAP[divCode] : null;

	if (!divId) {
		return { divCode, divId: null, data: {} };
	}

	let data;
	if (/roundRobin\.asp/i.test(finalUrl)) {
		data = await extractRoundRobinData(page);
	} else {
		data = await extractSingleElimData(page);
	}

	return { divCode, divId, data };
}

function winnerLoserNames(match) {
	if (match.winner !== 1 && match.winner !== 2) return null;
	const winnerName = match.winner === 1 ? match.player1 : match.player2;
	const loserName = match.winner === 1 ? match.player2 : match.player1;
	if (!winnerName?.trim() || !loserName?.trim()) return null;
	return { winnerName: winnerName.trim(), loserName: loserName.trim() };
}

/** Emit feed entries when winners/scores change between sync snapshots. */
function detectActivityChanges(prevDivisions, nextDivisions, at) {
	const newEvents = [];
	const prev = prevDivisions ?? {};
	const next = nextDivisions ?? {};

	for (const [divId, matches] of Object.entries(next)) {
		const divisionLabel = DIVISION_LABELS[divId] ?? divId;
		for (const [matchId, newMatch] of Object.entries(matches)) {
			const oldMatch = prev[divId]?.[matchId];
			const hadWinner = oldMatch?.winner === 1 || oldMatch?.winner === 2;
			const hasWinner = newMatch.winner === 1 || newMatch.winner === 2;

			if (!hasWinner) continue;

			const winnerChanged = oldMatch?.winner !== newMatch.winner;
			const scoreChanged =
				(oldMatch?.score ?? null) !== (newMatch.score ?? null) && newMatch.score != null;
			const newlySet = !hadWinner && hasWinner;

			if (!newlySet && !winnerChanged && !scoreChanged) continue;

			const names = winnerLoserNames(newMatch);
			if (!names) continue;

			newEvents.push({
				id: `${at}-${divId}-${matchId}`,
				at,
				type: 'result',
				divisionId: divId,
				divisionLabel,
				matchId,
				headline: `${names.winnerName} def ${names.loserName}`,
				detail: newMatch.score ?? undefined,
				bracketHref: `/events/${EVENT_SLUG}/divisions/${divId}`,
			});
		}
	}

	return newEvents;
}

function readActivityFeed() {
	if (!existsSync(ACTIVITY_PATH)) {
		return { lastUpdated: null, eventSlug: EVENT_SLUG, events: [] };
	}
	try {
		return JSON.parse(readFileSync(ACTIVITY_PATH, 'utf-8'));
	} catch {
		return { lastUpdated: null, eventSlug: EVENT_SLUG, events: [] };
	}
}

function writeActivityFeed(feed) {
	mkdirSync(dirname(ACTIVITY_PATH), { recursive: true });
	writeFileSync(ACTIVITY_PATH, JSON.stringify(feed, null, 2) + '\n');
}

function loadMatchOverrides() {
	if (!existsSync(OVERRIDES_PATH)) return {};
	try {
		return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8'));
	} catch {
		return {};
	}
}

/** Verified results the R2 scraper mis-read (e.g. WBF no-shows). Applied after each sync merge.
 *  File is keyed by event slug so Ocala corrections never leak into other stops. */
function applyMatchOverrides(divisions) {
	const overrides = loadMatchOverrides()[EVENT_SLUG] ?? {};
	for (const [motion, matches] of Object.entries(overrides)) {
		const divId = motion;
		if (!motion || typeof matches !== 'object') continue;
		const div = { ...(divisions[divId] ?? {}) };
		for (const [matchId, patch] of Object.entries(matches)) {
			div[matchId] = { ...(div[matchId] ?? {}), ...patch };
		}
		divisions[divId] = div;
	}
	return divisions;
}

async function main() {
	console.log('🎾  Syncing R2 Sports bracket results…');

	let existing = { lastUpdated: null, divisions: {} };
	if (existsSync(RESULTS_PATH)) {
		try {
			existing = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
		} catch {
			// ignore corrupt file
		}
	}

	const divisions = {};
	let scraped = 0;
	let totalMatches = 0;

	const browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	try {
		const context = await browser.newContext({
			userAgent:
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			viewport: { width: 1600, height: 1200 },
		});
		const page = await context.newPage();
		page.setDefaultTimeout(30000);

		// R2 page loads are flaky under load — retry each division a few times
		// so one slow response doesn't drop a division from the snapshot.
		const MAX_ATTEMPTS = 3;
		for (const { code, divID, combinedID } of DIVISION_URLS) {
			let lastErr = null;
			let succeeded = false;
			for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
				try {
					const { divCode, divId, data } = await processDivision(page, divID, combinedID);
					succeeded = true;
					if (!divId) {
						console.log(`  ⚠  ${code}: could not resolve division (got "${divCode}")`);
						break;
					}
					const matchCount = Object.keys(data).length;
					const withResults = Object.values(data).filter((d) => d.winner != null).length;
					if (matchCount > 0) {
						divisions[divId] = data;
						scraped++;
						totalMatches += withResults;
						console.log(`  ✓ ${code}: ${matchCount} match(es), ${withResults} with results → ${divId}`);
					} else {
						console.log(`  – ${code}: no data extracted yet`);
					}
				} catch (err) {
					lastErr = err;
					if (attempt < MAX_ATTEMPTS) {
						console.log(`  ↻ ${code}: attempt ${attempt} failed, retrying…`);
					}
				}
			}
			if (!succeeded) {
				console.log(`  ✗ ${code}: ${(lastErr?.message ?? String(lastErr)).slice(0, 120)}`);
			}
		}

		await context.close();
	} finally {
		await browser.close();
	}

	// Merge: overlay fresh data on top of existing. For each match, do a deep
	// merge so that a previously-confirmed winner/score is never lost if the
	// current scrape didn't re-detect it (e.g. because the player now appears
	// only as an abbreviated name in a later-round advancement cell).
	const mergedDivisions = { ...existing.divisions };
	for (const [divId, matches] of Object.entries(divisions)) {
		const existingDiv = mergedDivisions[divId] ?? {};
		const mergedDiv = { ...existingDiv };
		for (const [matchId, newMatch] of Object.entries(matches)) {
			// Spread existing first, then new — winner/score from existing are
			// preserved if the new scrape doesn't include them.
			mergedDiv[matchId] = { ...(existingDiv[matchId] ?? {}), ...newMatch };
		}
		mergedDivisions[divId] = mergedDiv;
	}

	applyMatchOverrides(mergedDivisions);

	const mergedStr = JSON.stringify(mergedDivisions);
	const existingStr = JSON.stringify(existing.divisions ?? {});
	if (mergedStr === existingStr) {
		console.log(`\n✅  No changes — ${RESULTS_PATH.split('/').pop()} is already up to date.`);
		return;
	}

	const at = new Date().toISOString();
	const output = {
		lastUpdated: at,
		divisions: mergedDivisions,
	};

	writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2) + '\n');

	const newActivity = detectActivityChanges(existing.divisions ?? {}, mergedDivisions, at);
	const prevFeed = readActivityFeed();
	const mergedEvents = [...newActivity, ...(prevFeed.events ?? [])].slice(0, MAX_ACTIVITY_EVENTS);
	const activityOutput = {
		lastUpdated: at,
		eventSlug: EVENT_SLUG,
		events: mergedEvents,
	};
	writeActivityFeed(activityOutput);

	console.log(`\n✅  Done. ${scraped} division(s), ${totalMatches} results written.`);
	if (newActivity.length) {
		console.log(`   Activity: ${newActivity.length} new feed item(s)`);
	}
	console.log(`   Updated: ${RESULTS_PATH}`);
	console.log(`   Updated: ${ACTIVITY_PATH}`);
}

main().catch((err) => {
	console.error('Fatal error in sync-r2-brackets:', err);
	process.exit(1);
});
