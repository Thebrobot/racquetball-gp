import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EVENTS } from './events';
import { getPlayerScheduleEntries } from './players';

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
		assert.ok(rows >= (psl.profiles?.length ?? 0));
		assert.ok(ms < 1_500, `hub-style schedule build took ${ms}ms`);
	});
});
