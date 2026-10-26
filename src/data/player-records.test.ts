import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { incomingFillsSlot, playerAppearsInSlot } from '../lib/live/r2-names';
import { applyResultsToEvent, EVENTS } from './events';
import { getPlayerMatchHistory, missingEventDivisionLinks } from './players';
import { PORT_ST_LUCIE_EVENT } from './port-st-lucie-event';

const pslResults = JSON.parse(
	readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'port-st-lucie-results.json'), 'utf-8'),
) as { divisions: Record<string, Record<string, { player1?: string; player2?: string; winner?: 1 | 2; score?: string }>> };

function findMatch(event: (typeof EVENTS)[number], matchId: string) {
	for (const div of event.divisionDetails) {
		for (const round of div.rounds ?? []) {
			const hit = round.matches.find((m) => m.matchId === matchId);
			if (hit) return { div, match: hit };
		}
	}
	return null;
}

describe('PSL player records include every match the player appears in', () => {
	const psl = EVENTS.find((e) => e.slug === 'port-st-lucie-open');
	assert.ok(psl);

	it('overlays live MED10 names onto Bartolome / TBD so Caruso is on the team', () => {
		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, pslResults.divisions);
		const hit = findMatch(event, 'MED10');
		assert.ok(hit);
		assert.match(hit.match.player1, /Huck/);
		assert.match(hit.match.player1, /Joseph/);
		assert.equal(hit.match.player2, 'Greg Caruso / Alex Bartolome');
		assert.equal(hit.match.winner, 1);
		assert.match(hit.match.score ?? '', /No Show/i);
	});

	it('counts MED10 as a PSL loss for Caruso and Bartolome (1L from the no-show)', () => {
		const caruso = getPlayerMatchHistory('Greg Caruso', [psl!]);
		const med10 = caruso.find((m) => m.divisionId === 'mens-doubles-elite' && /Huck/.test(m.opponent));
		assert.ok(med10);
		assert.equal(med10.result, 'loss');
		assert.match(med10.score ?? '', /No Show/i);
		assert.equal(
			caruso.filter((m) => m.result === 'loss' && m.divisionId === 'mens-doubles-elite').length,
			1,
		);

		const bart = getPlayerMatchHistory('Alex Bartolome', [psl!]);
		const bartMed = bart.find((m) => m.divisionId === 'mens-doubles-elite' && /Huck/.test(m.opponent));
		assert.ok(bartMed);
		assert.equal(bartMed.result, 'loss');
	});

	it('still records MED10 if Caruso has no Doubles Elite profile row', () => {
		const stripped = {
			...PORT_ST_LUCIE_EVENT,
			profiles: PORT_ST_LUCIE_EVENT.profiles.filter(
				(p) => !(p.name === 'Greg Caruso' && p.division === "Men's Doubles: Elite"),
			),
		};
		const event = applyResultsToEvent(stripped, pslResults.divisions);
		assert.ok(
			!event.profiles.some((p) => p.name === 'Greg Caruso' && p.division === "Men's Doubles: Elite"),
		);
		const hist = getPlayerMatchHistory('Greg Caruso', [event]);
		assert.ok(hist.some((m) => m.divisionId === 'mens-doubles-elite' && m.result === 'loss'));
	});

	it('links Caruso to Doubles Elite and has no missing PSL division links among 52 players', () => {
		assert.equal(new Set(psl!.profiles.map((p) => p.name)).size, 52);
		assert.ok(psl!.profiles.some((p) => p.name === 'Greg Caruso' && p.division === "Men's Doubles: Elite"));
		assert.deepEqual(missingEventDivisionLinks(psl!), []);
	});
});

describe('slot matching for doubles teams and TBD partners', () => {
	it('treats Winner-after-TBD live names as filling the static team slot', () => {
		assert.equal(incomingFillsSlot('Bartolome / TBD', 'Greg Caruso / Alex Bartolome'), true);
		assert.equal(incomingFillsSlot('Huck / Joseph', 'Dirk Huck / John Joseph'), true);
		assert.equal(incomingFillsSlot('Scott Gill', 'Mike Boyar'), false);
	});

	it('finds Caruso on a full doubles team and on last-name / TBD after overlay roster expand', () => {
		const roster = ['Greg Caruso', 'Alex Bartolome', 'Dirk Huck', 'John Joseph'];
		assert.equal(playerAppearsInSlot('Greg Caruso', 'Greg Caruso / Alex Bartolome', roster), true);
		assert.equal(playerAppearsInSlot('Greg Caruso', 'Caruso / Bartolome', roster), true);
		assert.equal(playerAppearsInSlot('Greg Caruso', 'Huck / Joseph', roster), false);
	});
});
