import { getAllPlayers, type PlayerProfile } from '../../data/players';

export type ClaimPlayerOption = {
	name: string;
	slug: string;
	city: string;
	divisions: string[];
	claimed: boolean;
};

/** Case-insensitive partial match on the full name or any first/last part. */
export function playerNameMatches(name: string, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const n = name.toLowerCase();
	if (n.includes(q)) return true;
	const parts = n.split(/[\s-]+/).filter(Boolean);
	const tokens = q.split(/\s+/).filter(Boolean);
	return tokens.every((token) => parts.some((part) => part.startsWith(token) || part.includes(token)));
}

export function toClaimPlayerOption(player: PlayerProfile, claimed: Set<string>): ClaimPlayerOption {
	return {
		name: player.name,
		slug: player.slug,
		city: player.city ?? '',
		divisions: (player.divisions ?? []).slice(0, 2),
		claimed: claimed.has(player.slug),
	};
}

export function claimPlayerOptions(claimed: Iterable<string> = []): ClaimPlayerOption[] {
	const taken = claimed instanceof Set ? claimed : new Set(claimed);
	return getAllPlayers().map((p) => toClaimPlayerOption(p, taken));
}

export function matchClaimPlayers(players: readonly ClaimPlayerOption[], query: string, limit = 6): ClaimPlayerOption[] {
	const q = query.trim();
	if (!q) return [];
	return players.filter((p) => playerNameMatches(p.name, q)).slice(0, limit);
}

export function exactClaimPlayer(players: readonly ClaimPlayerOption[], query: string): ClaimPlayerOption | undefined {
	const q = query.trim().toLowerCase();
	if (!q) return undefined;
	return players.find((p) => p.name.toLowerCase() === q || p.slug === q);
}

export function playerIdentifyLine(player: Pick<ClaimPlayerOption, 'city' | 'divisions'>): string {
	return [player.city, ...player.divisions].filter(Boolean).join(' · ');
}
