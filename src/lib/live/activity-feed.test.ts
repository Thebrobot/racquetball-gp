import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIVE_EVENTS } from './config';
import {
	applyActivityBackfills,
	ensureActivityForFinals,
	feedHasMatch,
	insertActivityEvent,
	reconcileActivityEvent,
} from './activity-feed';
import { unionActivityFeeds } from './monotonic';
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
		const mbd1 = filled.events.find((e) => e.matchId === 'MBD1');
		const med6 = filled.events.find((e) => e.matchId === 'MED6');
		assert.equal(mbd1?.at, '2026-10-24T20:45:00.000Z');
		assert.ok(med6);
		assert.ok(mbd1 && mbd1.at > med6.at);
		assert.ok((filled.lastUpdated ?? '') >= '2026-10-24T20:45:00.000Z');
	});

	it('does not duplicate MBD1 when the feed already has it', () => {
		const once = applyActivityBackfills('port-st-lucie-open', emptyFeed());
		const twice = applyActivityBackfills('port-st-lucie-open', once);
		assert.equal(twice.events.filter((e) => e.matchId === 'MBD1').length, 1);
	});
});

describe('bundled activity and results include MBD1', () => {
	it('bundled feed uses pre-rollback stamps, not the 06:13Z restore time', () => {
		const feed = getBundledActivity();
		assert.equal(feed.events.find((e) => e.matchId === 'MA6')?.at, '2026-10-24T18:10:00.000Z');
		assert.equal(feed.events.find((e) => e.matchId === 'MA8')?.at, '2026-10-24T18:10:00.000Z');
		assert.equal(feed.events.find((e) => e.matchId === 'MA9')?.at, '2026-10-24T12:20:00.000Z');
		assert.equal(feed.events.find((e) => e.matchId === 'ME7')?.at, '2026-10-24T20:55:00.000Z');
		assert.equal(feed.events.find((e) => e.matchId === 'MBD3')?.at, '2026-10-24T19:40:00.000Z');
		assert.match(feed.events.find((e) => e.matchId === 'M60+6')?.headline ?? '', /^Correction:/);
		assert.ok(!feed.events.some((e) => e.at === '2026-10-25T06:13:08.147Z'));
		assert.ok(!feed.events.some((e) => e.at === '2026-10-24T16:17:40.251Z'));
		assert.ok(!feed.events.some((e) => e.at.startsWith('2026-10-24T21:2') && ['MO2','MED7','ME7','MCSD6','MBD3','ME5','MCSD5'].includes(e.matchId)));
	});

	it('getBundledActivity and getBundledResults publish the Appleby/Kern final', () => {
		const feed = getBundledActivity();
		assert.ok(feedHasMatch(feed, 'MBD1'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MBD1')?.headline,
			'Ryan Appleby / Matt Kern def Paul Sotolongo / Mark Manzano',
		);
		assert.ok(feedHasMatch(feed, 'M60+4'));
		assert.equal(feed.events.find((e) => e.matchId === 'M60+4')?.headline, 'Val Peco def Mike Boyar');
		assert.equal(feed.events.find((e) => e.matchId === 'M60+4')?.detail, '15-6, 15-2');
		assert.ok(feedHasMatch(feed, 'MB3'));
		assert.equal(feed.events.find((e) => e.matchId === 'MB3')?.headline, 'Matt Kern def Kyle Artman');
		assert.equal(feed.events.find((e) => e.matchId === 'MB3')?.at, '2026-10-25T13:35:00.000Z');
		assert.ok(feedHasMatch(feed, 'MCSD3'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MCSD3')?.headline,
			'Val Peco / Tyson Peco def Dirk Huck / John Joseph',
		);
		assert.ok(feedHasMatch(feed, 'MCSD4'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MCSD4')?.headline,
			'Mike Bock / Terry Money def Tony Gutierrez / Gene Fry',
		);
		assert.ok(feedHasMatch(feed, 'ME3'));
		assert.equal(feed.events.find((e) => e.matchId === 'ME3')?.headline, 'Scott Haacke def Chris Dermody');
		assert.equal(feed.events.find((e) => e.matchId === 'ME3')?.detail, '7-15, 15-9, 11-3');
		assert.equal(feed.events.find((e) => e.matchId === 'ME3')?.at, '2026-10-25T14:50:00.000Z');
		assert.ok(feedHasMatch(feed, 'MAD4'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MAD4')?.headline,
			'Tony Gutierrez / Gene Fry def Paul Sotolongo / Kyle Artman',
		);
		assert.equal(feed.events.find((e) => e.matchId === 'MAD4')?.detail, '13-15, 15-4, 11-3');
		assert.equal(feed.events.find((e) => e.matchId === 'MAD4')?.at, '2026-10-25T15:50:00.000Z');
		assert.ok(feedHasMatch(feed, 'MED4'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MED4')?.headline,
			'Wade Stubanas / Brian Grantham def Samuel Schulze / Brendan Anthony',
		);
		assert.equal(feed.events.find((e) => e.matchId === 'MED4')?.detail, '15-7, 15-14');
		assert.equal(feed.events.find((e) => e.matchId === 'MED4')?.at, '2026-10-25T16:40:00.000Z');
		assert.ok(feedHasMatch(feed, 'MO1'));
		assert.equal(feed.events.find((e) => e.matchId === 'MO1')?.headline, 'Annie Sanchez def Naomi Ros');
		assert.equal(feed.events.find((e) => e.matchId === 'MO1')?.detail, '15-10, 15-13');
		assert.equal(feed.events.find((e) => e.matchId === 'MO1')?.at, '2026-10-25T17:10:00.000Z');
		assert.ok(feedHasMatch(feed, 'MED3'));
		assert.equal(
			feed.events.find((e) => e.matchId === 'MED3')?.headline,
			'Mike Bock / Terry Money def Scott Haacke / Bryon Haacke',
		);
		assert.equal(feed.events.find((e) => e.matchId === 'MED3')?.detail, '14-15, 15-4, 11-6');
		assert.equal(feed.events.find((e) => e.matchId === 'MED3')?.at, '2026-10-25T18:20:00.000Z');
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

	it('never restamps a restored row and keeps a Correction prefix', () => {
		const restamped = insertActivityEvent(
			{
				lastUpdated: '2026-10-25T06:13:08.147Z',
				eventSlug: 'port-st-lucie-open',
				events: [
					{
						id: '2026-10-25T06:13:08.147Z-mens-singles-a-MA6',
						at: '2026-10-25T06:13:08.147Z',
						type: 'result',
						divisionId: 'mens-singles-a',
						divisionLabel: "Men's Singles: A",
						matchId: 'MA6',
						headline: 'Jason Cheng def Larry Prince Jr.',
						detail: '15-10, 15-8',
						bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-a',
					},
				],
			},
			{
				id: '2026-10-24T18:10:00.000Z-mens-singles-a-MA6',
				at: '2026-10-24T18:10:00.000Z',
				type: 'result',
				divisionId: 'mens-singles-a',
				divisionLabel: "Men's Singles: A",
				matchId: 'MA6',
				headline: 'Jason Cheng def Larry Prince Jr.',
				detail: '15-10, 15-8',
				bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-a',
			},
		);
		assert.equal(restamped.events.find((e) => e.matchId === 'MA6')?.at, '2026-10-24T18:10:00.000Z');

		const correction = reconcileActivityEvent(
			{
				id: 'plain',
				at: '2026-10-24T16:17:40.251Z',
				type: 'result',
				divisionId: 'mens-age-60',
				divisionLabel: "Men's Age Singles: 60+",
				matchId: 'M60+6',
				headline: 'Dirk Huck def Steve Disalvo',
				detail: '15-13, 15-10',
				bracketHref: '/events/port-st-lucie-open/divisions/mens-age-60',
			},
			{
				id: 'corr',
				at: '2026-10-24T14:50:00.000Z',
				type: 'result',
				divisionId: 'mens-age-60',
				divisionLabel: "Men's Age Singles: 60+",
				matchId: 'M60+6',
				headline: 'Correction: Dirk Huck def Steve Disalvo',
				detail: '15-13, 15-10',
				bracketHref: '/events/port-st-lucie-open/divisions/mens-age-60',
				correction: true,
			},
		);
		assert.equal(correction.at, '2026-10-24T14:50:00.000Z');
		assert.match(correction.headline, /^Correction: Dirk Huck def Steve Disalvo/);
		assert.equal(correction.correction, true);

		const united = unionActivityFeeds(
			{
				lastUpdated: '2026-10-25T06:13:08.147Z',
				eventSlug: 'port-st-lucie-open',
				events: [
					{
						id: 'late-me7',
						at: '2026-10-24T21:24:00.000Z',
						type: 'result',
						divisionId: 'mens-singles-elite',
						divisionLabel: "Men's Singles: Elite",
						matchId: 'ME7',
						headline: 'Chris Dermody def Chris Steinheiser',
						detail: '15-9, 15-10',
						bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-elite',
					},
				],
			},
			{
				lastUpdated: '2026-10-25T02:05:00.000Z',
				eventSlug: 'port-st-lucie-open',
				events: [
					{
						id: 'real-me7',
						at: '2026-10-24T20:55:00.000Z',
						type: 'result',
						divisionId: 'mens-singles-elite',
						divisionLabel: "Men's Singles: Elite",
						matchId: 'ME7',
						headline: 'Chris Dermody def Chris Steinheiser',
						detail: '15-9, 15-10',
						bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-elite',
					},
				],
			},
		);
		assert.equal(united.events.find((e) => e.matchId === 'ME7')?.at, '2026-10-24T20:55:00.000Z');
	});

	it('backfill restores pre-06:13Z stamps and the M60+6 Correction prefix', () => {
		const filled = applyActivityBackfills('port-st-lucie-open', {
			lastUpdated: '2026-10-25T06:13:08.147Z',
			eventSlug: 'port-st-lucie-open',
			events: [
				{
					id: '2026-10-25T06:13:08.147Z-mens-singles-a-MA6',
					at: '2026-10-25T06:13:08.147Z',
					type: 'result',
					divisionId: 'mens-singles-a',
					divisionLabel: "Men's Singles: A",
					matchId: 'MA6',
					headline: 'Jason Cheng def Larry Prince Jr.',
					detail: '15-10, 15-8',
					bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-a',
				},
				{
					id: '2026-10-24T16:17:40.251Z-mens-age-60-M60+6',
					at: '2026-10-24T16:17:40.251Z',
					type: 'result',
					divisionId: 'mens-age-60',
					divisionLabel: "Men's Age Singles: 60+",
					matchId: 'M60+6',
					headline: 'Dirk Huck def Steve Disalvo',
					detail: '15-13, 15-10',
					bracketHref: '/events/port-st-lucie-open/divisions/mens-age-60',
				},
			],
		});
		assert.equal(filled.events.find((e) => e.matchId === 'MA6')?.at, '2026-10-24T18:10:00.000Z');
		assert.ok(filled.events.find((e) => e.matchId === 'MA6')?.at !== '2026-10-25T06:13:08.147Z');
		const m606 = filled.events.find((e) => e.matchId === 'M60+6');
		assert.match(m606?.headline ?? '', /^Correction:/);
		assert.equal(m606?.at, '2026-10-24T14:50:00.000Z');
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
