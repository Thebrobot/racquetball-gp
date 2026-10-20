import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	isConfirmed,
	parseGames,
	validateBracketConsistency,
	validateParsedMatch,
	validateScore,
} from '../../src/lib/results/validate.ts';
import type { PublishedMatch } from '../../src/lib/results/types.ts';

describe('validateScore', () => {
	it('accepts adult 15/11 scores', () => {
		assert.equal(validateScore('15-7, 15-8', 'usar-adult', 'played').length, 0);
		assert.equal(validateScore('8-15, 15-5, 11-4', 'usar-adult', 'played').length, 0);
	});

	it('rejects junk like 609-1 and flags split two-game scores', () => {
		const junk = validateScore('609-1', 'usar-adult', 'played');
		assert.ok(junk.some((i) => i.level === 'error'));
		const split = validateScore('15-7, 7-15', 'usar-adult', 'played');
		assert.ok(split.some((i) => i.code === 'score-split' && i.level === 'warn'));
	});

	it('accepts junior games to 11 under flexible rules', () => {
		assert.equal(validateScore('11-1, 11-1', 'flexible', 'played').length, 0);
		assert.ok(validateScore('11-1, 11-1', 'usar-adult', 'played').some((i) => i.code === 'score-rules'));
	});

	it('allows forfeit text without numeric games', () => {
		assert.equal(validateScore('WBF - No Show', 'usar-adult', 'forfeit').length, 0);
		assert.deepEqual(parseGames('WBF - No Show'), []);
	});
});

describe('validateParsedMatch', () => {
	it('requires the winner to be one of the named sides', () => {
		const issues = validateParsedMatch(
			{
				r2MatchId: '1',
				matchId: 'MO1',
				player1: 'BYE',
				player2: null,
				winner: 1,
				score: '15-0, 15-0',
				status: 'played',
				winMethod: 'Played Match',
				roundLabel: null,
				court: null,
				scheduled: null,
				divisionCode: 'MO',
				divisionLabel: 'Open',
				isDoubles: false,
			},
			'usar-adult',
		);
		assert.ok(issues.some((i) => i.code === 'winner-not-player'));
	});
});

describe('validateBracketConsistency', () => {
	const match = (id: string, p1: string, p2: string, winner: 1 | 2): PublishedMatch => ({
		r2MatchId: id,
		matchId: id,
		player1: p1,
		player2: p2,
		winner,
		score: '15-1, 15-1',
		status: 'played',
		winMethod: 'Played Match',
		roundLabel: null,
		court: null,
		scheduled: null,
		confirmed: true,
		isDoubles: false,
	});

	it('warns when a winner does not appear later', () => {
		const issues = validateBracketConsistency({
			MO8: match('MO8', 'Ada', 'Bea', 1),
			MO1: match('MO1', 'Cara', 'Dee', 1),
		});
		assert.ok(issues.some((i) => i.code === 'bracket-advance'));
	});

	it('passes when the winner advances', () => {
		const issues = validateBracketConsistency({
			MO8: match('MO8', 'Ada', 'Bea', 1),
			MO1: match('MO1', 'Ada', 'Cara', 1),
		});
		assert.equal(issues.filter((i) => i.code === 'bracket-advance').length, 0);
	});
});

describe('isConfirmed', () => {
	it('treats played/forfeit/bye with a winner as confirmed', () => {
		assert.equal(isConfirmed({ status: 'played', winner: 1 }), true);
		assert.equal(isConfirmed({ status: 'unplayed', winner: null }), false);
		assert.equal(isConfirmed({ status: 'played', winner: null }), false);
	});
});
