import type { EventBracketMatch, EventData } from '../../data/events';

export interface MatchResultPatch {
	score?: string | null;
	winner?: 1 | 2 | null;
	player1?: string | null;
	player2?: string | null;
}

export type DivisionResultMap = Record<string, MatchResultPatch>;

function fillFromResult(slot: string, name: string | null | undefined): string | null {
	if (slot !== 'TBD') return null;
	const n = (name ?? '').trim();
	if (!n || n.toUpperCase() === 'BYE') return null;
	return n;
}

function findByNames(matchMap: DivisionResultMap, a: string, b: string): MatchResultPatch | undefined {
	const ax = a.toLowerCase();
	const bx = b.toLowerCase();
	return Object.values(matchMap).find((r) => {
		const rp1 = (r.player1 ?? '').toLowerCase();
		const rp2 = (r.player2 ?? '').toLowerCase();
		return (rp1 === ax && rp2 === bx) || (rp1 === bx && rp2 === ax);
	});
}

/** Overlay validated live results onto a static event skeleton. */
export function applyResultsToEvent(event: EventData, divResults: Record<string, DivisionResultMap>): EventData {
	return {
		...event,
		divisionDetails: event.divisionDetails.map((div) => {
			const matchMap = divResults[div.id];
			if (!matchMap) return div;

			if (div.rounds) {
				const updatedRounds = div.rounds.map((round) => ({
					...round,
					matches: round.matches.map((match) => {
						let res: MatchResultPatch | undefined;
						if (match.matchId) res = matchMap[match.matchId];
						if (!res) res = findByNames(matchMap, match.player1, match.player2);
						if (!res) return match;
						const p1Fill = fillFromResult(match.player1, res.player1);
						const p2Fill = fillFromResult(match.player2, res.player2);
						return {
							...match,
							...(res.score != null ? { score: res.score } : {}),
							...(res.winner != null ? { winner: res.winner } : {}),
							...(p1Fill ? { player1: p1Fill } : {}),
							...(p2Fill ? { player2: p2Fill } : {}),
						};
					}),
				}));

				const isGhostSlot = (s: string) => {
					const u = s.trim().toUpperCase();
					return u === 'TBD' || u === '' || u === 'BYE';
				};
				const isAbbreviatedName = (s: string): boolean => {
					const parts = s.trim().split(/\s+/);
					return parts.length >= 2 && parts[0]!.length === 1;
				};
				const feederWinnerName = (feeder: EventBracketMatch | undefined): string | null => {
					if (!feeder?.winner) return null;
					const name = feeder.winner === 1 ? feeder.player1 : feeder.player2;
					return !isGhostSlot(name) ? name : null;
				};
				for (let ri = 1; ri < updatedRounds.length; ri++) {
					updatedRounds[ri] = {
						...updatedRounds[ri]!,
						matches: updatedRounds[ri]!.matches.map((match, gi) => {
							let { player1, player2 } = match;
							if (isGhostSlot(player1) || isAbbreviatedName(player1)) {
								const name = feederWinnerName(updatedRounds[ri - 1]?.matches[gi * 2]);
								if (name) player1 = name;
							}
							if (isGhostSlot(player2) || isAbbreviatedName(player2)) {
								const name = feederWinnerName(updatedRounds[ri - 1]?.matches[gi * 2 + 1]);
								if (name) player2 = name;
							}
							return player1 !== match.player1 || player2 !== match.player2
								? { ...match, player1, player2 }
								: match;
						}),
					};
				}

				return { ...div, rounds: updatedRounds };
			}

			if (div.roundRobinMatches) {
				const updatedRR = div.roundRobinMatches.map((m) => {
					const res = m.matchId ? matchMap[m.matchId] : findByNames(matchMap, m.team1, m.team2);
					if (!res) return m;
					return {
						...m,
						...(res.score != null ? { score: res.score } : {}),
						...(res.winner != null ? { winner: res.winner } : {}),
					};
				});
				return { ...div, roundRobinMatches: updatedRR };
			}

			return div;
		}),
	};
}
