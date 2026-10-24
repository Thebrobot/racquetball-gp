import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIVE_EVENTS } from './config';
import {
	applyActivityBackfills,
	ensureActivityForFinals,
	feedHasMatch,
	insertActivityEvent,
} from './activity-feed';
import { overlayLastGoodWithActivity, mergeScrapedResults } from './scrape';
import { getBundledActivity, getBundledResults } from './store';
import type { LiveActivityFeed } from './types';

const emptyFeed = (lastUpdated: string | null = '2026-10-24T20:40:00.000Z'): LiveActivityFeed => ({
	lastUpdated,
	eventSlug: 'port-st-lucie-open',
	events: [
		{
			id: '2026-10-24T20:40:00.000Z-mens-doubles-elite-MED6',
			at: '2026-10-24T20:40:00.000Z',
			type: 'result',
			divisionId: 'mens-doubles-elite',
			divisionLabel: "Men's Doubles: Elite",
			matchId: 'MED6',
			headline: 'Tony Gutierrez / Jim Russell def Mike Bock / Terry Money',
			detail: '15-8, 15-6',
			bracketHref: '/events/port-st-lucie-open/divisions/mens-doubles-elite',
		},
	],
});

describe('result becomes final → feed entry written', () => {
	it('writes an activity row the first time a match becomes final', () => {
		const merged = mergeScrapedResults(
			LIVE_EVENTS.psl,
			{
				lastUpdated: '2026-10-24T20:40:00.000Z',
				divisions: {
					'mens-doubles-b': {
						MBD1: {
							player1: 'Ryan Appleby / Matt Kern',
							player2: 'Paul Sotolongo / Mark Manzano',
							scheduledTime: 'Saturday · 3:00 PM',
						},
					},
				},
			},
			{
				scraped: 1,
				matchesWithResults: 1,
				divisions: {
					'mens-doubles-b': {
						MBD1: {
							player1: 'Ryan Appleby / Matt Kern',
							player2: 'Paul Sotolongo / Mark Manzano',
							winner: 1,
							score: '15-3, 15-7',
							scheduledTime: 'Saturday · 3:00 PM',
						},
					},
				},
				divisionReports: [],
				errors: [],
				quarantined: [],
				resolvedMatchIds: ['MBD1'],
				confirmedMatchIds: ['MBD1'],
				audit: [],
			},
			emptyFeed(),
			'2026-10-24T20:45:00.000Z',
		);
		assert.equal(merged.changed, true);
		assert.ok(feedHasMatch(merged.activity, 'MBD1'));
		const row = merged.activity.events.find((e) => e.matchId === 'MBD1');
		assert.equal(row?.headline, 'Ryan Appleby / Matt Kern def Paul Sotolongo / Mark Manzano');
		assert.equal(row?.detail, '15-3, 15-7');
		assert.ok(row && row.at >= '2026-10-24T20:40:00.000Z');
		assert.ok(merged.activity.events[0]?.matchId === 'MBD1' || merged.activity.events[1]?.matchId === 'MED6');
	});

	it('last-good override overlay writes a feed row (the skip path from #48 backoff)', () => {
		const { results, changed, activity, newActivity } = overlayLastGoodWithActivity(
			LIVE_EVENTS.psl,
			{
				lastUpdated: '2026-10-24T20:40:00.000Z',
				divisions: {
					'mens-doubles-b': {
						MBD1: {
							player1: 'Ryan Appleby / Matt Kern',
							player2: 'Paul Sotolongo / Mark Manzano',
							scheduledTime: 'Saturday · 3:00 PM',
						},
					},
				},
			},
			emptyFeed(),
			'2026-10-24T20:45:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-doubles-b']?.MBD1?.winner, 1);
		assert.equal(results.divisions['mens-doubles-b']?.MBD1?.score, '15-3, 15-7');
		assert.ok(newActivity >= 1 || feedHasMatch(activity, 'MBD1'));
		assert.ok(feedHasMatch(activity, 'MBD1'));
		assert.equal(
			activity.events.find((e) => e.matchId === 'MBD1')?.headline,
			'Ryan Appleby / Matt Kern def Paul Sotolongo / Mark Manzano',
		);
	});
});

describe('already-final results still backfill a missing feed row', () => {
	it('does not skip the feed when results already have the winner (4:45 sync skip)', () => {
		const merged = mergeScrapedResults(
			LIVE_EVENTS.psl,
			{
				lastUpdated: '2026-10-24T20:45:00.000Z',
				divisions: {
					'mens-doubles-b': {
						MBD1: {
							player1: 'Ryan Appleby / Matt Kern',
							player2: 'Paul Sotolongo / Mark Manzano',
							winner: 1,
							score: '15-3, 15-7',
							scheduledTime: 'Saturday · 3:00 PM',
						},
					},
				},
			},
			{
				scraped: 0,
				matchesWithResults: 0,
				divisions: {},
				divisionReports: [],
				errors: [],
				quarantined: [],
				resolvedMatchIds: [],
				audit: [],
			},
			emptyFeed(),
			'2026-10-24T21:00:00.000Z',
		);
		assert.ok(feedHasMatch(merged.activity, 'MBD1'));
		const row = merged.activity.events.find((e) => e.matchId === 'MBD1');
		assert.equal(row?.at, '2026-10-24T20:45:00.000Z');
		assert.equal(row?.detail, '15-3, 15-7');
		const med6 = merged.activity.events.findIndex((e) => e.matchId === 'MED6');
		const mbd1 = merged.activity.events.findIndex((e) => e.matchId === 'MBD1');
		assert.ok(mbd1 < med6);
	});

	it('read/build overlay inserts MBD1 after MED6 without inventing a later stamp', () => {
		const filled = applyActivityBackfills('port-st-lucie-open', emptyFeed());
		assert.ok(feedHasMatch(filled, 'MBD1'));
		assert.equal(filled.events[0]?.matchId, 'MBD1');
		assert.equal(filled.events[0]?.at, '2026-10-24T20:45:00.000Z');
		assert.equal(filled.events[1]?.matchId, 'MED6');
		assert.equal(filled.lastUpdated, '2026-10-24T20:45:00.000Z');
	});

	it('does not duplicate MBD1 when the feed already has it', () => {
		const once = applyActivityBackfills('port-st-lucie-open', emptyFeed());
		const twice = applyActivityBackfills('port-st-lucie-open', once);
		assert.equal(twice.events.filter((e) => e.matchId === 'MBD1').length, 1);
	});
});

describe('bundled activity and results include MBD1', () => {
	it('getBundledActivity and getBundledResults publish the Appleby/Kern final', () => {
		const feed = getBundledActivity();
		assert.ok(feedHasMatch(feed, 'MBD1'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MBD1')?.headline,
			'Ryan Appleby / Matt Kern def Paul Sotolongo / Mark Manzano',
		);
		const row = getBundledResults('port-st-lucie-open').divisions['mens-doubles-b']?.MBD1;
		assert.equal(row?.winner, 1);
		assert.equal(row?.score, '15-3, 15-7');
	});

	it('ensureActivityForFinals uses the pinned 4:45 stamp instead of now', () => {
		const next = ensureActivityForFinals(
			LIVE_EVENTS.psl,
			{
				'mens-doubles-b': {
					MBD1: {
						player1: 'Ryan Appleby / Matt Kern',
						player2: 'Paul Sotolongo / Mark Manzano',
						winner: 1,
						score: '15-3, 15-7',
					},
				},
			},
			emptyFeed(),
			{ at: '2026-10-25T01:00:00.000Z', resultStamp: '2026-10-24T20:45:00.000Z' },
		);
		assert.equal(next.events.find((e) => e.matchId === 'MBD1')?.at, '2026-10-24T20:45:00.000Z');
	});

	it('insertActivityEvent keeps newest-first order', () => {
		const feed = insertActivityEvent(emptyFeed(), {
			id: 'x-MBD1',
			at: '2026-10-24T20:45:00.000Z',
			type: 'result',
			divisionId: 'mens-doubles-b',
			divisionLabel: "Men's Doubles: B",
			matchId: 'MBD1',
			headline: 'Ryan Appleby / Matt Kern def Paul Sotolongo / Mark Manzano',
			detail: '15-3, 15-7',
			bracketHref: '/events/port-st-lucie-open/divisions/mens-doubles-b',
		});
		assert.equal(feed.events[0]?.matchId, 'MBD1');
		assert.equal(feed.events[1]?.matchId, 'MED6');
	});
});
