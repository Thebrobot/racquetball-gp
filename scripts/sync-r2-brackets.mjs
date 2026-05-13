/**
 * sync-r2-brackets.mjs
 *
 * Scrapes live bracket results from the R2 Sports tournament page and writes
 * them to src/data/ocala-results.json.  Run this script during the tournament
 * weekend (it is called automatically by the GitHub Actions cron workflow).
 *
 * Usage:
 *   node scripts/sync-r2-brackets.mjs
 *
 * Requires Playwright:
 *   npm install -D playwright
 *   npx playwright install chromium --with-deps
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = resolve(__dirname, '../src/data/ocala-results.json');
const TID = '53697';
const BASE_URL = `https://www.r2sports.com`;
const DIVS_URL = `${BASE_URL}/tourney/divisions/listAllDivs.asp?TID=${TID}&sortBy=defaultOrder`;

// Map R2 Sports division abbreviations → our internal division IDs
const DIVISION_CODE_MAP = {
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

// Human-readable division names on R2 → our internal IDs (fallback matching)
const DIVISION_NAME_MAP = {
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

/** Normalise "Sat" / "SAT" / "Saturday" + time → "Saturday · HH:MM AM/PM" */
function normaliseDayTime(raw) {
	if (!raw) return undefined;
	const cleaned = raw.replace(/\s+/g, ' ').trim();
	const m = cleaned.match(
		/^(fri(?:day)?|sat(?:urday)?|sun(?:day)?)[,.\s]+(\d{1,2}:\d{2}\s*(?:AM|PM))/i
	);
	if (!m) return cleaned;
	const days = { fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
	const dayKey = m[1].slice(0, 3).toLowerCase();
	return `${days[dayKey] ?? m[1]} · ${m[2].toUpperCase().replace(/\s/g, '')}`;
}

/**
 * Extract bracket data from the current page.
 * R2 Sports renders single-elimination brackets as nested tables.
 * Each "round" is a column; each match box contains two player rows plus score.
 */
async function extractBracketRounds(page) {
	return page.evaluate(() => {
		const rounds = [];

		// R2 Sports bracket page: rounds are labelled headers like "Round 1", "Semifinals", "Final"
		// Matches are table cells containing two player name spans and a score span.

		// Strategy: find all elements that look like match containers
		// Typical R2 structure: <td class="bracketMatchBox"> or similar

		// Attempt 1: look for round header + match grid structure
		const roundHeaders = Array.from(
			document.querySelectorAll(
				'[class*="roundHeader"], [class*="round-header"], .bracketRound > .roundLabel, td.roundName, th.roundName'
			)
		);

		// Attempt 2: fall back to looking for any table structure with player pairs
		// We'll collect all visible text blocks that look like "Player A\nScore\nPlayer B"
		function getTextContent(el) {
			return el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		}

		// Find match boxes by common class names R2 uses
		const matchBoxSelectors = [
			'.bracketMatchBox',
			'.matchBox',
			'td.brkt',
			'td[class*="match"]',
			'div[class*="matchBox"]',
			'div[class*="bracket-match"]',
		];

		let matchBoxes = [];
		for (const sel of matchBoxSelectors) {
			matchBoxes = Array.from(document.querySelectorAll(sel));
			if (matchBoxes.length) break;
		}

		if (!matchBoxes.length) {
			// Fallback: scan all table cells for cells that contain exactly two player-looking lines
			matchBoxes = Array.from(document.querySelectorAll('table td')).filter((td) => {
				const lines = td.innerText
					?.split('\n')
					.map((l) => l.trim())
					.filter(Boolean);
				return lines && lines.length >= 2 && lines.length <= 6;
			});
		}

		// Group match boxes into rounds based on their x-position (column)
		if (matchBoxes.length) {
			const byColumn = new Map();
			for (const box of matchBoxes) {
				const rect = box.getBoundingClientRect();
				const col = Math.round(rect.left / 10) * 10; // bucket by 10px
				if (!byColumn.has(col)) byColumn.set(col, []);
				byColumn.get(col).push(box);
			}

			const ROUND_LABELS = ['Round 1', 'Round 2', 'Quarterfinals', 'Semifinals', 'Final'];
			let roundIdx = 0;

			for (const [, boxes] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
				const matches = [];
				for (const box of boxes) {
					const lines = box.innerText
						?.split('\n')
						.map((l) => l.trim())
						.filter(Boolean) ?? [];

					if (lines.length < 2) continue;

					// Try to identify player names and scores
					// Typical pattern: player1, score1, player2, score2  OR  player1, player2, score
					let player1 = '',
						player2 = '',
						score = null,
						winner = null;

					const scorePattern = /^\d+(\s*[-,]\s*\d+)+$/;

					// Find score lines
					const scoreLines = lines.filter((l) => scorePattern.test(l));
					const nameLines = lines.filter((l) => !scorePattern.test(l) && l.length > 1);

					if (nameLines.length >= 2) {
						player1 = nameLines[0];
						player2 = nameLines[1];
					}

					if (scoreLines.length >= 2) {
						// Two separate score values → "score1 - score2"
						score = scoreLines.join(', ');
					} else if (scoreLines.length === 1) {
						score = scoreLines[0];
					}

					// Determine winner by highlighted/bold rows or score comparison
					const winnerEl = box.querySelector(
						'.winner, .winnerName, [class*="winner"], strong, b'
					);
					if (winnerEl) {
						const winnerName = winnerEl.textContent?.trim();
						if (winnerName === player1) winner = 1;
						else if (winnerName === player2) winner = 2;
					}

					if (!player1 && !player2) continue;
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
		}

		return rounds;
	});
}

/** Navigate to a division's bracket page from the divisions list and extract results */
async function scrapeDivision(page, divisionName) {
	try {
		// Go back to divisions list if needed
		if (!page.url().includes('listAllDivs')) {
			await page.goto(DIVS_URL, { waitUntil: 'networkidle', timeout: 30000 });
		}

		// Find a link containing the division name or abbreviation and click "Draws/Bracket" icon
		// R2 Sports renders each row as: [draw icon] [results icon] [name]
		const divRow = await page
			.locator(`text=${divisionName}`)
			.first()
			.locator('..')
			.locator('..');

		// Click the bracket/draws icon (typically first icon in the row)
		const bracketLink = divRow.locator('a[href*="brack"], a[href*="draw"], a[href*="Brack"], a[href*="Draw"]').first();
		if (!(await bracketLink.count())) {
			console.log(`  ⚠ No bracket link found for "${divisionName}"`);
			return null;
		}

		await bracketLink.click();
		await page.waitForLoadState('networkidle', { timeout: 20000 });

		const rounds = await extractBracketRounds(page);
		console.log(`  ✓ ${divisionName}: ${rounds.length} round(s), ${rounds.flatMap((r) => r.matches).length} match(es)`);
		return rounds.length ? { rounds } : null;
	} catch (err) {
		console.error(`  ✗ ${divisionName}: ${err.message}`);
		return null;
	}
}

async function main() {
	console.log('🎾 Syncing R2 Sports bracket results…');

	const browser = await chromium.launch({ headless: true });
	const divisions = {};

	try {
		const page = await browser.newPage();
		page.setDefaultTimeout(30000);

		// Load the divisions list page first
		console.log('  Loading divisions list…');
		await page.goto(DIVS_URL, { waitUntil: 'networkidle', timeout: 30000 });

		for (const [divisionName, divId] of Object.entries(DIVISION_NAME_MAP)) {
			console.log(`Scraping: ${divisionName}`);
			const result = await scrapeDivision(page, divisionName);
			if (result) divisions[divId] = result;
			// Return to divisions list for next iteration
			await page.goto(DIVS_URL, { waitUntil: 'networkidle', timeout: 30000 });
		}

		await page.close();
	} finally {
		await browser.close();
	}

	// Read existing results to avoid overwriting with empty data on parse failure
	let existing = { lastUpdated: null, divisions: {} };
	if (existsSync(RESULTS_PATH)) {
		try {
			existing = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
		} catch {
			// ignore parse error
		}
	}

	// Merge: only overwrite a division's data if we successfully scraped it
	const merged = {
		lastUpdated: new Date().toISOString(),
		divisions: { ...existing.divisions, ...divisions },
	};

	writeFileSync(RESULTS_PATH, JSON.stringify(merged, null, 2) + '\n');
	console.log(`\n✅ Written to ${RESULTS_PATH}`);
	console.log(`   Divisions updated: ${Object.keys(divisions).join(', ') || '(none)'}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
