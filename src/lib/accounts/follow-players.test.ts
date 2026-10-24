import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORT_ST_LUCIE_EVENT } from '../../data/port-st-lucie-event';
import {
	eventFollowPlayers,
	exactFollowPlayer,
	followPlayerMatches,
	matchFollowPlayers,
} from './follow-players';

describe('eventFollowPlayers', () => {
	it('lists unique Port St. Lucie individuals, not doubles teams', () => {
		const players = eventFollowPlayers(PORT_ST_LUCIE_EVENT);
		assert.ok(players.length > 20);
		assert.ok(players.some((p) => p.name === 'Annie Sanchez' && p.slug === 'annie-sanchez'));
		assert.ok(players.some((p) => p.slug === 'scott-haacke'));
		assert.ok(players.every((p) => !p.name.includes('/')));
		const slugs = players.map((p) => p.slug);
		assert.equal(new Set(slugs).size, slugs.length);
	});
});

describe('followPlayerMatches', () => {
	it('matches case-insensitive partial first and last names', () => {
		assert.equal(followPlayerMatches('Scott Haacke', 'haacke'), true);
		assert.equal(followPlayerMatches('Scott Haacke', 'SCOTT'), true);
		assert.equal(followPlayerMatches('Scott Haacke', 'ott ha'), true);
		assert.equal(followPlayerMatches('Chris Steinheiser', 'steinh'), true);
		assert.equal(followPlayerMatches('Larry Prince Jr.', 'prince'), true);
		assert.equal(followPlayerMatches('Annie Sanchez', 'xyz'), false);
	});
});

describe('matchFollowPlayers', () => {
	const roster = eventFollowPlayers(PORT_ST_LUCIE_EVENT);

	it('filters the live draw as the user types', () => {
		const haacke = matchFollowPlayers(roster, 'haacke');
		assert.ok(haacke.some((p) => p.slug === 'scott-haacke'));
		assert.ok(haacke.some((p) => p.slug === 'bryon-haacke'));
		assert.equal(matchFollowPlayers(roster, 'zzzzz').length, 0);
	});

	it('resolves an exact typed name', () => {
		const hit = exactFollowPlayer(roster, 'annie sanchez');
		assert.equal(hit?.slug, 'annie-sanchez');
		assert.equal(exactFollowPlayer(roster, 'nobody here'), undefined);
	});
});
