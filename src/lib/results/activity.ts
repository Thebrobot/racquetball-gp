import type { EventSnapshot, LiveActivityFeed, LiveActivityItem, PublishedMatch } from './types';

const MAX_ACTIVITY_EVENTS = 80;

function winnerLoser(match: PublishedMatch): { winnerName: string; loserName: string } | null {
	if (match.winner !== 1 && match.winner !== 2) return null;
	const winnerName = (match.winner === 1 ? match.player1 : match.player2)?.trim();
	const loserName = (match.winner === 1 ? match.player2 : match.player1)?.trim();
	if (!winnerName || !loserName) return null;
	return { winnerName, loserName };
}

export function detectActivityChanges(
	prev: EventSnapshot | null,
	next: EventSnapshot,
	at: string,
): LiveActivityItem[] {
	const items: LiveActivityItem[] = [];
	for (const [divId, div] of Object.entries(next.divisions)) {
		if (div.stale) continue;
		for (const [matchId, match] of Object.entries(div.matches)) {
			const old = prev?.divisions[divId]?.matches[matchId];
			const hadWinner = old?.winner === 1 || old?.winner === 2;
			const hasWinner = match.winner === 1 || match.winner === 2;
			if (!hasWinner) continue;
			const winnerChanged = old?.winner !== match.winner;
			const scoreChanged = (old?.score ?? null) !== (match.score ?? null) && match.score != null;
			if (hadWinner && !winnerChanged && !scoreChanged) continue;
			const names = winnerLoser(match);
			if (!names) continue;
			items.push({
				id: `${at}-${divId}-${matchId}`,
				at,
				type: 'result',
				divisionId: divId,
				divisionLabel: div.label,
				matchId,
				headline: `${names.winnerName} def ${names.loserName}`,
				detail: match.score ?? undefined,
				bracketHref: `/events/${next.slug}/divisions/${divId}`,
			});
		}
	}
	return items;
}

export function mergeActivity(
	prev: LiveActivityFeed | null,
	nextItems: LiveActivityItem[],
	eventSlug: string,
	at: string,
): LiveActivityFeed {
	const merged = [...nextItems, ...(prev?.events ?? [])].slice(0, MAX_ACTIVITY_EVENTS);
	return { lastUpdated: at, eventSlug, events: merged };
}
