import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyResultsToEvent, EVENTS } from './events';
import { getPlayerScheduleEntries, nextCallCourt } from './players';
import { PORT_ST_LUCIE_EVENT } from './port-st-lucie-event';
import pslResults from './port-st-lucie-results.json';

describe('getPlayerScheduleEntries', () => {
	const psl = EVENTS.find((e) => e.slug === 'port-st-lucie-open');
	assert.ok(psl);

	it('skips draw-wide discovery so the live event hub can render quickly', () => {
		const t0 = Date.now();
		let rows = 0;
		for (const profile of psl.profiles ?? []) {
			const entries = getPlayerScheduleEntries(
				profile.name,
				[{ ...profile, eventName: psl.name }],
				[psl],
				{ discoverExtraDivisions: false },
			);
			rows += entries.length;
		}
		const ms = Date.now() - t0;
		// Eliminated players drop their ticket, so row count can sit below the
		// static profile list after live results land. Still require real work.
		assert.ok(rows >= 4, `expected hub schedule rows, got ${rows}`);
		assert.ok(ms < 1_500, `hub-style schedule build took ${ms}ms`);
	});
});

describe('nextCallCourt', () => {
	it('does not inherit the previous match court when the next match has none', () => {
		assert.equal(nextCallCourt(undefined, 'Court 3', true), null);
		assert.equal(nextCallCourt('', 'Court 3', true), null);
		assert.equal(nextCallCourt('Court 2', 'Court 3', true), '2');
		assert.equal(nextCallCourt(undefined, 'Court 3', false), '3');
	});

	it('shows TBD for Appleby/Kern MBD1 (Sat 3:00 PM, no court on R2)', () => {
		const divisions = structuredClone(pslResults.divisions) as Parameters<typeof applyResultsToEvent>[1];
		// Isolate the court-TBD case: MBD6 done, MBD1 still open with no court.
		divisions['mens-doubles-b']!.MBD6 = {
			...divisions['mens-doubles-b']!.MBD6,
			winner: 1,
			score: '15-8, 15-10',
		};
		const mbd1 = { ...divisions['mens-doubles-b']!.MBD1 };
		delete mbd1.winner;
		delete mbd1.score;
		delete mbd1.court;
		divisions['mens-doubles-b']!.MBD1 = mbd1;
		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, divisions);
		const profile = event.profiles.find(
			(p) => p.name === 'Ryan Appleby' && p.division === "Men's Doubles: B",
		);
		assert.ok(profile);
		const next = getPlayerScheduleEntries(
			profile.name,
			[{ ...profile, eventName: event.name }],
			[event],
			{ discoverExtraDivisions: false },
		)[0];
		assert.ok(next);
		assert.match(next.time ?? '', /3:00\s*PM/i);
		assert.equal(next.note, undefined);
		assert.ok(profile.note);
		assert.equal(nextCallCourt(next.note, profile.note, true), null);
	});
});
