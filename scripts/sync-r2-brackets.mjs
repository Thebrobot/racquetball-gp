/**
 * sync-r2-brackets.mjs
 *
 * Scrapes live bracket results from R2 Sports and writes them to
 * src/data/ocala-results.json.  Called automatically by the GitHub Actions
 * cron workflow every 10 minutes during the tournament weekend.
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

const ROUND_LABELS = ['Round 1', 'Quarterfinals', 'Semifinals', 'Final'];

/**
 * Extract all bracket links from the R2 Sports divisions list page.
 * Returns array of { href, divisionId } objects.
 */
async function getBracketLinks(page) {
	await page.goto(DIVS_URL, { waitUntil: 'networkidle', timeout: 30000 });

	// Collect all <a> hrefs that look like bracket/draw links
	const links = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('a[href]'))
			.map((a) => a.href)
			.filter((href) => /brack|draw|Brack|Draw/i.test(href));
	});

	console.log(`  Found ${links.length} bracket link(s) on divisions page`);

	const result = [];
	for (const href of links) {
		// Try to extract division code from URL query string, e.g. DivisionCode=MO or DivCode=MO
		const codeMatch = href.match(/(?:DivisionCode|DivCode|divCode|divisionCode)=([^&]+)/i);
		if (codeMatch) {
			const code = decodeURIComponent(codeMatch[1]);
			const divId = CODE_ID_MAP[code];
			if (divId) {
				result.push({ href, divId, code });
			}
		} else {
			// Try to match by TID in the URL and treat as generic bracket link
			result.push({ href, divId: null, code: null });
		}
	}

	return result;
}

/**
 * Extract match results from a bracket page.
 * Returns { rounds: [ { label, matches: [{player1, player2, score, winner}] } ] }
 */
async function extractBracketData(page) {
	return page.evaluate((ROUND_LABELS) => {
		const rounds = [];

		// ── Strategy 1: Look for explicit round headers ─────────────────────────
		// R2 Sports often renders bracket columns with header labels
		const allText = document.body.innerText;
		const hasResults = /\d+\s*[-–]\s*\d+/.test(allText); // any "11-5" style score

		if (!hasResults) {
			// No scores yet — tournament hasn't started or no results posted
			return rounds;
		}

		// ── Strategy 2: Find match box elements ────────────────────────────────
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

		// ── Strategy 3: Fallback — any <td> with 2+ player-looking lines ───────
		if (!matchBoxes.length) {
			matchBoxes = Array.from(document.querySelectorAll('td')).filter((td) => {
				const lines = (td.innerText ?? '')
					.split('\n')
					.map((l) => l.trim())
					.filter(Boolean);
				return lines.length >= 2 && lines.length <= 8;
			});
		}

		if (!matchBoxes.length) return rounds;

		// Group boxes into columns (rounds) by x-position
		const colMap = new Map();
		for (const box of matchBoxes) {
			const rect = box.getBoundingClientRect();
			if (rect.width < 10 || rect.height < 5) continue; // skip invisible
			const col = Math.round(rect.left / 20) * 20;
			if (!colMap.has(col)) colMap.set(col, []);
			colMap.get(col).push(box);
		}

		const sortedCols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
		const scoreRe = /^\d+(\s*[-,]\s*\d+)+$/;

		let roundIdx = 0;
		for (const [, boxes] of sortedCols) {
			const matches = [];

			for (const box of boxes) {
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

				// Detect winner by bold/highlight
				const winnerEl = box.querySelector('.winner, [class*="winner"], strong, b');
				if (winnerEl) {
					const wn = winnerEl.textContent?.trim();
					if (wn && wn.includes(player1.split(' ')[0])) winner = 1;
					else if (wn && wn.includes(player2.split(' ')[0])) winner = 2;
				}

				matches.push({ player1, player2, score, winner });
			}

			if (matches.length) {
				rounds.push({
					label: ROUND_LABELS[roundIdx] ?? `Round ${roundIdx + 1}`,
					matches,
				});
				roundIdx++;
			}
		}

		return rounds;
	}, ROUND_LABELS);
}

async function main() {
	console.log('🎾  Syncing R2 Sports bracket results…');

	// Load existing data to avoid clobbering on partial failure
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

		// Visit home page first to establish session/cookies
		console.log('  Visiting tournament home page…');
		await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

		// Collect bracket links from the divisions page
		console.log('  Loading divisions list…');
		const bracketLinks = await getBracketLinks(page);

		if (!bracketLinks.length) {
			console.log('  ⚠  No bracket links found — trying direct URL construction…');

			// Fallback: construct URLs for each division code directly
			for (const [code, divId] of Object.entries(CODE_ID_MAP)) {
				const url = `https://www.r2sports.com/tourney/t-bracket.asp?TID=${TID}&DivisionCode=${encodeURIComponent(code)}`;
				try {
					await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
					const status = page.url();
					if (status.includes('404') || status.includes('error')) continue;

					const data = await extractBracketData(page);
					if (data?.rounds?.length) {
						divisions[divId] = data;
						scraped++;
						console.log(`  ✓ ${code}: ${data.rounds.length} round(s)`);
					} else {
						console.log(`  – ${code}: no results yet`);
					}
				} catch (err) {
					console.log(`  ✗ ${code}: ${err.message.slice(0, 80)}`);
				}
			}
		} else {
			// Use the links found on the page
			for (const { href, divId, code } of bracketLinks) {
				const label = code ?? href;
				try {
					await page.goto(href, { waitUntil: 'networkidle', timeout: 15000 });
					const data = await extractBracketData(page);
					const resolvedId = divId ?? 'unknown';
					if (data?.rounds?.length) {
						divisions[resolvedId] = data;
						scraped++;
						console.log(`  ✓ ${label}: ${data.rounds.length} round(s)`);
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

	const merged = {
		lastUpdated: new Date().toISOString(),
		divisions: { ...existing.divisions, ...divisions },
	};

	writeFileSync(RESULTS_PATH, JSON.stringify(merged, null, 2) + '\n');

	console.log(`\n✅  Done. Scraped ${scraped} division(s) with results.`);
	console.log(`   Updated: ${RESULTS_PATH}`);
}

main().catch((err) => {
	console.error('Fatal error in sync-r2-brackets:', err);
	// Exit 0 so the workflow doesn't fail — scraping is best-effort.
	// The commit step will only run if ocala-results.json actually changed.
	process.exit(0);
});
