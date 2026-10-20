import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventWindow, isEventWindowOpen } from '../../src/lib/results/window.ts';
import type { R2EventConfig } from '../../src/lib/results/types.ts';

const sarasota: R2EventConfig = {
	slug: 'sarasota-open',
	tid: '54249',
	name: 'Sarasota Open',
	startDate: '2026-07-10',
	endDate: '2026-07-12',
	timezone: 'America/New_York',
};

describe('eventWindow', () => {
	it('opens Friday morning Eastern and closes early Monday', () => {
		const { start, end } = eventWindow(sarasota);
		// Friday Jul 10 2026 06:00 EDT = 10:00 UTC
		assert.equal(start.toISOString(), '2026-07-10T10:00:00.000Z');
		// Monday Jul 13 2026 08:00 EDT = 12:00 UTC
		assert.equal(end.toISOString(), '2026-07-13T12:00:00.000Z');
	});

	it('is closed outside the window and open during play', () => {
		assert.equal(isEventWindowOpen(sarasota, new Date('2026-07-09T12:00:00Z')), false);
		assert.equal(isEventWindowOpen(sarasota, new Date('2026-07-11T16:00:00Z')), true);
		assert.equal(isEventWindowOpen(sarasota, new Date('2026-07-13T13:00:00Z')), false);
	});
});

const portStLucie: R2EventConfig = {
	slug: 'port-st-lucie-open',
	tid: '54248',
	name: 'Port St. Lucie Open',
	startDate: '2026-10-23',
	endDate: '2026-10-25',
	timezone: 'America/New_York',
};

describe('Port St. Lucie window', () => {
	it('opens Friday 23 Oct 2026 06:00 ET and closes Monday 08:00 ET', () => {
		const { start, end } = eventWindow(portStLucie);
		assert.equal(start.toISOString(), '2026-10-23T10:00:00.000Z');
		assert.equal(end.toISOString(), '2026-10-26T12:00:00.000Z');
	});
});
