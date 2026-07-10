/**
 * sync-player-photos.mjs
 *
 * Downloads the best available R2 headshot for each player, generates
 * sharpened WebP at display-appropriate sizes (64 / 128 / 256 px wide),
 * and writes src/data/player-photos.json for the site to serve locally.
 *
 * Usage:
 *   node scripts/sync-player-photos.mjs
 *   npm run sync:photos
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/images/players');
const MANIFEST_PATH = resolve(__dirname, '../src/data/player-photos.json');
const IMAGES_TS_PATH = resolve(__dirname, '../src/data/player-images.ts');

/** Parses the PLAYER_IMAGES_R2 map out of player-images.ts (single source of truth). */
function loadPlayerImagesR2() {
	const src = readFileSync(IMAGES_TS_PATH, 'utf8');
	const block = src.match(/PLAYER_IMAGES_R2[^=]*=\s*\{([\s\S]*?)\n\};/);
	if (!block) throw new Error(`Could not find PLAYER_IMAGES_R2 in ${IMAGES_TS_PATH}`);
	/** @type {Record<string, string>} */
	const out = {};
	for (const m of block[1].matchAll(/(['"])((?:\\.|(?!\1).)+)\1\s*:\s*'([^']+)'/g)) {
		out[m[2].replace(/\\'/g, "'")] = m[3];
	}
	return out;
}

const PLAYER_IMAGES_R2 = loadPlayerImagesR2();

const OUTPUT_WIDTHS = [64, 128, 256];

function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '');
}

function candidateUrls(r2Url) {
	const out = new Set();
	out.add(r2Url);
	const hasHashVariant = /player\/\d+_[a-f0-9]+_/.test(r2Url);
	if (r2Url.includes('_sm.')) {
		out.add(r2Url.replace('_sm.', '_large.'));
		out.add(r2Url.replace('_sm.', '_lg.'));
	}
	const idMatch = r2Url.match(/player\/(\d+)/);
	// Generic {id}_large.jpg is a different asset when R2 uses a hashed filename.
	if (idMatch && !hasHashVariant) {
		const ext = r2Url.includes('.png') ? 'png' : 'jpg';
		out.add(`https://www.r2sports.com/tourney/imageGallery/gallery/player/${idMatch[1]}_large.${ext}`);
	}
	return [...out];
}

async function fetchBestSource(r2Url) {
	let best = null;
	for (const url of candidateUrls(r2Url)) {
		try {
			const res = await fetch(url);
			if (!res.ok) continue;
			const buf = Buffer.from(await res.arrayBuffer());
			const meta = await sharp(buf).metadata();
			const w = meta.width ?? 0;
			const h = meta.height ?? 0;
			const pixels = w * h;
			if (!best || pixels > best.pixels) {
				best = { url, buf, width: w, height: h, pixels };
			}
		} catch {
			/* try next candidate */
		}
	}
	return best;
}

async function writeVariants(slug, buf, sourceWidth) {
	const sizes = {};
	for (const width of OUTPUT_WIDTHS) {
		if (width > sourceWidth) continue;
		const rel = `/images/players/${slug}-${width}.webp`;
		const outPath = resolve(__dirname, '..', 'public', rel.replace(/^\//, ''));
		await sharp(buf)
			.resize({ width, withoutEnlargement: true })
			.sharpen()
			.webp({ quality: 92, effort: 6 })
			.toFile(outPath);
		sizes[String(width)] = rel;
	}

	// Full-resolution copy (never upscaled)
	const fullRel = `/images/players/${slug}.webp`;
	await sharp(buf)
		.sharpen()
		.webp({ quality: 92, effort: 6 })
		.toFile(resolve(__dirname, '..', 'public', fullRel.replace(/^\//, '')));
	sizes.full = fullRel;

	return sizes;
}

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	const players = {};

	for (const [name, r2Url] of Object.entries(PLAYER_IMAGES_R2)) {
		process.stdout.write(`  ${name}… `);
		const source = await fetchBestSource(r2Url);
		if (!source) {
			console.log('skip (no source)');
			continue;
		}

		const slug = slugify(name);
		const sizes = await writeVariants(slug, source.buf, source.width);
		const defaultSrc = sizes['128'] ?? sizes['64'] ?? sizes.full;
		players[name] = {
			slug,
			sourceUrl: source.url,
			sourceWidth: source.width,
			sourceHeight: source.height,
			sizes,
			default: defaultSrc,
		};
		console.log(`${source.width}×${source.height} → ${Object.keys(sizes).join(', ')}`);
	}

	const manifest = {
		lastUpdated: new Date().toISOString(),
		players,
	};
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
	console.log(`\nWrote ${MANIFEST_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
