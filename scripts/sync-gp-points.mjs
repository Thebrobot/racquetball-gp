/**
 * sync-gp-points.mjs
 *
 * Fetches Grand Prix standings from the master Google Sheet and writes
 * src/data/gp-points.json. Re-run after sheet updates or when a new
 * tournament sheet is added for Lap 2+.
 *
 * Usage:
 *   node scripts/sync-gp-points.mjs
 *   npm run sync:points
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../src/data/gp-points.json');

const SHEET_ID = '1twUWpgQmx5p7qQE5UAd9ynlWfbjWP9RZTjwP9LtqYbc';

/** Correct sheet typos → canonical names used in brackets and player profiles. */
const NAME_CORRECTIONS = {
	'Laura Brunt': 'Laura Brandt',
};

function canonicalPlayerName(name) {
	const trimmed = name.trim();
	return NAME_CORRECTIONS[trimmed] ?? trimmed;
}

/** Sheet tab name → { category, divisionId } */
const TAB_MAP = [
	{ tab: 'Mens Open Singles', category: 'singles', divisionId: 'mens-singles-open' },
	{ tab: 'Mens Elite Singles', category: 'singles', divisionId: 'mens-singles-elite' },
	{ tab: 'Mens A Singles', category: 'singles', divisionId: 'mens-singles-a' },
	{ tab: 'Mens B Singles', category: 'singles', divisionId: 'mens-singles-b' },
	{ tab: 'Mens C Singles', category: 'singles', divisionId: 'mens-singles-c' },
	{ tab: 'Mens 50+ Singles', category: 'singles', divisionId: 'mens-age-50' },
	{ tab: 'Mens 60+ Singles', category: 'singles', divisionId: 'mens-age-60' },
	{ tab: 'Mens 70+ Singles', category: 'singles', divisionId: 'mens-age-70' },
	{ tab: 'Mens Open Doubles', category: 'doubles', divisionId: 'mens-doubles-open' },
	{ tab: 'Mens Elite Doubles', category: 'doubles', divisionId: 'mens-doubles-elite' },
	{ tab: 'Mens A Doubles', category: 'doubles', divisionId: 'mens-doubles-a' },
	{ tab: 'Mens B Doubles', category: 'doubles', divisionId: 'mens-doubles-b' },
	{ tab: 'Mens A Centurion Doubles', category: 'doubles', divisionId: 'mens-doubles-centurion' },
	{ tab: 'Mens Super Centurion Doubles', category: 'doubles', divisionId: 'mens-doubles-super-centurion' },
	{ tab: 'Mixed Doubles Open-A', category: 'mixed', divisionId: 'mixed-doubles' },
];

function csvUrl(tab) {
	return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

/** Minimal CSV parser (handles quoted fields). */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			if (row.some((cell) => cell.trim() !== '')) rows.push(row);
			row = [];
		} else {
			field += c;
		}
	}
	if (field || row.length) {
		row.push(field);
		if (row.some((cell) => cell.trim() !== '')) rows.push(row);
	}
	return rows;
}

function statusForRank(rank) {
	if (rank === 1) return 'q';
	if (rank <= 4) return 'pace';
	return 'chase';
}

function parseTabRows(csvText) {
	const rows = parseCsv(csvText);
	if (rows.length < 2) return [];

	const out = [];
	for (let i = 1; i < rows.length; i++) {
		const [placeRaw, nameRaw, pointsRaw] = rows[i];
		const placeStr = (placeRaw ?? '').trim();
		const name = canonicalPlayerName(nameRaw ?? '');
		const pointsStr = (pointsRaw ?? '').trim();

		if (!placeStr || !name || name === 'Division Total') continue;

		const place = Number.parseInt(placeStr, 10);
		const s1 = Number.parseFloat(pointsStr);
		if (!Number.isFinite(place) || !Number.isFinite(s1)) continue;

		out.push({
			place,
			name,
			s1,
			s2: 0,
			wins: 0,
			attendance: s1 > 0 ? 1 : 0,
			status: statusForRank(out.length + 1),
			city: '',
		});
	}

	// Re-assign status by sorted rank (place order in sheet)
	out.forEach((row, i) => {
		row.status = statusForRank(i + 1);
	});

	return out;
}

async function fetchTab(tab) {
	const res = await fetch(csvUrl(tab));
	if (!res.ok) throw new Error(`Failed to fetch "${tab}": ${res.status} ${res.statusText}`);
	return res.text();
}

async function main() {
	const standings = { singles: {}, doubles: {}, mixed: {} };

	for (const { tab, category, divisionId } of TAB_MAP) {
		process.stdout.write(`  ${tab}… `);
		const csv = await fetchTab(tab);
		const rows = parseTabRows(csv);
		if (!standings[category]) standings[category] = {};
		standings[category][divisionId] = rows;
		console.log(`${rows.length} rows`);
	}

	const payload = {
		lastUpdated: new Date().toISOString(),
		sourceSheetId: SHEET_ID,
		events: [{ id: 'event-1', label: 'Event #1 (Ocala)', stopKey: 's1' }],
		standings,
	};

	writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	console.log(`\nWrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
