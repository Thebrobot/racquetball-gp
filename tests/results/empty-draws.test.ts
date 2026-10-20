import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EVENT_SKELETONS } from '../../src/data/events.ts';
import { getEventConfig, R2_SYNC_EVENTS } from '../../src/lib/results/config.ts';
import { isAwaitingDrawsHtml, isRateLimitedHtml, looksLikeR2Html } from '../../src/lib/results/fetch.ts';
import { parseDivisionList } from '../../src/lib/results/parse-divisions.ts';
import { resolveSnapshotStatus } from '../../src/lib/results/sync.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(dir, 'fixtures', name), 'utf-8');

describe('awaiting-draws HTML', () => {
	it('treats the R2 "No Draws" page as a valid empty list, not an error', () => {
		const html = fixture('list-no-draws.html');
		assert.equal(isRateLimitedHtml(html), false);
		assert.equal(isAwaitingDrawsHtml(html), true);
		assert.equal(looksLikeR2Html(html), true);
		assert.deepEqual(parseDivisionList(html), []);
	});

	it('does not treat a rate-limit / captcha page as "no draws yet"', () => {
		const html = '<html><title>Verify</title><p>Too many page views. Verify you are not a robot.</p></html>';
		assert.equal(isRateLimitedHtml(html), true);
		assert.equal(isAwaitingDrawsHtml(html), false);
		assert.equal(looksLikeR2Html(html), false);
	});
});

describe('resolveSnapshotStatus', () => {
	it('marks a first sync with zero draws as awaiting-draws', () => {
		assert.equal(
			resolveSnapshotStatus({
				discoveredCount: 0,
				staleCount: 0,
				publishedDivisionCount: 0,
				prevHadMatches: false,
			}),
			'awaiting-draws',
		);
	});

	it('keeps last good data as partial when a later list is empty', () => {
		assert.equal(
			resolveSnapshotStatus({
				discoveredCount: 0,
				staleCount: 1,
				publishedDivisionCount: 2,
				prevHadMatches: true,
			}),
			'partial',
		);
	});

	it('treats a partial draw list with no stale divisions as ok', () => {
		assert.equal(
			resolveSnapshotStatus({
				discoveredCount: 2,
				staleCount: 0,
				publishedDivisionCount: 2,
				prevHadMatches: false,
			}),
			'ok',
		);
	});

	it('marks mixed success/failure as partial, not failed', () => {
		assert.equal(
			resolveSnapshotStatus({
				discoveredCount: 4,
				staleCount: 1,
				publishedDivisionCount: 3,
				prevHadMatches: false,
			}),
			'partial',
		);
	});
});

describe('Port St. Lucie Open wiring', () => {
	it('is in the sync config with TID 54248 and usar-adult rules', () => {
		const event = getEventConfig('port-st-lucie-open');
		assert.ok(event);
		assert.equal(event.tid, '54248');
		assert.equal(event.startDate, '2026-10-23');
		assert.equal(event.endDate, '2026-10-25');
		assert.equal(event.timezone, 'America/New_York');
		assert.equal(event.scoreRules, 'usar-adult');
		assert.equal(R2_SYNC_EVENTS.filter((e) => e.slug === 'port-st-lucie-open').length, 1);
	});

	it('has an events.ts skeleton that renders the same routes as Ocala/Sarasota', () => {
		const event = EVENT_SKELETONS.find((e) => e.slug === 'port-st-lucie-open');
		assert.ok(event);
		assert.equal(event.name, 'Port St. Lucie Open');
		assert.equal(event.cityLine, 'Port St. Lucie, FL');
		assert.equal(event.spotlightVenue, 'Civic Center');
		assert.ok(event.divisionDetails.length > 0);
		assert.ok(event.divisionDetails.every((d) => d.id && d.label));
		assert.deepEqual(event.profiles, []);
	});
});
