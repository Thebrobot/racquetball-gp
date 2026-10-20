import { normalizeSpace, slugify, stripTags } from './html';
import type { DiscoveredDivision, DrawFormat } from './types';

function inferFormat(text: string): DrawFormat {
	const t = text.toLowerCase();
	if (t.includes('olympic')) return 'olympic';
	if (t.includes('playoff')) return 'playoff';
	if (t.includes('pool')) return 'pool';
	if (t.includes('round robin')) return 'roundrobin';
	if (t.includes('single elimination') || t.includes('consolation') || t.includes('elimination')) {
		return 'elimination';
	}
	return 'unknown';
}

function cleanCode(raw: string): string {
	return normalizeSpace(raw).replace(/\s+/g, '');
}

/**
 * Parse R2 listAllDivs.asp HTML. Each row has viewBracket(divID, combinedID),
 * a label in .divNameCell, a draw-type cell, and a short code in the last <b>.
 */
export function parseDivisionList(html: string): DiscoveredDivision[] {
	const rows = html.split(/<tr\b/i);
	const out: DiscoveredDivision[] = [];
	const seen = new Set<string>();

	for (const row of rows) {
		const vb = row.match(/viewBracket\((\d+)\s*,\s*(\d+)\)/i);
		if (!vb) continue;
		const divID = Number(vb[1]);
		const combinedID = Number(vb[2]);
		if ((divID === 0 && combinedID === 0) || Number.isNaN(divID) || Number.isNaN(combinedID)) continue;

		const key = `${divID}:${combinedID}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const nameCell = row.match(/class="divNameCell"[^>]*>([\s\S]*?)<\/td>/i);
		const label = normalizeSpace(stripTags(nameCell?.[1] ?? '')).replace(/\s+/g, ' ');

		const codes = [...row.matchAll(/<b>\s*([A-Z][A-Z0-9+/]{0,16})\s*<\/b>/g)].map((m) => cleanCode(m[1]!));
		const code = codes.at(-1) ?? '';

		const format = inferFormat(stripTags(row));
		const siteId = code ? slugify(code) : slugify(label || key);

		if (!label && !code) continue;

		out.push({
			divID,
			combinedID,
			code: code || siteId,
			label: label || code || siteId,
			format,
			siteId,
		});
	}

	return out;
}

export function drawKey(divID: number, combinedID: number): string {
	return `${divID}:${combinedID}`;
}
