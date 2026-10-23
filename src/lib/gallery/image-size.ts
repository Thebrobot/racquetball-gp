export type ImageSize = { width: number; height: number };

/** Finite pixel dimension in a range a photo can actually be. */
export function asPositiveInt(value: unknown): number | undefined {
	const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
	if (!Number.isFinite(n) || n <= 0 || n > 30000) return undefined;
	return Math.round(n);
}

function ascii(buf: Uint8Array, start: number, length: number): string {
	let out = '';
	for (let i = 0; i < length; i++) out += String.fromCharCode(buf[start + i] ?? 0);
	return out;
}

function readU24(buf: Uint8Array, offset: number): number {
	return (buf[offset] ?? 0) | ((buf[offset + 1] ?? 0) << 8) | ((buf[offset + 2] ?? 0) << 16);
}

function pngSize(buf: Uint8Array): ImageSize | undefined {
	if (ascii(buf, 0, 8) !== '\x89PNG\r\n\x1a\n') return undefined;
	if (buf.length < 24) return undefined;
	const width = ((buf[16] ?? 0) << 24) | ((buf[17] ?? 0) << 16) | ((buf[18] ?? 0) << 8) | (buf[19] ?? 0);
	const height = ((buf[20] ?? 0) << 24) | ((buf[21] ?? 0) << 16) | ((buf[22] ?? 0) << 8) | (buf[23] ?? 0);
	const w = asPositiveInt(width);
	const h = asPositiveInt(height);
	if (!w || !h) return undefined;
	return { width: w, height: h };
}

function gifSize(buf: Uint8Array): ImageSize | undefined {
	const sig = ascii(buf, 0, 6);
	if (sig !== 'GIF87a' && sig !== 'GIF89a') return undefined;
	if (buf.length < 10) return undefined;
	const width = (buf[6] ?? 0) | ((buf[7] ?? 0) << 8);
	const height = (buf[8] ?? 0) | ((buf[9] ?? 0) << 8);
	const w = asPositiveInt(width);
	const h = asPositiveInt(height);
	if (!w || !h) return undefined;
	return { width: w, height: h };
}

function jpegSize(buf: Uint8Array): ImageSize | undefined {
	if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
	let i = 2;
	while (i + 8 < buf.length) {
		if (buf[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = buf[i + 1] ?? 0;
		// Padding / restart markers have no length.
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
			i += 2;
			continue;
		}
		const isSof =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isSof) {
			const height = ((buf[i + 5] ?? 0) << 8) | (buf[i + 6] ?? 0);
			const width = ((buf[i + 7] ?? 0) << 8) | (buf[i + 8] ?? 0);
			const w = asPositiveInt(width);
			const h = asPositiveInt(height);
			if (!w || !h) return undefined;
			return { width: w, height: h };
		}
		const segLen = ((buf[i + 2] ?? 0) << 8) | (buf[i + 3] ?? 0);
		if (segLen < 2) return undefined;
		i += 2 + segLen;
	}
	return undefined;
}

function webpSize(buf: Uint8Array): ImageSize | undefined {
	if (ascii(buf, 0, 4) !== 'RIFF' || ascii(buf, 8, 4) !== 'WEBP') return undefined;
	const chunk = ascii(buf, 12, 4);
	if (chunk === 'VP8X' && buf.length >= 30) {
		const w = asPositiveInt(1 + readU24(buf, 24));
		const h = asPositiveInt(1 + readU24(buf, 27));
		if (!w || !h) return undefined;
		return { width: w, height: h };
	}
	if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
		const b0 = buf[21] ?? 0;
		const b1 = buf[22] ?? 0;
		const b2 = buf[23] ?? 0;
		const b3 = buf[24] ?? 0;
		const w = asPositiveInt(1 + (((b1 & 0x3f) << 8) | b0));
		const h = asPositiveInt(1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
		if (!w || !h) return undefined;
		return { width: w, height: h };
	}
	if (chunk === 'VP8 ' && buf.length > 30) {
		for (let i = 20; i < buf.length - 7; i++) {
			if (buf[i] === 0x9d && buf[i + 1] === 0x01 && buf[i + 2] === 0x2a) {
				const w = asPositiveInt(((buf[i + 3] ?? 0) | ((buf[i + 4] ?? 0) << 8)) & 0x3fff);
				const h = asPositiveInt(((buf[i + 5] ?? 0) | ((buf[i + 6] ?? 0) << 8)) & 0x3fff);
				if (!w || !h) return undefined;
				return { width: w, height: h };
			}
		}
	}
	return undefined;
}

/** Read width and height from a JPEG, PNG, GIF, or WebP header. HEIC returns undefined. */
export function readImageSize(buf: Uint8Array): ImageSize | undefined {
	return jpegSize(buf) || pngSize(buf) || gifSize(buf) || webpSize(buf);
}
