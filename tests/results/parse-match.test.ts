import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseMatchPage } from '../../src/lib/results/parse-match.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(dir, 'fixtures', name), 'utf-8');

describe('parseMatchPage', () => {
	it('reads a singles winner, score, court, and match code', () => {
		const m = parseMatchPage(fixture('match-singles.html'), '4948979');
		assert.equal(m.player1, 'Sean Davis');
		assert.equal(m.player2, 'Ashkon Mahmoudi');
		assert.equal(m.winner, 1);
		assert.equal(m.score, '15-7, 15-8');
		assert.equal(m.status, 'played');
		assert.equal(m.court, 'Court 1');
		assert.equal(m.matchId, 'MS354510');
		assert.equal(m.divisionCode, 'MS3545');
		assert.equal(m.isDoubles, false);
	});

	it('joins doubles partners and marks the winning team', () => {
		const m = parseMatchPage(fixture('match-doubles.html'), '4942723');
		assert.equal(m.player1, 'Abeir Kapoor / Maverick Bredeson');
		assert.equal(m.player2, 'Jeremiah Lapp / Stetson Lapp');
		assert.equal(m.winner, 2);
		assert.equal(m.score, '15-6, 15-6');
		assert.equal(m.isDoubles, true);
		assert.equal(m.matchId, 'B10D9');
	});

	it('classifies forfeits / no-shows without inventing a numeric score', () => {
		const m = parseMatchPage(fixture('match-forfeit.html'), '1');
		assert.equal(m.winner, 1);
		assert.equal(m.status, 'forfeit');
		assert.match(m.score ?? '', /WBF/i);
	});

	it('leaves unplayed matches without a winner', () => {
		const m = parseMatchPage(fixture('match-unplayed.html'), '2');
		assert.equal(m.player1, 'Player One');
		assert.equal(m.player2, 'Player Two');
		assert.equal(m.winner, null);
		assert.equal(m.score, null);
		assert.equal(m.status, 'unplayed');
	});
});
