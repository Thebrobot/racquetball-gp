import type {
	DivisionSnapshot,
	DivisionValidation,
	ParsedMatch,
	PublishedMatch,
	ScoreRuleSet,
	ValidationIssue,
} from './types';

export interface ScoreGame {
	left: number;
	right: number;
}

const FORFEIT_RE = /wbf|forfeit|default|no[\s-]?show|bye/i;

export function parseGames(score: string | null | undefined): ScoreGame[] | null {
	if (!score) return null;
	const trimmed = score.trim();
	if (!trimmed || FORFEIT_RE.test(trimmed)) return [];
	const games = [...trimmed.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})/g)].map((m) => ({
		left: Number(m[1]),
		right: Number(m[2]),
	}));
	if (!games.length) return null;
	// Reject concatenated junk like "609-1" (3+ digit run not captured) or leftover digits.
	if (/\d{3,}/.test(trimmed)) return null;
	return games;
}

function gameWinnerReached(win: number, lose: number, target: number): boolean {
	return win === target && lose >= 0 && lose < target;
}

function looksLikeWinByTwo(win: number, lose: number, target: number): boolean {
	return win === lose + 2 && lose >= target - 1 && win <= target + 6;
}

export function validateScore(
	score: string | null | undefined,
	rules: ScoreRuleSet,
	status: ParsedMatch['status'],
): ValidationIssue[] {
	if (status === 'bye' || status === 'forfeit' || status === 'unplayed' || status === 'in_progress') {
		if (!score || FORFEIT_RE.test(score)) return [];
	}
	if (!score) {
		if (status === 'played') {
			return [{ level: 'error', code: 'missing-score', message: 'Played match is missing a score' }];
		}
		return [];
	}
	if (FORFEIT_RE.test(score)) return [];

	const games = parseGames(score);
	if (!games) {
		return [{ level: 'error', code: 'score-format', message: `Unparseable or junk score "${score}"` }];
	}
	if (games.length < 1 || games.length > 3) {
		return [{ level: 'error', code: 'score-games', message: `Expected 1–3 games, got ${games.length} in "${score}"` }];
	}

	const issues: ValidationIssue[] = [];
	let leftWins = 0;
	let rightWins = 0;

	games.forEach((g, i) => {
		if (g.left === g.right) {
			issues.push({ level: 'error', code: 'score-tie', message: `Game ${i + 1} is tied (${g.left}-${g.right})` });
			return;
		}
		const win = Math.max(g.left, g.right);
		const lose = Math.min(g.left, g.right);
		const isTb = games.length === 3 && i === 2;
		if (rules === 'usar-adult') {
			const target = isTb ? 11 : 15;
			if (!gameWinnerReached(win, lose, target) && !looksLikeWinByTwo(win, lose, target)) {
				issues.push({
					level: 'error',
					code: 'score-rules',
					message: `Game ${i + 1} ${g.left}-${g.right} is not a valid ${isTb ? 'tiebreak to 11' : 'game to 15'}`,
				});
			}
		} else {
			const ok =
				gameWinnerReached(win, lose, 15) ||
				gameWinnerReached(win, lose, 11) ||
				gameWinnerReached(win, lose, 21) ||
				looksLikeWinByTwo(win, lose, 15) ||
				looksLikeWinByTwo(win, lose, 11) ||
				looksLikeWinByTwo(win, lose, 21);
			if (!ok || win > 30) {
				issues.push({
					level: 'error',
					code: 'score-rules',
					message: `Game ${i + 1} ${g.left}-${g.right} is not a valid racquetball game`,
				});
			}
		}
		if (g.left > g.right) leftWins++;
		else rightWins++;
	});

	if (games.length === 2 && leftWins === 1 && rightWins === 1) {
		// R2 sometimes omits the tiebreak. Winner badge is still authoritative.
		issues.push({ level: 'warn', code: 'score-split', message: `Two-game match is split (tiebreak missing on R2): ${score}` });
	}
	if (games.length === 3 && (leftWins < 2 && rightWins < 2)) {
		issues.push({ level: 'error', code: 'score-incomplete', message: `Three-game score does not produce a match winner: ${score}` });
	}
	if (games.length === 3 && leftWins !== 1 && rightWins !== 1 && leftWins + rightWins === 3) {
		// 3-0 in a listed third game is odd but possible if recorded fully; warn only.
		if (leftWins === 3 || rightWins === 3) {
			issues.push({ level: 'warn', code: 'score-sweep-three', message: `Third game listed on a 3-0 sweep: ${score}` });
		}
	}

	return issues;
}

export function isGhostName(name: string | null | undefined): boolean {
	const u = (name ?? '').trim().toUpperCase();
	return !u || u === 'BYE' || u === 'TBD' || u === 'PARTICIPANT';
}

export function winnerIsPlayer(match: Pick<ParsedMatch, 'player1' | 'player2' | 'winner'>): boolean {
	if (match.winner !== 1 && match.winner !== 2) return true;
	const name = match.winner === 1 ? match.player1 : match.player2;
	return !!name && !isGhostName(name);
}

export function lastNames(name: string | null | undefined): string[] {
	return (name ?? '')
		.split('/')
		.map((part) => part.trim().split(/\s+/).filter(Boolean).pop()?.toLowerCase())
		.filter((n): n is string => !!n);
}

export function namesOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	const na = a.trim().toLowerCase();
	const nb = b.trim().toLowerCase();
	if (na === nb) return true;
	const la = lastNames(a);
	const lb = lastNames(b);
	if (!la.length || !lb.length) return false;
	return la.every((ln) => lb.some((p) => p === ln || p.includes(ln) || ln.includes(p)));
}

export function isConfirmed(match: Pick<PublishedMatch, 'status' | 'winner'>): boolean {
	if (match.winner !== 1 && match.winner !== 2) return false;
	return match.status === 'played' || match.status === 'forfeit' || match.status === 'bye';
}

export function validateParsedMatch(match: ParsedMatch, rules: ScoreRuleSet): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	if (match.winner != null && !winnerIsPlayer(match)) {
		issues.push({
			level: 'error',
			code: 'winner-not-player',
			message: `Winner side ${match.winner} is not a named player`,
			matchId: match.matchId ?? match.r2MatchId,
		});
	}
	for (const issue of validateScore(match.score, rules, match.status)) {
		issues.push({ ...issue, matchId: match.matchId ?? match.r2MatchId });
	}
	return issues;
}

function matchNum(matchId: string): number {
	const m = matchId.match(/(\d+)$/);
	return m ? Number(m[1]) : Number.NaN;
}

/**
 * Elimination consistency: a confirmed winner should appear in a later-round
 * match (lower match number) unless this is the championship (lowest number).
 */
export function validateBracketConsistency(matches: Record<string, PublishedMatch>): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const list = Object.values(matches).filter((m) => m.matchId);
	if (list.length < 2) return issues;

	const nums = list.map((m) => matchNum(m.matchId)).filter((n) => !Number.isNaN(n));
	if (!nums.length) return issues;
	const finalNum = Math.min(...nums);

	for (const match of list) {
		if (!isConfirmed(match) || match.status === 'bye') continue;
		const n = matchNum(match.matchId);
		if (Number.isNaN(n) || n === finalNum) continue;
		const winnerName = match.winner === 1 ? match.player1 : match.player2;
		if (isGhostName(winnerName)) continue;

		const later = list.filter((other) => {
			if (other.matchId === match.matchId) return false;
			const on = matchNum(other.matchId);
			return !Number.isNaN(on) && on < n;
		});
		if (!later.length) continue;
		const appears = later.some(
			(other) => namesOverlap(winnerName, other.player1) || namesOverlap(winnerName, other.player2),
		);
		if (!appears) {
			issues.push({
				level: 'warn',
				code: 'bracket-advance',
				message: `${winnerName} won ${match.matchId} but does not appear in a later-round match`,
				matchId: match.matchId,
			});
		}
	}

	return issues;
}

export function validateDivisionSnapshot(
	next: DivisionSnapshot,
	prev: DivisionSnapshot | undefined,
	rules: ScoreRuleSet,
): DivisionValidation {
	const issues: ValidationIssue[] = [];

	if (prev && next.matchCount < prev.matchCount) {
		issues.push({
			level: 'error',
			code: 'match-count-drop',
			message: `Match count dropped from ${prev.matchCount} to ${next.matchCount}`,
		});
	}

	for (const match of Object.values(next.matches)) {
		issues.push(
			...validateParsedMatch(
				{
					...match,
					matchId: match.matchId,
					divisionCode: next.code,
					divisionLabel: next.label,
				},
				rules,
			),
		);
	}

	if (next.format === 'elimination' || next.format === 'olympic' || next.format === 'playoff') {
		issues.push(...validateBracketConsistency(next.matches));
	}

	return { ok: !issues.some((i) => i.level === 'error'), issues };
}
