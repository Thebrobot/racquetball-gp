import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyResultsToEvent, EVENTS } from '../../data/events';
import { PORT_ST_LUCIE_EVENT } from '../../data/port-st-lucie-event';
import { LIVE_EVENTS } from './config';
import {
	applyMatchOverrides,
	collectSupersededOverrides,
	overlayOverridesOnFile,
	overrideYieldsToR2,
} from './match-overrides';
import { mergeScrapedResults } from './scrape';
import { getBundledResults } from './store';

function findPslMatch(matchId: string) {
	const psl = EVENTS.find((e) => e.slug === 'port-st-lucie-open');
	assert.ok(psl);
	for (const div of psl.divisionDetails) {
		for (const round of div.rounds ?? []) {
			const hit = round.matches.find((m) => m.matchId === matchId);
			if (hit) return hit;
		}
		for (const match of div.roundRobinMatches ?? []) {
			if (match.matchId === matchId) return match;
		}
	}
	return null;
}

describe('PSL Saturday overrides apply on read / deploy while R2 is blocked', () => {
	it('publishes M60+8, M50+4, and MBD3 Court 2 from scripts/match-result-overrides.json', () => {
		const bundled = getBundledResults('port-st-lucie-open');
		const m608 = bundled.divisions['mens-age-60']?.['M60+8'];
		assert.equal(m608?.player1, 'Val Peco');
		assert.equal(m608?.player2, 'John Wuchte');
		assert.equal(m608?.winner, 1);
		assert.equal(m608?.score, '15-1, 15-2');
		assert.equal(m608?.court, 'Court 3');
		assert.equal(m608?.scheduledTime, 'Saturday · 2:00 PM');

		const m504 = bundled.divisions['mens-age-50']?.['M50+4'];
		assert.equal(m504?.player1, 'Tyson Peco');
		assert.equal(m504?.player2, 'Ben Kniesly');
		assert.equal(m504?.winner, 1);
		assert.equal(m504?.score, '15-4, 15-1');
		assert.equal(m504?.court, 'Court 1');

		const mbd3 = bundled.divisions['mens-doubles-b']?.MBD3;
		assert.equal(mbd3?.court, 'Court 2');
		assert.equal(mbd3?.winner, undefined);
		assert.equal(mbd3?.scheduledTime, 'Saturday · 2:00 PM');

		const mcsd6 = bundled.divisions['mens-doubles-centurion']?.MCSD6;
		assert.equal(mcsd6?.score, 'WBF - No Show');
		assert.equal(mcsd6?.winner, undefined);
		assert.equal(mcsd6?.court, undefined);
	});

	it('build/deploy EVENTS overlay shows the same results without a successful sync', () => {
		const m608 = findPslMatch('M60+8');
		assert.equal(m608 && 'player1' in m608 ? m608.player1 : undefined, 'Val Peco');
		assert.equal(m608 && 'player2' in m608 ? m608.player2 : undefined, 'John Wuchte');
		assert.equal(m608?.winner, 1);
		assert.equal(m608?.score, '15-1, 15-2');
		assert.equal(m608?.court, 'Court 3');
		assert.equal(m608?.scheduledTime, 'Saturday · 2:00 PM');

		const m504 = findPslMatch('M50+4');
		assert.equal(m504 && 'player1' in m504 ? m504.player1 : undefined, 'Tyson Peco');
		assert.equal(m504 && 'player2' in m504 ? m504.player2 : undefined, 'Ben Kniesly');
		assert.equal(m504?.winner, 1);
		assert.equal(m504?.score, '15-4, 15-1');
		assert.equal(m504?.court, 'Court 1');
		assert.equal(m504?.scheduledTime, 'Saturday · 2:00 PM');

		const mbd3 = findPslMatch('MBD3');
		assert.equal(mbd3?.court, 'Court 2');
		assert.equal(mbd3?.winner, undefined);

		const mcsd6 = findPslMatch('MCSD6');
		assert.equal(mcsd6?.score, 'WBF - No Show');
		assert.equal(mcsd6?.winner, undefined);
		assert.equal(mcsd6?.court, undefined);
	});

	it('applies unread overrides onto last-good blob data when the cron is skipped', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-24T18:10:00.000Z',
				divisions: {
					'mens-age-60': {
						'M60+8': {
							player1: 'Val Peco',
							player2: 'John Wuchte',
							scheduledTime: 'Saturday · 2:00 PM',
						},
					},
					'mens-doubles-b': {
						MBD3: {
							player1: 'Paul Sotolongo / Mark Manzano',
							player2: 'Steve Disalvo / Kyle Artman',
							court: 'Court 1',
							scheduledTime: 'Saturday · 2:00 PM',
						},
					},
					'mens-doubles-centurion': {
						MCSD6: {
							player1: 'Dirk Huck / John Joseph',
							player2: 'Jack McDonald / Yelandi Rivero',
							court: 'Court 4',
							scheduledTime: 'Saturday · 2:00 PM',
						},
					},
				},
			},
			'2026-10-24T18:20:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-age-60']?.['M60+8']?.winner, 1);
		assert.equal(results.divisions['mens-age-60']?.['M60+8']?.court, 'Court 3');
		assert.equal(results.divisions['mens-age-60']?.['M60+8']?.scheduledTime, 'Saturday · 2:00 PM');
		assert.equal(results.divisions['mens-age-50']?.['M50+4']?.winner, 1);
		assert.equal(results.divisions['mens-age-50']?.['M50+4']?.player2, 'Ben Kniesly');
		assert.equal(results.divisions['mens-doubles-b']?.MBD3?.court, 'Court 2');
		assert.equal(results.divisions['mens-doubles-b']?.MBD3?.winner, undefined);
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD6?.score, 'WBF - No Show');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD6?.winner, undefined);
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD6?.court, undefined);
	});
});

describe('overrides yield to a later confirmed R2 fetch', () => {
	it('yields when winner, score, or court disagree, including a blank non-final court', () => {
		const patch = { winner: 1 as const, score: '15-1, 15-2', court: 'Court 3' };
		assert.equal(overrideYieldsToR2(patch, { ...patch, player1: 'A', player2: 'B' }, true), false);
		assert.equal(overrideYieldsToR2(patch, { player1: 'A', player2: 'B', winner: 2, score: '15-1, 15-2' }, true), true);
		assert.equal(overrideYieldsToR2(patch, { player1: 'A', player2: 'B', winner: 1, score: '15-8, 15-7' }, true), true);
		assert.equal(overrideYieldsToR2({ court: 'Court 2' }, { player1: 'A', player2: 'B', court: 'Court 3' }, false), true);
		assert.equal(overrideYieldsToR2({ court: 'Court 2' }, { player1: 'A', player2: 'B' }, false), true);
		assert.equal(overrideYieldsToR2({ court: 'Court 2' }, { player1: 'A', player2: 'B' }, true), false);
		assert.equal(
			overrideYieldsToR2(
				{ score: 'WBF - No Show', court: '' },
				{ player1: 'A', player2: 'B', court: 'Court 3' },
				false,
			),
			true,
		);
		assert.equal(
			overrideYieldsToR2({ score: 'WBF - No Show', court: '' }, { player1: 'A', player2: 'B', score: 'WBF - No Show' }, false),
			false,
		);
	});

	it('skips a superseded override so a later real R2 update is not overwritten', () => {
		const divisions = applyMatchOverrides(
			'port-st-lucie-open',
			{
				'mens-doubles-b': {
					MBD3: {
						player1: 'Paul Sotolongo / Mark Manzano',
						player2: 'Steve Disalvo / Kyle Artman',
						court: 'Court 4',
						scheduledTime: 'Saturday · 2:00 PM',
					},
				},
			},
			['mens-doubles-b:MBD3'],
		);
		assert.equal(divisions['mens-doubles-b']?.MBD3?.court, 'Court 4');
	});

	it('marks an override superseded once a confirmed r2-push disagrees', () => {
		const confirmed = {
			'mens-doubles-b': {
				MBD3: {
					player1: 'Paul Sotolongo / Mark Manzano',
					player2: 'Steve Disalvo / Kyle Artman',
					court: 'Court 4',
					scheduledTime: 'Saturday · 2:00 PM',
				},
			},
		};
		const keys = collectSupersededOverrides('port-st-lucie-open', confirmed);
		assert.ok(keys.includes('mens-doubles-b:MBD3'));

		const merged = mergeScrapedResults(
			LIVE_EVENTS.psl,
			{
				lastUpdated: '2026-10-24T18:10:00.000Z',
				divisions: {
					'mens-doubles-b': {
						MBD3: {
							player1: 'Paul Sotolongo / Mark Manzano',
							player2: 'Steve Disalvo / Kyle Artman',
							court: 'Court 2',
							scheduledTime: 'Saturday · 2:00 PM',
						},
					},
				},
			},
			{
				scraped: 1,
				matchesWithResults: 0,
				divisions: confirmed,
				divisionReports: [],
				errors: [],
				quarantined: [],
				resolvedMatchIds: ['MBD3'],
				confirmedMatchIds: ['MBD3'],
				audit: [],
			},
			{ lastUpdated: null, eventSlug: 'port-st-lucie-open', events: [] },
			'2026-10-24T19:00:00.000Z',
		);
		assert.ok(merged.results.supersededOverrides?.includes('mens-doubles-b:MBD3'));
		assert.equal(merged.results.divisions['mens-doubles-b']?.MBD3?.court, 'Court 4');
	});

	it('keeps the override when a confirmed r2-push still matches it', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-age-60': {
				'M60+8': {
					player1: 'Val Peco',
					player2: 'John Wuchte',
					winner: 1,
					score: '15-1, 15-2',
					court: 'Court 3',
				},
			},
		});
		assert.equal(keys.includes('mens-age-60:M60+8'), false);
	});
});

describe('EVENTS overlay keeps Saturday scheduled times from the site', () => {
	it('does not let the M60+8 override wipe Saturday · 2:00 PM', () => {
		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-age-60': {
				'M60+8': {
					player1: 'Val Peco',
					player2: 'John Wuchte',
					winner: 1,
					score: '15-1, 15-2',
					court: 'Court 3',
				},
			},
		});
		const live = event.divisionDetails
			.find((d) => d.id === 'mens-age-60')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'M60+8');
		assert.equal(live?.scheduledTime, 'Saturday · 2:00 PM');
		assert.equal(live?.court, 'Court 3');
		assert.equal(live?.winner, 1);
	});
});
