const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	middot: '·',
	ndash: '–',
	mdash: '—',
};

export function decodeEntities(input: string): string {
	return input
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
		.replace(/&([a-z]+);/gi, (_, name: string) => ENTITIES[name.toLowerCase()] ?? `&${name};`);
}

export function stripTags(html: string): string {
	return decodeEntities(
		html
			.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/(?:p|div|tr|h\d|li|td)>/gi, '\n')
			.replace(/<[^>]+>/g, ' ')
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/[ \t]{2,}/g, ' ')
			.trim(),
	);
}

export function normalizeSpace(s: string): string {
	return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

export function firstMatch(html: string, re: RegExp): string | null {
	const m = html.match(re);
	return m?.[1] != null ? decodeEntities(m[1]) : null;
}

export function allMatches(html: string, re: RegExp): string[] {
	return [...html.matchAll(re)].map((m) => decodeEntities(m[1] ?? ''));
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '');
}
