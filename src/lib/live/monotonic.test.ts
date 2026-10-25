import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIVE_EVENTS } from './config';
import { drawPageUrls, viewBracketUrl, roundRobinUrl } from './config';
import {
	countFinals,
	isActivityRegression,
	isResultsRegression,
	pickRicherResults,
	unionActivityFeeds,
	unionResultsFiles,
} from './monotonic';
import { htmlLooksLikeDrawPage, htmlLooksLikeRoundRobin, parseBracketPage } from './parse-r2';
import { mergeOneMatch, mergeScrapedResults } from './scrape';
import { getBundledActivity, getBundledResults } from './store';
import type { LiveActivityFeed, LiveResultsFile } from './types';

const satSnapshot: LiveResultsFile = {
	lastUpdated: '2026-10-24T21:14:48.489Z',
	divisions: {
		'mens-singles-elite': {
			ME5: { player1: 'Shane De Witt', player2: 'Isaac Taylor', scheduledTime: 'Saturday · 2:00 PM' },
			ME6: { player1: 'Scott Haacke', player2: 'Greg Caruso', winner: 1, score: '15-0, 15-14' },
		},
		'mens-singles-open': {
			MO4: { player1: 'Annie Sanchez', player2: 'Joe Linnell', winner: 1, score: '15-3, 15-8' },
		},
	},
};

const completeBlob: LiveResultsFile = {
	lastUpdated: '2026-10-25T01:00:00.000Z',
	divisions: {
		...satSnapshot.divisions,
		'mens-singles-elite': {
			...satSnapshot.divisions['mens-singles-elite'],
			ME5: {
				player1: 'Shane De Witt',
				player2: 'Isaac Taylor',
				winner: 2,
				score: '15-9, 15-12',
				scheduledTime: 'Saturday · 2:00 PM',
			},
			ME7: {
				player1: 'Chris Dermody',
				player2: 'Chris Steinheiser',
				winner: 1,
				score: '15-9, 15-10',
				court: 'Court 1',
			},
		},
		'mens-singles-open': {
			...satSnapshot.divisions['mens-singles-open'],
			MO2: {
				player1: 'Joe Linnell',
				player2: 'Chris Steinheiser',
				winner: 1,
				score: '15-8, 15-9',
			},
		},
	},
};

describe('monotonic results guard (06:13Z regression)', () => {
	it('never regresses a published final to unplayed', () => {
		const kept = mergeOneMatch(
			{ player1: 'Joe Linnell', player2: 'Chris Steinheiser', winner: 1, score: '15-8, 15-9' },
			{ player1: 'Joe Linnell', player2: 'Chris Steinheiser', scheduledTime: 'Sunday · 10:00 AM' },
			{ quarantined: false, resolved: true },
		);
		assert.equal(kept.winner, 1);
		assert.equal(kept.score, '15-8, 15-9');
	});

	it('does not pick a newer thinner bundled snapshot over a richer blob', () => {
		const restamped = { ...satSnapshot, lastUpdated: '2026-10-25T06:13:08.147Z' };
		const picked = pickRicherResults(completeBlob, restamped);
		assert.ok(countFinals(picked.divisions) >= countFinals(completeBlob.divisions));
		assert.equal(picked.divisions['mens-singles-open']?.MO2?.winner, 1);
		assert.equal(picked.divisions['mens-singles-elite']?.ME5?.winner, 2);
	});

	it('union keeps blob finals that a Saturday fallback dropped', () => {
		const united = unionResultsFiles(satSnapshot, completeBlob);
		assert.equal(united.divisions['mens-singles-open']?.MO2?.winner, 1);
		assert.equal(united.divisions['mens-singles-elite']?.ME5?.score, '15-9, 15-12');
		assert.equal(isResultsRegression(completeBlob, united), false);
	});

	it('a 2-division scrape on a Saturday snapshot cannot replace a complete existing blob', () => {
		const merged = mergeScrapedResults(
			LIVE_EVENTS.psl,
			completeBlob,
			{
				scraped: 2,
				matchesWithResults: 1,
				divisions: {
					'mens-singles-a': {
						MA6: { player1: 'Jason Cheng', player2: 'Larry Prince Jr.', winner: 1, score: '15-10, 15-8' },
					},
				},
				divisionReports: [],
				errors: [],
				quarantined: [],
				resolvedMatchIds: ['MA6', 'ME5', 'MO2'],
				confirmedMatchIds: ['MA6'],
				audit: [],
			},
			{ lastUpdated: completeBlob.lastUpdated, eventSlug: 'port-st-lucie-open', events: [] },
			'2026-10-25T06:13:08.147Z',
		);
		assert.equal(merged.results.divisions['mens-singles-open']?.MO2?.winner, 1);
		assert.equal(merged.results.divisions['mens-singles-elite']?.ME5?.winner, 2);
		assert.ok(countFinals(merged.results.divisions) >= countFinals(completeBlob.divisions));
		assert.equal(isResultsRegression(completeBlob, merged.results), false);
	});

	it('never shrinks the activity feed when merging a Saturday fallback', () => {
		const prev: LiveActivityFeed = {
			lastUpdated: '2026-10-24T22:00:00.000Z',
			eventSlug: 'port-st-lucie-open',
			events: [
				{
					id: 'mo2',
					at: '2026-10-24T21:26:00.000Z',
					type: 'result',
					divisionId: 'mens-singles-open',
					divisionLabel: "Men's Singles: Open",
					matchId: 'MO2',
					headline: 'Joe Linnell def Chris Steinheiser',
					detail: '15-8, 15-9',
					bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-open',
				},
				{
					id: 'med7',
					at: '2026-10-24T21:25:00.000Z',
					type: 'result',
					divisionId: 'mens-doubles-elite',
					divisionLabel: "Men's Doubles: Elite",
					matchId: 'MED7',
					headline: 'Scott Haacke / Bryon Haacke def Dirk Huck / John Joseph',
					detail: '15-10, 15-2',
					bracketHref: '/events/port-st-lucie-open/divisions/mens-doubles-elite',
				},
			],
		};
		const satFeed: LiveActivityFeed = {
			lastUpdated: '2026-10-25T06:13:08.147Z',
			eventSlug: 'port-st-lucie-open',
			events: [
				{
					id: 'ma6',
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
		};
		const united = unionActivityFeeds(satFeed, prev);
		assert.ok(united.events.some((e) => e.matchId === 'MO2'));
		assert.ok(united.events.some((e) => e.matchId === 'MED7'));
		assert.ok(united.events.some((e) => e.matchId === 'MA6'));
		assert.equal(isActivityRegression(prev, united), false);
	});
});

describe('R2 draw URLs', () => {
	it('uses view-bracket.asp and roundRobin.asp, not drawOut.asp first', () => {
		const urls = drawPageUrls(LIVE_EVENTS.psl, 753, 0);
		assert.equal(urls[0], viewBracketUrl(LIVE_EVENTS.psl, 753, 0));
		assert.ok(urls[0]?.includes('/tourney/drawsOut/view-bracket.asp'));
		assert.ok(urls[0]?.includes('TID=54248'));
		assert.equal(urls[1], roundRobinUrl(LIVE_EVENTS.psl, 753, 0));
		assert.ok(urls[1]?.includes('/tourney/drawsOut/roundRobin.asp'));
		assert.ok(urls[2]?.includes('drawOut.asp'));
	});

	it('parses round-robin HTML even when the URL is view-bracket.asp', () => {
		const html = `
			<html><body>
			<font size="6">(MO) Men's Singles - Open - Round Robin</font>
			<table><tr>
				<td>Joe Linnell - W vs. Chris Steinheiser Su 10:00 AM 15-8, 15-9</td>
				<td><a href="javascript:viewAppMatch(4979570);">MO 2</a></td>
			</tr></table>
			</body></html>
		`;
		assert.equal(htmlLooksLikeRoundRobin(html), true);
		assert.equal(htmlLooksLikeDrawPage(html), true);
		const parsed = parseBracketPage(
			html,
			'https://www.r2sports.com/tourney/drawsOut/view-bracket.asp?TID=54248&divID=2&combinedID=0',
		);
		assert.equal(parsed.matches.MO2?.drawWinner, 1);
		assert.equal(parsed.matches.MO2?.drawScore, '15-8, 15-9');
	});
});

describe('restored PSL 06:13Z finals', () => {
	it('bundled results and feed publish the verified Saturday-evening / Sunday results', () => {
		const bundled = getBundledResults('port-st-lucie-open');
		assert.equal(bundled.divisions['mens-singles-open']?.MO2?.winner, 1);
		assert.equal(bundled.divisions['mens-singles-open']?.MO2?.score, '15-8, 15-9');
		assert.equal(bundled.divisions['mens-doubles-b']?.MBD3?.winner, 2);
		assert.equal(bundled.divisions['mens-doubles-b']?.MBD3?.score, '15-1, 15-12');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME5?.winner, 2);
		assert.equal(bundled.divisions['mens-singles-elite']?.ME5?.score, '15-9, 15-12');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME7?.winner, 1);
		assert.equal(bundled.divisions['mens-singles-elite']?.ME7?.score, '15-9, 15-10');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME7?.court, 'Court 1');
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED7?.winner, 2);
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED7?.score, '15-10, 15-2');
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD5?.winner, 1);
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD5?.score, '8-15, 15-2, 15-10');
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD5?.court, 'Court 1');
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD6?.winner, 1);
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD6?.score, '15-7, 15-13');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME3?.player1, 'Scott Haacke');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME3?.player2, 'Chris Dermody');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME4?.player1, 'Trevor Morgan');
		assert.equal(bundled.divisions['mens-singles-elite']?.ME4?.player2, 'Isaac Taylor');
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED3?.player1, 'Mike Bock / Terry Money');
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD3?.player2, 'Val Peco / Tyson Peco');

		const feed = getBundledActivity();
		for (const id of ['MO2', 'MBD3', 'ME5', 'ME7', 'MED7', 'MCSD5', 'MCSD6', 'MBD1']) {
			assert.ok(feed.events.some((e) => e.matchId === id), `missing feed row ${id}`);
		}
		const mo2 = feed.events.find((e) => e.matchId === 'MO2');
		const med6 = feed.events.find((e) => e.matchId === 'MED6' || e.matchId === 'MO4');
		assert.ok(mo2 && med6);
		assert.equal(mo2.at, '2026-10-24T21:05:00.000Z');
		assert.ok(mo2.at < '2026-10-25T06:13:08.147Z');
		assert.equal(bundled.divisions['mens-singles-b']?.MB7?.court, 'Court 1');
		assert.equal(bundled.divisions['mens-age-3040']?.M30405?.court, 'Court 2');
		assert.equal(bundled.divisions['mens-doubles-b']?.MBD1?.court, 'Court 2');
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD6?.court, 'Court 4');
	});

	it('union keeps a stored final court over an older snapshot court or blank', () => {
		const snapshot: LiveResultsFile = {
			lastUpdated: '2026-10-25T06:13:08.147Z',
			divisions: {
				'mens-singles-b': {
					MB7: {
						player1: 'Ben Mordkovich',
						player2: 'Matt Kern',
						winner: 2,
						score: '15-5, 15-8',
						court: 'Court 3',
					},
				},
				'mens-age-3040': {
					M30405: {
						player1: 'Jason Cheng',
						player2: 'Trevor Morgan',
						winner: 2,
						score: '15-7, 15-4',
						court: 'Court 3',
					},
				},
				'mens-doubles-b': {
					MBD1: {
						player1: 'Ryan Appleby / Matt Kern',
						player2: 'Paul Sotolongo / Mark Manzano',
						winner: 1,
						score: '15-3, 15-7',
					},
				},
				'mens-doubles-centurion': {
					MCSD6: {
						player1: 'Dirk Huck / John Joseph',
						player2: 'John Wuchte / Yelandi Rivero',
						winner: 1,
						score: '15-7, 15-13',
					},
				},
			},
		};
		const stored: LiveResultsFile = {
			lastUpdated: '2026-10-25T02:05:00.000Z',
			divisions: {
				'mens-singles-b': {
					MB7: {
						player1: 'Ben Mordkovich',
						player2: 'Matt Kern',
						winner: 2,
						score: '15-5, 15-8',
						court: 'Court 1',
					},
				},
				'mens-age-3040': {
					M30405: {
						player1: 'Jason Cheng',
						player2: 'Trevor Morgan',
						winner: 2,
						score: '15-7, 15-4',
						court: 'Court 2',
					},
				},
				'mens-doubles-b': {
					MBD1: {
						player1: 'Ryan Appleby / Matt Kern',
						player2: 'Paul Sotolongo / Mark Manzano',
						winner: 1,
						score: '15-3, 15-7',
						court: 'Court 2',
					},
				},
				'mens-doubles-centurion': {
					MCSD6: {
						player1: 'Dirk Huck / John Joseph',
						player2: 'John Wuchte / Yelandi Rivero',
						winner: 1,
						score: '15-7, 15-13',
						court: 'Court 4',
					},
				},
			},
		};
		const united = unionResultsFiles(stored, snapshot);
		assert.equal(united.divisions['mens-singles-b']?.MB7?.court, 'Court 1');
		assert.equal(united.divisions['mens-age-3040']?.M30405?.court, 'Court 2');
		assert.equal(united.divisions['mens-doubles-b']?.MBD1?.court, 'Court 2');
		assert.equal(united.divisions['mens-doubles-centurion']?.MCSD6?.court, 'Court 4');
		const flipped = unionResultsFiles(snapshot, stored);
		assert.equal(flipped.divisions['mens-doubles-b']?.MBD1?.court, 'Court 2');
		assert.equal(flipped.divisions['mens-doubles-centurion']?.MCSD6?.court, 'Court 4');
	});
});
