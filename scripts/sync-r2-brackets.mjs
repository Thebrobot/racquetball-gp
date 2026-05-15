/**
 * sync-r2-brackets.mjs
 *
 * Scrapes live bracket results from R2 Sports and writes them to
 * src/data/ocala-results.json.  Called automatically by the GitHub Actions
 * cron workflow every 10 minutes during the tournament weekend.
 *
 * Results are keyed by match ID (e.g. "MO9" for Single Elim, "MC1" for Round
 * Robin) for precise merging with the static bracket data in src/data/events.ts.
 *
 * Two extractors:
 *   • extractSingleElimData() — for view-bracket.asp pages
 *   • extractRoundRobinData() — for roundRobin.asp pages
 *
 * Both routes are detected by the final URL after R2's drawOut.asp redirect.
 *
 * Usage:
 *   node scripts/sync-r2-brackets.mjs
 *
 * Requires Playwright (already a devDependency):
 *   npx playwright install chromium --with-deps
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = resolve(__dirname, '../src/data/ocala-results.json');
const TID = '53697';
const HOME_URL = `https://www.r2sports.com/tourney/home.asp?TID=${TID}`;
const DIVS_URL = `https://www.r2sports.com/tourney/divisions/listAllDivs.asp?TID=${TID}&sortBy=defaultOrder`;
const DRAWOUT_BASE = `https://www.r2sports.com/tourney/drawsOut/drawOut.asp?TID=${TID}`;

// Map short codes used in URLs → our internal IDs
const CODE_ID_MAP = {
	MO: 'mens-singles-open',
	ME: 'mens-singles-elite',
	MA: 'mens-singles-a',
	MB: 'mens-singles-b',
	MC: 'mens-singles-c',
	'M50+': 'mens-age-50',
	'M60+': 'mens-age-60',
	'M70+': 'mens-age-70',
	MOD: 'mens-doubles-open',
	MED: 'mens-doubles-elite',
	MAD: 'mens-doubles-a',
	MBD: 'mens-doubles-b',
	MCOD: 'mens-doubles-centurion',
	MSCD: 'mens-doubles-super-centurion',
	MXOA: 'mixed-doubles',
};

/**
 * R2's division list uses javascript:viewBracket(divID, combinedID). Playwright
 * cannot navigate to javascript: URLs, so convert to the real drawOut.asp URL.
 * drawOut.asp then 302-redirects to either view-bracket.asp (single-elim)
 * or roundRobin.asp (round robin).
 */
function normalizeBracketUrl(href) {
	const s = String(href ?? '').trim();
	const js = s.match(/viewBracket\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
	if (js) {
		return `${DRAWOUT_BASE}&divID=${js[1]}&combinedID=${js[2]}`;
	}
	if (/^https?:\/\//i.test(s) && /drawOut\.asp/i.test(s)) {
		return s.split('#')[0];
	}
	return null;
}

/** Pull "(MO)", "(ME)", etc. out of the bracket page header text. */
async function resolveDivisionCodeFromBracketPage(page) {
	return page.evaluate(() => {
		const chunk = (document.body?.innerText ?? '').slice(0, 16000);
		const m = chunk.match(/\(\s*([A-Z][A-Z0-9+]*)\s*\)\s*(?:Men|Women|Mixed)/);
		return m ? m[1] : null;
	});
}

/** Extract all bracket links from the divisions list page. */
async function getBracketLinks(page) {
	await page.goto(DIVS_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });

	const rawHrefs = await page.evaluate(() =>
		Array.from(document.querySelectorAll('a[href]'))
			.map((a) => a.getAttribute('href'))
			.filter((h) => h && /viewBracket\s*\(/i.test(h)),
	);

	const seen = new Set();
	const result = [];
	for (const raw of rawHrefs) {
		const href = normalizeBracketUrl(raw);
		if (!href || seen.has(href)) continue;
		seen.add(href);
		result.push({ href });
	}

	console.log(`  Found ${result.length} unique drawOut bracket URL(s) from divisions page`);
	return result;
}

/**
 * Single-elimination bracket extractor.
 *
 * Strategy: anchor on every <a> whose href contains "viewAppMatch" — each one
 * is a real match.  The link's text is the display match ID (e.g. "MO9").
 * Player names come from the nearest profile-player.asp anchors (or bolded
 * abbreviated names like "G Fry" in later rounds) directly above and below
 * the match cell in page coordinates.  Result text ("WBF - No Show" or
 * digit-digit scores) is read from the match cell.
 */
async function extractSingleElimData(page, divCode) {
	return page.evaluate((divCode) => {
		const results = {};

		const cleanName = (s) =>
			(s ?? '')
				.replace(/\s*:\s*.*$/, '') // strip ": *City, ST*" suffix
				.replace(/\s+/g, ' ')
				.trim();

		const looksLikeJunk = (s) => {
			if (!s) return true;
			const t = s.trim();
			if (t.length < 2 || t.length > 80) return true;
			if (/[|]/.test(t)) return true;
			if (/^\(/.test(t)) return true; // division headers like "(MO) Men's Singles..."
			if (/^WBF\b|No[\s-]?Show|Forfeit|Injury|Win\s+By/i.test(t)) return true; // result strings
			if (/^\d/.test(t)) return true; // names never start with a digit (rejects "2026 Florida Open...", "1st", etc.)
			if (/^(Men'?s|Women'?s|Mixed|Boys'?|Girls'?)\s/i.test(t)) return true; // division labels
			if (/^(Director Login|Software Support|USA Racquetball|More Racquetball|Racquetball Software|Racquetball Ladder|Home$|Brackets$|Results$|Times$|Login$|Print|Save|View Event|Online Event|Registered Participants|By Country|By State|By City|By Venue|By School|First Round Start|Visit our|R2 Sports|Privacy|Refund|Copyright|Site by|Racquetball Tournament|Racquetball Event|Racquetball Director|Latin American|Rapha International|Jeff Hart|Frank Hotels|Florida Racquetball|Imaginex|Facebook|Hotel|Map|Sponsors|Prizes|Info|Register|Contact|Media|Divs|USAR|Single Elimination|Round Robin|Champion|CHAMPION|EVENTDIVISIONS|Instructions|Qtrs?$|Quarters$|Semis?$|Semifinals$|Finals?$|16s$|32s$|64s$|8s$|4s$|2s$)/i.test(t)) return true;
			if (/Tournament Bracket|Event Sponsors|Event Information|All rights reserved|drawOut|view-bracket|profile-player|sortBy|TID=/i.test(t)) return true;
			if (/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(t)) return true; // match-ID-like ("MO9")
			if (/^[A-Z][A-Z0-9+]{0,4}\s+\d{1,3}$/.test(t)) return true; // "MC 1" style
			if (/^(Sa|Su|Mo|Tu|We|Th|Fr|Sat|Sun|Mon|Tue|Wed|Thu|Fri)\b/i.test(t)) return true; // schedules
			if (/^\d{1,3}\s*[-–]\s*\d/.test(t)) return true; // looks like a score
			return false;
		};

		const looksLikePlayerName = (s) => {
			if (looksLikeJunk(s)) return false;
			const t = s.trim();
			// Real player names always have either a space (first+last) or a slash
			// (doubles team).  Single-word strings like "Qtrs", "Final", "Champion"
			// are excluded.  Allows abbreviated advancers like "G Fry", "M Ammen".
			return /[A-Za-z]/.test(t) && (t.includes(' ') || t.includes('/'));
		};

		const isBye = (s) => /^BYE$/i.test((s ?? '').trim());

		const extractScore = (text) => {
			const t = String(text ?? '');
			const wbf = t.match(/WBF[^\n\r]*/i);
			if (wbf) return wbf[0].replace(/\s*\[.*$/, '').trim();
			const num = t.match(/\d{1,3}\s*[-–]\s*\d{1,3}(?:\s*,\s*\d{1,3}\s*[-–]\s*\d{1,3}){0,4}/);
			if (num) return num[0].replace(/–/g, '-').replace(/\s+/g, '');
			return null;
		};

		const matchLinks = Array.from(document.querySelectorAll('a[href*="viewAppMatch"]'));
		const matchCells = new Set(matchLinks.map((l) => l.closest('td')).filter(Boolean));

		// Player-name candidates: every bold/strong with a valid name OR BYE, PLUS
		// every profile-player anchor (some R2 layouts put the bold inside the
		// anchor; others render the bold as a sibling).  We allow bolds inside
		// profile anchors so both layouts produce a hit.
		const boldEls = Array.from(document.querySelectorAll('b, strong')).filter((el) => {
			const t = cleanName(el.textContent);
			return looksLikePlayerName(t) || isBye(t);
		});
		const profileAnchors = Array.from(document.querySelectorAll('a[href*="profile-player.asp"]'));

		const candidates = [
			...boldEls.map((el) => ({ el })),
			...profileAnchors.map((el) => ({ el })),
		];

		for (const link of matchLinks) {
			const matchId = (link.textContent ?? '').trim();
			if (!/^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/.test(matchId)) continue;

			const linkRect = link.getBoundingClientRect();
			if (linkRect.width < 1 || linkRect.height < 1) continue;

			const ownCell = link.closest('td');
			const linkCenterX = (linkRect.left + linkRect.right) / 2;
			const linkCenterY = (linkRect.top + linkRect.bottom) / 2;

			const scored = candidates
				.map(({ el }) => {
					// Reject candidates that live inside a DIFFERENT match's cell.
					// This stops M70+4 from grabbing the "BYE" label that belongs to
					// the adjacent M70+8 cell.
					const candCell = el.closest('td');
					if (candCell && candCell !== ownCell && matchCells.has(candCell)) return null;

					const r = el.getBoundingClientRect();
					if (r.width < 1 || r.height < 1) return null;
					const cx = (r.left + r.right) / 2;
					const cy = (r.top + r.bottom) / 2;
					return {
						el,
						dx: linkCenterX - cx, // positive = candidate is left of link
						dy: cy - linkCenterY, // negative = candidate is above link
						text: cleanName(el.textContent) || (isBye(el.textContent) ? 'BYE' : ''),
					};
				})
				.filter(Boolean)
				.filter((c) => c.dx >= -10 && c.dx <= 400)
				.filter((c) => Math.abs(c.dy) <= 120)
				// Drop candidates whose text fails validation early so they don't
				// "win" the above/below slot and block a valid candidate behind them.
				.filter((c) => looksLikePlayerName(c.text) || isBye(c.text));

			const above = scored
				.filter((c) => c.dy < 0)
				.sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy))[0];
			const below = scored
				.filter((c) => c.dy > 0)
				.sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy))[0];

			const player1Raw = above?.text || '';
			const player2Raw = below?.text || '';

			const cell = link.closest('td') ?? link.parentElement;
			const cellText = (cell?.innerText ?? '').trim();
			const score = extractScore(cellText);

			const entry = {};
			if (looksLikePlayerName(player1Raw) || isBye(player1Raw)) entry.player1 = player1Raw;
			if (looksLikePlayerName(player2Raw) || isBye(player2Raw)) entry.player2 = player2Raw;
			if (score) entry.score = score;

			if (!entry.player1 && !entry.player2 && !entry.score) continue;
			if (isBye(player1Raw) && isBye(player2Raw)) continue;

			results[matchId] = entry;
		}

		return results;
	}, divCode);
}

/**
 * Round-robin extractor (roundRobin.asp pages).
 *
 * Walks the schedule table at the bottom of the page (Round | Versus |
 * Participants | Times | Scores | Code).  Keys by the displayed match code
 * (e.g. "MC 1" → normalized "MC1") and emits player1/player2/score/winner
 * for each row.
 */
async function extractRoundRobinData(page, divCode) {
	return page.evaluate((divCode) => {
		const results = {};

		const extractScore = (text) => {
			const t = String(text ?? '');
			const wbf = t.match(/WBF[^\n\r]*/i);
			if (wbf) return wbf[0].replace(/\s*\[.*$/, '').trim();
			const num = t.match(/\d{1,3}\s*[-–]\s*\d{1,3}(?:\s*,\s*\d{1,3}\s*[-–]\s*\d{1,3}){0,4}/);
			if (num) return num[0].replace(/–/g, '-').replace(/\s+/g, '');
			return null;
		};

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

			const versus = rowText.match(
				/([A-Z][A-Za-z .'\-/]+?)\s+vs\.?\s+([A-Z][A-Za-z .'\-/]+?)(?:\s+-\s+W)?\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|Sat|Sun|Mon|Tue|Wed|Thu|Fri)\b/,
			);
			if (!versus) continue;

			const player1 = versus[1].trim();
			const player2 = versus[2].trim();
			const score = extractScore(rowText);

			let winner;
			if (/vs\.?\s+[A-Z][A-Za-z .'\-/]+?\s+-\s+W\s+(?:Sa|Su|Mo|Tu|We|Th|Fr|Sat|Sun|Mon|Tue|Wed|Thu|Fri)/.test(rowText)) {
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
	}, divCode);
}

async function processOneBracket(page, href) {
	await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 25000 });
	// Let bracket tables lay out so getBoundingClientRect returns real coords.
	await page.waitForTimeout(400);

	const url = page.url();
	const divCode = await resolveDivisionCodeFromBracketPage(page);
	const divId = divCode ? CODE_ID_MAP[divCode] : null;

	if (!divId) return { divId: null, divCode, format: null, data: {} };

	let data;
	let format;
	if (/roundRobin\.asp/i.test(url)) {
		format = 'rr';
		data = await extractRoundRobinData(page, divCode);
	} else {
		format = 'se';
		data = await extractSingleElimData(page, divCode);
	}
	return { divId, divCode, format, data };
}

async function main() {
	console.log('🎾  Syncing R2 Sports bracket results…');

	let existing = { lastUpdated: null, divisions: {} };
	if (existsSync(RESULTS_PATH)) {
		try {
			existing = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
		} catch {
			// ignore
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
		page.setDefaultTimeout(20000);

		console.log('  Visiting tournament home page…');
		await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

		console.log('  Loading divisions list…');
		const bracketLinks = await getBracketLinks(page);

		if (!bracketLinks.length) {
			console.log('  ⚠  No viewBracket links on divisions page; aborting.');
		} else {
			for (const { href } of bracketLinks) {
				const label = href.slice(-80);
				try {
					const { divId, divCode, format, data } = await processOneBracket(page, href);
					if (!divId) {
						console.log(`  ⚠  Skip (unknown division code "${divCode}"): …${label}`);
						continue;
					}
					const matchCount = Object.keys(data).length;
					if (matchCount > 0) {
						divisions[divId] = data;
						scraped++;
						totalMatches += matchCount;
						console.log(`  ✓ ${divCode} [${format}]: ${matchCount} match(es) → ${divId}`);
					} else {
						console.log(`  – ${divCode} [${format}]: no extractable results yet`);
					}
				} catch (err) {
					console.log(`  ✗ …${label}: ${(err.message ?? String(err)).slice(0, 100)}`);
				}
			}
		}

		await context.close();
	} finally {
		await browser.close();
	}

	// Merge: preserve existing match results, overlay newly scraped data.
	const mergedDivisions = { ...existing.divisions };
	for (const [divId, matches] of Object.entries(divisions)) {
		mergedDivisions[divId] = { ...(mergedDivisions[divId] ?? {}), ...matches };
	}

	const mergedStr = JSON.stringify(mergedDivisions);
	const existingStr = JSON.stringify(existing.divisions ?? {});
	if (mergedStr === existingStr) {
		console.log('\n✅  No division result changes; leaving ocala-results.json as-is.');
		return;
	}

	const output = {
		lastUpdated: new Date().toISOString(),
		divisions: mergedDivisions,
	};

	writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2) + '\n');

	console.log(`\n✅  Done. Scraped ${scraped} division(s), ${totalMatches} match(es) total.`);
	console.log(`   Updated: ${RESULTS_PATH}`);
}

main().catch((err) => {
	console.error('Fatal error in sync-r2-brackets:', err);
	process.exit(1);
});
