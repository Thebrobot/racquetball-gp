import { EVENTS } from './events';

/** Match entry name (player or "LastA / LastB" team) against a standings/profile name. */
export function playerMatchesEntry(playerName: string, entryName: string): boolean {
	const norm = playerName.trim().toLowerCase();
	const entryNorm = entryName.trim().toLowerCase();
	if (entryNorm === norm) return true;
	const lastName = norm.split(' ').pop() ?? '';
	if (lastName.length > 1) {
		const parts = entryNorm.split(/\s*\/\s*/);
		if (parts.some((p) => p.trim() === lastName || p.trim().endsWith(lastName))) return true;
	}
	return false;
}

function isGhostOpponent(name: string): boolean {
	const u = name.trim().toUpperCase();
	return u === 'BYE' || u === 'TBD' || u === '';
}

function isNoShowOrForfeit(score: string | undefined): boolean {
	if (!score) return false;
	return /\bWBF\b|No[\s-]?Show|Forfeit|Walkover/i.test(score);
}

function matchResult(
	side: 1 | 2,
	winner: 1 | 2 | undefined,
	opponent: string,
	score?: string,
): 'win' | 'loss' | 'pending' | 'bye' | 'walkover' {
	if (winner !== 1 && winner !== 2) return 'pending';
	const oppGhost = isGhostOpponent(opponent);
	if (winner === side) {
		if (oppGhost) return 'bye';
		if (isNoShowOrForfeit(score)) return 'walkover';
		return 'win';
	}
	if (oppGhost) return 'pending';
	return 'loss';
}

/** Counted match wins in one GP division across all published event brackets. */
export function countPlayerWinsInDivision(playerName: string, divisionId: string): number {
	let wins = 0;

	for (const event of EVENTS) {
		for (const div of event.divisionDetails ?? []) {
			if (div.id !== divisionId) continue;

			for (const round of div.rounds ?? []) {
				for (const m of round.matches ?? []) {
					const p1 = (m.player1 ?? '').trim();
					const p2 = (m.player2 ?? '').trim();
					const side = playerMatchesEntry(playerName, p1)
						? 1
						: playerMatchesEntry(playerName, p2)
							? 2
							: null;
					if (side === null) continue;
					const opp = side === 1 ? p2 : p1;
					if (matchResult(side, m.winner, opp, m.score) === 'win') wins++;
				}
			}

			for (const m of div.roundRobinMatches ?? []) {
				const side = playerMatchesEntry(playerName, m.team1)
					? 1
					: playerMatchesEntry(playerName, m.team2)
						? 2
						: null;
				if (side === null) continue;
				const opp = side === 1 ? m.team2 : m.team1;
				if (matchResult(side, m.winner, opp, m.score) === 'win') wins++;
			}
		}
	}

	return wins;
}
