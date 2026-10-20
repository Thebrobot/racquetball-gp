import type { EventData } from '../../data/events';
import { slugify } from './html';
import type { DiscoveredDivision } from './types';

function collectMatchIds(event: EventData, divisionId: string): string[] {
	const div = event.divisionDetails.find((d) => d.id === divisionId);
	if (!div) return [];
	const ids = [
		...(div.rounds ?? []).flatMap((r) => r.matches.map((m) => m.matchId).filter(Boolean)),
		...(div.roundRobinMatches ?? []).map((m) => m.matchId).filter(Boolean),
	];
	return ids as string[];
}

/** Longest shared alphabetic prefix of match codes (MO, M50+, M3040, MDS). */
export function inferCodeFromMatchIds(matchIds: string[]): string | null {
	const ids = matchIds.filter(Boolean);
	if (!ids.length) return null;
	const prefixes = ids.map((id) => id.replace(/\d+$/, ''));
	let prefix = prefixes[0]!;
	for (const p of prefixes) {
		while (prefix && !p.startsWith(prefix)) prefix = prefix.slice(0, -1);
	}
	return prefix || null;
}

export function buildCodeToSiteId(event: EventData | undefined): Map<string, string> {
	const map = new Map<string, string>();
	if (!event) return map;
	for (const div of event.divisionDetails) {
		const code = inferCodeFromMatchIds(collectMatchIds(event, div.id));
		if (code) map.set(code.toUpperCase(), div.id);
		map.set(div.id, div.id);
		map.set(slugify(div.label), div.id);
		map.set(div.label.toLowerCase(), div.id);
	}
	return map;
}

export function resolveSiteDivisionId(
	discovered: Pick<DiscoveredDivision, 'code' | 'label' | 'siteId'>,
	codeMap: Map<string, string>,
): string {
	const code = discovered.code.replace(/\s+/g, '').toUpperCase();
	return (
		codeMap.get(code) ??
		codeMap.get(slugify(discovered.label)) ??
		codeMap.get(discovered.label.toLowerCase()) ??
		discovered.siteId
	);
}
