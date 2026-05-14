/**
 * Rasterize public/favicon.svg to 16×32 PNGs and write a compact PNG-in-ICO
 * public/favicon.ico (for clients that do not prefer SVG).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const icoPath = path.join(root, 'public', 'favicon.ico');

/** @param {Buffer[]} pngs */
function pngsToIco(pngs) {
	const count = pngs.length;
	const header = Buffer.alloc(6 + count * 16);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(count, 4);

	let offset = 6 + count * 16;
	for (let i = 0; i < count; i++) {
		const png = pngs[i];
		const w = png.readUInt32BE(16);
		const h = png.readUInt32BE(20);
		const entry = 6 + i * 16;
		header.writeUInt8(w >= 256 ? 0 : w, entry);
		header.writeUInt8(h >= 256 ? 0 : h, entry + 1);
		header.writeUInt8(0, entry + 2);
		header.writeUInt8(0, entry + 3);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(png.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.length;
	}

	return Buffer.concat([header, ...pngs]);
}

const svg = fs.readFileSync(svgPath);
const png16 = await sharp(svg).resize(16, 16).png().toBuffer();
const png32 = await sharp(svg).resize(32, 32).png().toBuffer();
fs.writeFileSync(icoPath, pngsToIco([png16, png32]));
console.log('Wrote', icoPath, `(${fs.statSync(icoPath).size} bytes)`);
