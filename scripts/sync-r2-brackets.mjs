/**
 * sync-r2-brackets.mjs
 *
 * Scrapes live bracket results from R2 Sports and writes them to
 * src/data/ocala-results.json.  Called automatically by the GitHub Actions
 * cron workflow every 10 minutes during the tournament weekend.
 *
 * Results are keyed by match ID (e.g. "MO9") for precise merging with the
 * static bracket data in src/data/events.ts.
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

// Map R2 Sports division labels (as they appear on the page) → our internal IDs
const DIVISION_ID_MAP = {
	"Men's Singles: Open": 'mens-singles-open',
	"Men's Singles: Elite": 'mens-singles-elite',
	"Men's Singles: A": 'mens-singles-a',
	"Men's Singles: B": 'mens-singles-b',
	"Men's Singles: C": 'mens-singles-c',
	"Men's Age Singles: 50+": 'mens-age-50',
	"Men's Age Singles: 60+": 'mens-age-60',
	"Men's Age Singles: 70+": 'mens-age-70',
	"Men's Doubles: Open": 'mens-doubles-open',
	"Men's Doubles: Elite": 'mens-doubles-elite',
	"Men's Doubles: A": 'mens-doubles-a',
	"Men's Doubles: B": 'mens-doubles-b',
	"Men's Doubles: Centurion+ Open": 'mens-doubles-centurion',
	"Men's Doubles: Super Centurion (120+)": 'mens-doubles-super-centurion',
	'Mixed Doubles: Open/A': 'mixed-doubles',
};

// Map short codes used in URLs → our internal IDs (fallback)
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
 * Extract all bracket links from the R2 Sports divisions list page.
 * Returns array of { href, divisionId } objects.
 */
async function getBracketLinks(page) {
	await page.goto(DIVS_URL, { waitUntil: 'networkidle', timeout: 30000 });

	const links = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('a[href]'))
			.map((a) => a.href)
			.filter((href) => /brack|draw|Brack|Draw/i.test(href));
	});

	console.log(`  Found ${links.length} bracket link(s) on divisions page`);

	const result = [];
	for (const href of links) {
		const codeMatch = href.match(/(?:DivisionCode|DivCode|divCode|divisionCode)=([^&]+)/i);
		if (codeMatch) {
			const code = decodeURIComponent(codeMatch[1]);
			const divId = CODE_ID_MAP[code];
			if (divId) {
				result.push({ href, divId, code });
			}
		} else {
			result.push({ href, divId: null, code: null });
		}
	}

	return result;
}

/**
 * Extract match results from a bracket page, keyed by match ID.
 *
 * Returns a flat object: { [matchId]: { player1, player2, score, winner } }
 *
 * Match IDs are extracted from each match box text (R2 renders them as short
 * alphanumeric codes like "MO9", "ME11", "MAD3"). If no ID is found for a
 * match, a fallback key is generated from the division code + index.
 *
 * @param {import('playwright').Page} page
 * @param {string} divCode - Division short code (e.g. "MO") for fallback IDs
 */
async function extractBracketData(page, divCode) {
	return page.evaluate((divCode) => {
		const results = {};

		const allText = document.body.innerText;
		const hasResults = /\d+\s*[-–]\s*\d+/.test(allText);

		if (!hasResults) {
			return results;
		}

		// ── Find match box elements ──────────────────────────────────────────────
		const BOX_SELECTORS = [
			'.bracketMatchBox',
			'.matchBox',
			'td.brkt',
			'td[class*="match"]',
			'div[class*="matchBox"]',
			'table.bracketTable td',
		];

		let matchBoxes = [];
		for (const sel of BOX_SELECTORS) {
			const found = document.querySelectorAll(sel);
			if (found.length >= 2) {
				matchBoxes = Array.from(found);
				break;
			}
		}

		if (!matchBoxes.length) {
			matchBoxes = Array.from(document.querySelectorAll('td')).filter((td) => {
				const lines = (td.innerText ?? '')
					.split('\n')
					.map((l) => l.trim())
					.filter(Boolean);
				return lines.length >= 2 && lines.length <= 8;
			});
		}

		if (!matchBoxes.length) return results;

		const scoreRe = /^\d+(\s*[-,]\s*\d+)+$/;
		// Match ID pattern: 1-4 uppercase letters (optionally with digits/+) followed by 1-3 digits
		const matchIdRe = /^[A-Z][A-Z0-9+]{0,4}\d{1,3}$/;

		let fallbackIdx = 0;

		for (const box of matchBoxes) {
			const rect = box.getBoundingClientRect();
			if (rect.width < 10 || rect.height < 5) continue;

			const lines = (box.innerText ?? '')
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean);

			if (lines.length < 2) continue;

			const scoreLines = lines.filter((l) => scoreRe.test(l));
			const nameLines = lines.filter((l) => !scoreRe.test(l) && l.length > 1);

			if (nameLines.length < 2) continue;

			const player1 = nameLines[0];
			const player2 = nameLines[1];
			let score = null;
			let winner = null;

			if (scoreLines.length === 2) {
				score = `${scoreLines[0]}, ${scoreLines[1]}`;
			} else if (scoreLines.length === 1) {
				score = scoreLines[0];
			}

			// Detect winner by bold/highlight styling
			const winnerEl = box.querySelector('.winner, [class*="winner"], strong, b');
			if (winnerEl) {
				const wn = winnerEl.textContent?.trim();
				if (wn && wn.includes(player1.split(' ')[0])) winner = 1;
				else if (wn && wn.includes(player2.split(' ')[0])) winner = 2;
			}

			// ── Extract match ID ─────────────────────────────────────────────────
			let matchId = null;

			// Strategy 1: Look for match ID in the box text lines
			for (const line of lines) {
				if (matchIdRe.test(line)) {
					matchId = line;
					break;
				}
			}

			// Strategy 2: Check adjacent/parent elements for match ID labels
			if (!matchId) {
				const parent = box.parentElement;
				if (parent) {
					const siblings = parent.querySelectorAll('span, div, td, font, small');
					for (const el of siblings) {
						const t = (el.textContent ?? '').trim();
						if (matchIdRe.test(t)) {
							matchId = t;
							break;
						}
					}
				}
			}

			// Strategy 3: Check data attributes
			if (!matchId) {
				const dataId = box.getAttribute('data-match-id') ||
					box.getAttribute('data-matchid') ||
					box.getAttribute('id');
				if (dataId && matchIdRe.test(dataId.toUpperCase())) {
					matchId = dataId.toUpperCase();
				}
			}

			// Fallback: generate a synthetic key from division code + index
			if (!matchId) {
				matchId = `${divCode}_idx${fallbackIdx}`;
			}
			fallbackIdx++;

			const entry = { player1, player2 };
			if (score != null) entry.score = score;
			if (winner != null) entry.winner = winner;

			results[matchId] = entry;
		}

		return results;
	}, divCode);
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

	const browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	try {
		const context = await browser.newContext({
			userAgent:
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
		});
		const page = await context.newPage();
		page.setDefaultTimeout(20000);

		console.log('  Visiting tournament home page…');
		await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

		console.log('  Loading divisions list…');
		const bracketLinks = await getBracketLinks(page);

		if (!bracketLinks.length) {
			console.log('  ⚠  No bracket links found — trying direct URL construction…');

			for (const [code, divId] of Object.entries(CODE_ID_MAP)) {
				const url = `https://www.r2sports.com/tourney/t-bracket.asp?TID=${TID}&DivisionCode=${encodeURIComponent(code)}`;
				try {
					await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
					const status = page.url();
					if (status.includes('404') || status.includes('error')) continue;

					const data = await extractBracketData(page, code);
					const matchCount = Object.keys(data).length;
					if (matchCount > 0) {
						divisions[divId] = data;
						scraped++;
						console.log(`  ✓ ${code}: ${matchCount} match(es)`);
					} else {
						console.log(`  – ${code}: no results yet`);
					}
				} catch (err) {
					console.log(`  ✗ ${code}: ${err.message.slice(0, 80)}`);
				}
			}
		} else {
			for (const { href, divId, code } of bracketLinks) {
				const label = code ?? href;
				const resolvedCode = code ?? 'UNK';
				try {
					await page.goto(href, { waitUntil: 'networkidle', timeout: 15000 });
					const data = await extractBracketData(page, resolvedCode);
					const resolvedId = divId ?? 'unknown';
					const matchCount = Object.keys(data).length;
					if (matchCount > 0) {
						divisions[resolvedId] = data;
						scraped++;
						console.log(`  ✓ ${label}: ${matchCount} match(es)`);
					} else {
						console.log(`  – ${label}: no results yet`);
					}
				} catch (err) {
					console.log(`  ✗ ${label}: ${err.message.slice(0, 80)}`);
				}
			}
		}

		await context.close();
	} finally {
		await browser.close();
	}

	// Merge: preserve existing match results, overlay newly scraped data
	const mergedDivisions = { ...existing.divisions };
	for (const [divId, matches] of Object.entries(divisions)) {
		mergedDivisions[divId] = { ...(mergedDivisions[divId] ?? {}), ...matches };
	}

	const output = {
		lastUpdated: new Date().toISOString(),
		divisions: mergedDivisions,
	};

	writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2) + '\n');

	console.log(`\n✅  Done. Scraped ${scraped} division(s) with results.`);
	console.log(`   Updated: ${RESULTS_PATH}`);
}

main().catch((err) => {
	console.error('Fatal error in sync-r2-brackets:', err);
	process.exit(0);
});
