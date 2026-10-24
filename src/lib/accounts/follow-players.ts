import { canonicalPlayerName, getPlayerSlug } from '../../data/players';
import type { EventData } from '../../data/events';

export type FollowPlayer = { name: string; slug: string };

const GHOST = /^(tbd|bye)$/i;

/** Unique individual players in an event draw, for the Live Results follow box. */
export function eventFollowPlayers(event: EventData | null | undefined): FollowPlayer[] {
	if (!event) return [];
	const seen = new Set<string>();
	const out: FollowPlayer[] = [];
	for (const profile of event.profiles ?? []) {
		const raw = profile.name?.trim() ?? '';
		if (!raw || raw.includes('/') || GHOST.test(raw)) continue;
		const slug = getPlayerSlug(raw);
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		out.push({ name: canonicalPlayerName(raw), slug });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Case-insensitive partial match on the full name or any first/last part. */
export function followPlayerMatches(name: string, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const n = name.toLowerCase();
	if (n.includes(q)) return true;
	const parts = n.split(/[\s-]+/).filter(Boolean);
	const tokens = q.split(/\s+/).filter(Boolean);
	return tokens.every((token) => parts.some((part) => part.startsWith(token) || part.includes(token)));
}

export function matchFollowPlayers(players: readonly FollowPlayer[], query: string, limit = 12): FollowPlayer[] {
	const matched = players.filter((p) => followPlayerMatches(p.name, query));
	return matched.slice(0, limit);
}

export function exactFollowPlayer(players: readonly FollowPlayer[], query: string): FollowPlayer | undefined {
	const q = query.trim().toLowerCase();
	if (!q) return undefined;
	return players.find((p) => p.name.toLowerCase() === q || p.slug === q);
}
