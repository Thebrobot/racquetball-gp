/**
 * sync-gp-points.mjs
 *
 * Fetches Grand Prix Lap 1 (Ocala) standings from the master Google Sheet and
 * writes src/data/gp-points.json. Preserves Lap 2+ (s2) values already on disk
 * (computed by scripts/compute-sarasota-gp-points.ts — not from the sheet).
 *
 * Usage:
 *   node scripts/sync-gp-points.mjs
 *   npm run sync:points
 *
 * After syncing the sheet, re-run compute:sarasota-points if s2 needs refresh.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
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

function normalizeName(name) {
	return name
		.toLowerCase()
		.replace(/\./g, ' ')
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function namesMatch(a, b) {
	const na = normalizeName(a);
	const nb = normalizeName(b);
	if (na === nb) return true;
	const pa = na.split(' ').filter(Boolean);
	const pb = nb.split(' ').filter(Boolean);
	if (pa.length >= 2 && pb.length >= 2) {
		const aFirst = pa[0];
		const bFirst = pb[0];
		const aLast = pa[pa.length - 1];
		const bLast = pb[pb.length - 1];
		if (aLast === bLast && (aFirst === bFirst || aFirst[0] === bFirst[0])) return true;
	}
	return false;
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

function loadExistingS2() {
	/** @type {Map<string, Map<string, { s2: number, name: string }>>} */
	const byDivision = new Map();
	if (!existsSync(OUTPUT_PATH)) return byDivision;

	try {
		const prev = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
		for (const cat of Object.values(prev.standings ?? {})) {
			for (const [divisionId, rows] of Object.entries(cat ?? {})) {
				const map = new Map();
				for (const row of rows ?? []) {
					if (!row?.name) continue;
					const s2 = Number(row.s2) || 0;
					if (s2 === 0 && !byDivision.has(divisionId)) {
						// Still track zero rows only if division has any s2 later — store all for name merge
					}
					map.set(normalizeName(row.name), { s2, name: row.name });
				}
				// Keep division even when all zeros so Sarasota-only divisions (e.g. 30/40+) survive
				byDivision.set(divisionId, map);
			}
		}
	} catch {
		// Ignore corrupt prior file; sheet sync still proceeds with s2=0
	}
	return byDivision;
}

function lookupS2(existing, divisionId, name) {
	const map = existing.get(divisionId);
	if (!map) return { s2: 0, preferredName: null };
	const exact = map.get(normalizeName(name));
	if (exact) return { s2: exact.s2, preferredName: exact.s2 > 0 ? exact.name : null };
	for (const [, entry] of map) {
		if (namesMatch(entry.name, name)) {
			return { s2: entry.s2, preferredName: entry.s2 > 0 ? entry.name : null };
		}
	}
	return { s2: 0, preferredName: null };
}

function parseTabRows(csvText, divisionId, existingS2) {
	const rows = parseCsv(csvText);
	if (rows.length < 2) return [];

	const out = [];
	const matchedKeys = new Set();

	for (let i = 1; i < rows.length; i++) {
		const [placeRaw, nameRaw, pointsRaw] = rows[i];
		const placeStr = (placeRaw ?? '').trim();
		const name = canonicalPlayerName(nameRaw ?? '');
		const pointsStr = (pointsRaw ?? '').trim();

		if (!placeStr || !name || name === 'Division Total') continue;

		const place = Number.parseInt(placeStr, 10);
		const s1 = Number.parseFloat(pointsStr);
		if (!Number.isFinite(place) || !Number.isFinite(s1)) continue;

		const { s2, preferredName } = lookupS2(existingS2, divisionId, name);
		const map = existingS2.get(divisionId);
		if (map) matchedKeys.add(normalizeName(preferredName ?? name));
		for (const [key, entry] of map ?? []) {
			if (namesMatch(entry.name, name)) matchedKeys.add(key);
		}

		out.push({
			place,
			name: preferredName && preferredName.length >= name.length ? preferredName : name,
			s1,
			s2,
			wins: 0,
			attendance: (s1 > 0 ? 1 : 0) + (s2 > 0 ? 1 : 0),
			status: 'chase',
			city: '',
		});
	}

	// Keep Sarasota-only players (s1=0) that were not on the Ocala sheet tab
	const map = existingS2.get(divisionId);
	if (map) {
		for (const [key, entry] of map) {
			if (matchedKeys.has(key)) continue;
			if (!(entry.s2 > 0)) continue;
			out.push({
				place: 0,
				name: entry.name,
				s1: 0,
				s2: entry.s2,
				wins: 0,
				attendance: 1,
				status: 'chase',
				city: '',
			});
		}
	}

	out.sort((a, b) => {
		const ta = a.s1 + a.s2;
		const tb = b.s1 + b.s2;
		if (tb !== ta) return tb - ta;
		return a.name.localeCompare(b.name);
	});
	out.forEach((row, i) => {
		row.place = i + 1;
		row.attendance = (row.s1 > 0 ? 1 : 0) + (row.s2 > 0 ? 1 : 0);
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
	const existingS2 = loadExistingS2();
	const standings = { singles: {}, doubles: {}, mixed: {} };
	const sheetDivisionIds = new Set();

	for (const { tab, category, divisionId } of TAB_MAP) {
		process.stdout.write(`  ${tab}… `);
		const csv = await fetchTab(tab);
		const rows = parseTabRows(csv, divisionId, existingS2);
		if (!standings[category]) standings[category] = {};
		standings[category][divisionId] = rows;
		sheetDivisionIds.add(divisionId);
		console.log(`${rows.length} rows`);
	}

	// Preserve computed-only divisions (e.g. mens-age-3040) not on the Ocala sheet
	for (const [divisionId, map] of existingS2) {
		if (sheetDivisionIds.has(divisionId)) continue;
		const rows = [...map.values()]
			.filter((e) => e.s2 > 0)
			.map((e) => ({
				place: 0,
				name: e.name,
				s1: 0,
				s2: e.s2,
				wins: 0,
				attendance: 1,
				status: 'chase',
				city: '',
			}));
		if (!rows.length) continue;
		rows.sort((a, b) => b.s2 - a.s2 || a.name.localeCompare(b.name));
		rows.forEach((row, i) => {
			row.place = i + 1;
			row.status = statusForRank(i + 1);
		});
		const category = divisionId.startsWith('mens-doubles')
			? 'doubles'
			: divisionId.startsWith('mixed')
				? 'mixed'
				: 'singles';
		if (!standings[category]) standings[category] = {};
		standings[category][divisionId] = rows;
		console.log(`  (preserved) ${divisionId}: ${rows.length} rows`);
	}

	const payload = {
		lastUpdated: new Date().toISOString(),
		sourceSheetId: SHEET_ID,
		events: [
			{ id: 'event-1', label: 'Event #1 (Ocala)', stopKey: 's1' },
			{ id: 'event-2', label: 'Event #2 (Sarasota)', stopKey: 's2' },
		],
		standings,
	};

	writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	console.log(`\nWrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
