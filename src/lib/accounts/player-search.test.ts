import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimPlayerOptions, exactClaimPlayer, matchClaimPlayers, playerIdentifyLine, playerNameMatches } from './player-search';

describe('playerNameMatches', () => {
	it('matches case-insensitive partial first and last names', () => {
		assert.equal(playerNameMatches('Scott Haacke', 'haacke'), true);
		assert.equal(playerNameMatches('Scott Haacke', 'SCOTT'), true);
		assert.equal(playerNameMatches('Chris Steinheiser', 'steinh'), true);
		assert.equal(playerNameMatches('Annie Sanchez', 'xyz'), false);
	});
});

describe('matchClaimPlayers', () => {
	const players = claimPlayerOptions();

	it('returns a short list of real profiles for a typed name', () => {
		const hits = matchClaimPlayers(players, 'haacke');
		assert.ok(hits.some((p) => p.slug === 'scott-haacke'));
		assert.ok(hits.some((p) => p.slug === 'bryon-haacke'));
		assert.ok(hits.length <= 6);
		assert.equal(matchClaimPlayers(players, 'zzzzz').length, 0);
		assert.equal(matchClaimPlayers(players, '').length, 0);
	});

	it('includes city or division when the profile has them', () => {
		const annie = exactClaimPlayer(players, 'annie sanchez');
		assert.ok(annie);
		const line = playerIdentifyLine(annie!);
		assert.ok(line.length > 0);
	});

	it('marks already-claimed slugs', () => {
		const taken = claimPlayerOptions(['annie-sanchez']);
		assert.equal(exactClaimPlayer(taken, 'annie sanchez')?.claimed, true);
		assert.equal(exactClaimPlayer(taken, 'scott haacke')?.claimed, false);
	});
});
