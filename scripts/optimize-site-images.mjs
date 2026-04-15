/**
 * One-shot WebP generation for public/ images. Run: node scripts/optimize-site-images.mjs
 * Tune maxWidth/quality if assets change.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

/** @type {{ rel: string; maxWidth: number; quality?: number }[]} */
const jobs = [
	{ rel: 'images/series-logo.png', maxWidth: 1080, quality: 86 },
	{ rel: 'images/website-logo.png', maxWidth: 1000, quality: 88 },
	{ rel: 'images/rapha/logo.png', maxWidth: 640, quality: 86 },
	{ rel: 'images/rapha/team.png', maxWidth: 1200, quality: 85 },
	...[
		'stop-championship-ocala.png',
		'stop-miami.png',
		'stop-ocala.png',
		'stop-sarasota.png',
		'stop-tallahassee.png',
	].map((name) => ({
		rel: `images/stops/${name}`,
		maxWidth: 1600,
		quality: 84,
	})),
	...[
		'leader-mixed-placeholder.png',
		'leader-open-men-placeholder.png',
		'leader-open-women-placeholder.png',
	].map((name) => ({
		rel: `images/spotlight/${name}`,
		maxWidth: 720,
		quality: 85,
	})),
];

async function main() {
	for (const { rel, maxWidth, quality = 85 } of jobs) {
		const input = path.join(publicDir, rel);
		const outRel = rel.replace(/\.png$/i, '.webp');
		const output = path.join(publicDir, outRel);
		await fs.mkdir(path.dirname(output), { recursive: true });
		await sharp(input)
			.resize({ width: maxWidth, withoutEnlargement: true })
			.webp({ quality, effort: 6 })
			.toFile(output);
		const inStat = await fs.stat(input);
		const outStat = await fs.stat(output);
		console.log(`${outRel}  (${Math.round(inStat.size / 1024)}KB → ${Math.round(outStat.size / 1024)}KB)`);
	}
	console.log('Done.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
