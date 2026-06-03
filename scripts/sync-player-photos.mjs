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
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/images/players');
const MANIFEST_PATH = resolve(__dirname, '../src/data/player-photos.json');

/** @type {Record<string, string>} */
const PLAYER_IMAGES_R2 = {
	'Michael Ammen': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/21349_large.jpg',
	'Brendan Anthony': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/506818_bcf9_sm.png',
	'Kyle Artman': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/497001_85e20c36f3_sm.jpg',
	'Chad Beacher': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/281288_648f065f38_sm.jpg',
	'Laura Brandt': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/9155_ca66e7f493_sm.jpg',
	'Daniel Bray': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/79649_760f42c6b2_sm.jpg',
	'Matthew Brice': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/615893_ecbfc78fb8_sm.jpg',
	'Mike Caldwell': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/641792_ba6f31de1f_sm.png',
	'Charles Cole': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/12924_f9d302f00a_sm.jpg',
	'Jordan Deeney': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/161654_96ffb09ab6_sm.jpg',
	'Jonathan Estepan': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/635542_6575a01d5d_sm.png',
	'Alexis Fajardo': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/611588_c1b1da20ea_sm.jpg',
	'Philip Gaerlan': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/17965_large.jpg',
	'Trace Gunsch': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/619991_3b38d92c21_sm.jpg',
	'Scott Haacke': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/621714_446eceb8b6_sm.jpg',
	'Felix Hernandez': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/42578_997c31ed4b_lg.jpg',
	'Alejandro Herrera': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/29542_25d823c745_sm.jpg',
	'John Johnston': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/20910_large.jpg',
	'Gordon Kelly': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/31436_b78f_sm.png',
	'Matt Kern': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/589800_5981f55b41_sm.jpg',
	'Steven Lewis': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/92627_large.jpg',
	'Frank Lopez': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/0_116076db16_sm.png',
	'Mark Manzano': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/271047_e9c92ce348_sm.jpg',
	'Edgar Martinez': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/594572_dc533458b0_sm.jpg',
	'Jorge Moreno': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/99798_a9c0f8345c_sm.jpg',
	'Mauricio Muriel': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/54218_315c01963e_sm.jpg',
	'Charles Nolan': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/507854_75bc6ebdba_sm.jpg',
	'Kleber Oliveira': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/278088_1f2326f396_sm.jpg',
	"Russell O'Neal": 'https://www.r2sports.com/tourney/imageGallery/gallery/player/620873_627eb9ed8f_sm.png',
	'Dylan Pruitt': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/155203_a1b79150ed_sm.jpg',
	'Andres Ramirez': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/20741_large.jpg',
	'Yelandi Rivero': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/93412_large.jpg',
	'Jim Russell': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/34862_large.jpg',
	'Timothy Schnellenberger': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/243897_e7fc_sm.png',
	'Paul Sotolongo': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/632924_bcb6980e01_sm.jpg',
	'Chris Steinheiser': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/131153_56c067f08c_sm.jpg',
	'Wade Stubanas': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/160212_bac9bfb2af_sm.jpg',
};

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
