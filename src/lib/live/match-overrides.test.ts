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
		assert.equal(mbd3?.winner, 2);
		assert.equal(mbd3?.score, '15-1, 15-12');
		assert.equal(mbd3?.scheduledTime, 'Saturday · 2:00 PM');

		const mcsd6 = bundled.divisions['mens-doubles-centurion']?.MCSD6;
		assert.equal(mcsd6?.score, '15-7, 15-13');
		assert.equal(mcsd6?.winner, 1);

		const mb8 = bundled.divisions['mens-singles-b']?.MB8;
		assert.equal(mb8?.player1, 'Scott Gill');
		assert.equal(mb8?.player2, 'Elijah Saunders');
		assert.equal(mb8?.winner, 2);
		assert.equal(mb8?.score, '15-5, 15-14');
		assert.equal(mb8?.court, 'Court 1');
		assert.equal(mb8?.scheduledTime, 'Saturday · 1:00 PM');

		const mb4 = bundled.divisions['mens-singles-b']?.MB4;
		assert.equal(mb4?.player1, 'Elijah Saunders');
		assert.equal(mb4?.player2, 'Daniel Bray');
		assert.equal(mb4?.winner, undefined);
		assert.equal(mb4?.court, 'Court 2');
		assert.equal(mb4?.scheduledTime, 'Sunday · 8:00 AM');

		const mbd1 = bundled.divisions['mens-doubles-b']?.MBD1;
		assert.equal(mbd1?.player1, 'Ryan Appleby / Matt Kern');
		assert.equal(mbd1?.player2, 'Paul Sotolongo / Mark Manzano');
		assert.equal(mbd1?.winner, 1);
		assert.equal(mbd1?.score, '15-3, 15-7');
		assert.equal(mbd1?.court, 'Court 2');
		assert.equal(bundled.divisions['mens-singles-b']?.MB7?.court, 'Court 1');
		assert.equal(bundled.divisions['mens-age-3040']?.M30405?.court, 'Court 2');
		assert.equal(bundled.divisions['mens-doubles-centurion']?.MCSD6?.court, 'Court 4');

		const m604 = bundled.divisions['mens-age-60']?.['M60+4'];
		assert.equal(m604?.player1, 'Val Peco');
		assert.equal(m604?.player2, 'Mike Boyar');
		assert.equal(m604?.winner, 1);
		assert.equal(m604?.score, '15-6, 15-2');
		assert.equal(m604?.court, 'Court 4');
		assert.equal(m604?.scheduledTime, 'Sunday · 10:00 AM');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+3']?.court, 'Court 4');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+3']?.player1, 'Dirk Huck');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+3']?.player2, 'Charles Cole');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+3']?.winner, undefined);
		assert.equal(bundled.divisions['mens-age-60']?.['M60+1']?.player1, 'Val Peco');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+1']?.court, 'Court 2');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+1']?.scheduledTime, 'Sunday · 4:00 PM');

		const mb3 = bundled.divisions['mens-singles-b']?.MB3;
		assert.equal(mb3?.player1, 'Kyle Artman');
		assert.equal(mb3?.player2, 'Matt Kern');
		assert.equal(mb3?.winner, 2);
		assert.equal(mb3?.score, '15-7, 15-11');
		assert.equal(mb3?.court, 'Court 3');
		assert.equal(mb3?.scheduledTime, 'Sunday · 9:00 AM');
		const mb1 = bundled.divisions['mens-singles-b']?.MB1;
		assert.equal(mb1?.player1, 'Matt Kern');
		assert.equal(mb1?.player2, 'Elijah Saunders');
		assert.equal(mb1?.winner, undefined);
		assert.equal(mb1?.court, 'Court 2');
		assert.equal(mb1?.scheduledTime, 'Sunday · 3:00 PM');
		const mcsd3 = bundled.divisions['mens-doubles-centurion']?.MCSD3;
		assert.equal(mcsd3?.player1, 'Dirk Huck / John Joseph');
		assert.equal(mcsd3?.player2, 'Val Peco / Tyson Peco');
		assert.equal(mcsd3?.winner, 2);
		assert.equal(mcsd3?.score, '15-5, 15-3');
		assert.equal(mcsd3?.court, 'Court 1');
		assert.equal(mcsd3?.scheduledTime, 'Sunday · 8:00 AM');
		const mcsd4 = bundled.divisions['mens-doubles-centurion']?.MCSD4;
		assert.equal(mcsd4?.player1, 'Tony Gutierrez / Gene Fry');
		assert.equal(mcsd4?.player2, 'Mike Bock / Terry Money');
		assert.equal(mcsd4?.winner, 2);
		assert.equal(mcsd4?.score, '15-1, 15-7');
		assert.equal(mcsd4?.court, 'Court 2');
		assert.equal(mcsd4?.scheduledTime, 'Sunday · 9:00 AM');
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
		assert.equal(mbd3?.winner, 2);
		assert.equal(mbd3?.score, '15-1, 15-12');

		const mcsd6 = findPslMatch('MCSD6');
		assert.equal(mcsd6?.score, '15-7, 15-13');
		assert.equal(mcsd6?.winner, 1);

		const mb8 = findPslMatch('MB8');
		assert.equal(mb8 && 'player1' in mb8 ? mb8.player1 : undefined, 'Scott Gill');
		assert.equal(mb8 && 'player2' in mb8 ? mb8.player2 : undefined, 'Elijah Saunders');
		assert.equal(mb8?.winner, 2);
		assert.equal(mb8?.score, '15-5, 15-14');
		assert.equal(mb8?.court, 'Court 1');
		assert.equal(mb8?.scheduledTime, 'Saturday · 1:00 PM');

		const mb4 = findPslMatch('MB4');
		assert.equal(mb4 && 'player1' in mb4 ? mb4.player1 : undefined, 'Elijah Saunders');
		assert.equal(mb4 && 'player2' in mb4 ? mb4.player2 : undefined, 'Daniel Bray');
		assert.equal(mb4?.winner, undefined);
		assert.equal(mb4?.court, 'Court 2');
		assert.equal(mb4?.scheduledTime, 'Sunday · 8:00 AM');

		const mbd1 = findPslMatch('MBD1');
		assert.ok(mbd1);
		assert.equal(mbd1.winner, 1);
		assert.equal(mbd1.score, '15-3, 15-7');

		const m604 = findPslMatch('M60+4');
		assert.equal(m604 && 'player1' in m604 ? m604.player1 : undefined, 'Val Peco');
		assert.equal(m604 && 'player2' in m604 ? m604.player2 : undefined, 'Mike Boyar');
		assert.equal(m604?.winner, 1);
		assert.equal(m604?.score, '15-6, 15-2');
		const m603 = findPslMatch('M60+3');
		assert.equal(m603?.court, 'Court 4');
		assert.equal(m603?.winner, undefined);
		const m601 = findPslMatch('M60+1');
		assert.equal(m601 && 'player1' in m601 ? m601.player1 : undefined, 'Val Peco');
		assert.equal(m601 && 'player2' in m601 ? m601.player2 : undefined, 'TBD');
		assert.equal(m601?.court, 'Court 2');
		assert.equal(m601?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(m601?.winner, undefined);

		const mb3 = findPslMatch('MB3');
		assert.equal(mb3 && 'player1' in mb3 ? mb3.player1 : undefined, 'Kyle Artman');
		assert.equal(mb3 && 'player2' in mb3 ? mb3.player2 : undefined, 'Matt Kern');
		assert.equal(mb3?.winner, 2);
		assert.equal(mb3?.score, '15-7, 15-11');
		assert.equal(mb3?.court, 'Court 3');
		const mb1 = findPslMatch('MB1');
		assert.equal(mb1 && 'player1' in mb1 ? mb1.player1 : undefined, 'Matt Kern');
		assert.equal(mb1 && 'player2' in mb1 ? mb1.player2 : undefined, 'Elijah Saunders');
		assert.equal(mb1?.court, 'Court 2');
		assert.equal(mb1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(mb1?.winner, undefined);
		const mcsd3 = findPslMatch('MCSD3');
		assert.equal(mcsd3?.winner, 2);
		assert.equal(mcsd3?.score, '15-5, 15-3');
		assert.equal(mcsd3?.court, 'Court 1');
		const mcsd4 = findPslMatch('MCSD4');
		assert.equal(mcsd4 && 'player2' in mcsd4 ? mcsd4.player2 : undefined, 'Mike Bock / Terry Money');
		assert.equal(mcsd4?.winner, 2);
		assert.equal(mcsd4?.score, '15-1, 15-7');
		assert.equal(mcsd4?.court, 'Court 2');
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
		assert.equal(results.divisions['mens-doubles-b']?.MBD3?.winner, 2);
		assert.equal(results.divisions['mens-doubles-b']?.MBD3?.score, '15-1, 15-12');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD6?.score, '15-7, 15-13');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD6?.winner, 1);
	});

	it('publishes MB8 Saunders and MB4 pairing onto last-good blob data while blocked', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-24T18:40:00.000Z',
				divisions: {
					'mens-singles-b': {
						MB8: {
							player1: 'Scott Gill',
							player2: 'Elijah Saunders',
							court: 'Court 1',
							scheduledTime: 'Saturday · 1:00 PM',
						},
						MB4: {
							scheduledTime: 'Sunday · 8:00 AM',
							court: 'Court 2',
						},
					},
				},
			},
			'2026-10-24T23:00:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-singles-b']?.MB8?.winner, 2);
		assert.equal(results.divisions['mens-singles-b']?.MB8?.player2, 'Elijah Saunders');
		assert.equal(results.divisions['mens-singles-b']?.MB8?.score, '15-5, 15-14');
		assert.equal(results.divisions['mens-singles-b']?.MB8?.court, 'Court 1');
		assert.equal(results.divisions['mens-singles-b']?.MB8?.scheduledTime, 'Saturday · 1:00 PM');
		assert.equal(results.divisions['mens-singles-b']?.MB4?.player1, 'Elijah Saunders');
		assert.equal(results.divisions['mens-singles-b']?.MB4?.player2, 'Daniel Bray');
		assert.equal(results.divisions['mens-singles-b']?.MB4?.winner, undefined);
		assert.equal(results.divisions['mens-singles-b']?.MB4?.court, 'Court 2');
		assert.equal(results.divisions['mens-singles-b']?.MB4?.scheduledTime, 'Sunday · 8:00 AM');
	});

	it('publishes M60+4 Peco and M60+3 Court 4 onto last-good blob data while blocked', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T14:20:00.000Z',
				divisions: {
					'mens-age-60': {
						'M60+4': {
							player1: 'Val Peco',
							player2: 'Mike Boyar',
							court: 'Court 1',
							scheduledTime: 'Sunday · 10:00 AM',
						},
						'M60+3': {
							player1: 'Dirk Huck',
							player2: 'Charles Cole',
							court: 'Court 3',
							scheduledTime: 'Sunday · 11:00 AM',
						},
					},
				},
			},
			'2026-10-25T14:50:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-age-60']?.['M60+4']?.winner, 1);
		assert.equal(results.divisions['mens-age-60']?.['M60+4']?.score, '15-6, 15-2');
		assert.equal(results.divisions['mens-age-60']?.['M60+4']?.player1, 'Val Peco');
		assert.equal(results.divisions['mens-age-60']?.['M60+4']?.court, 'Court 4');
		assert.equal(results.divisions['mens-age-60']?.['M60+3']?.court, 'Court 4');
		assert.equal(results.divisions['mens-age-60']?.['M60+3']?.winner, undefined);
		assert.equal(results.divisions['mens-age-60']?.['M60+1']?.player1, 'Val Peco');
		assert.equal(results.divisions['mens-age-60']?.['M60+1']?.court, 'Court 2');
		assert.equal(results.divisions['mens-age-60']?.['M60+1']?.scheduledTime, 'Sunday · 4:00 PM');
	});

	it('publishes MB3, MCSD3, MCSD4, and the MB1 pairing onto last-good blob data', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T15:10:00.000Z',
				divisions: {
					'mens-singles-b': {
						MB3: {
							player1: 'Kyle Artman',
							player2: 'Matt Kern',
							court: 'Court 3',
							scheduledTime: 'Sunday · 9:00 AM',
						},
						MB4: {
							player1: 'Elijah Saunders',
							player2: 'Daniel Bray',
							winner: 1,
							score: '15-6, 13-15, 11-5',
							court: 'Court 3',
							scheduledTime: 'Sunday · 8:00 AM',
						},
					},
					'mens-doubles-centurion': {
						MCSD3: {
							player1: 'Dirk Huck / John Joseph',
							player2: 'Val Peco / Tyson Peco',
							court: 'Court 1',
							scheduledTime: 'Sunday · 8:00 AM',
						},
						MCSD4: {
							player1: 'Tony Gutierrez / Gene Fry',
							player2: 'Mike Bock / Terry Money',
							court: 'Court 2',
							scheduledTime: 'Sunday · 9:00 AM',
						},
					},
				},
			},
			'2026-10-25T15:20:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-singles-b']?.MB3?.winner, 2);
		assert.equal(results.divisions['mens-singles-b']?.MB3?.score, '15-7, 15-11');
		assert.equal(results.divisions['mens-singles-b']?.MB3?.player2, 'Matt Kern');
		assert.equal(results.divisions['mens-singles-b']?.MB1?.player1, 'Matt Kern');
		assert.equal(results.divisions['mens-singles-b']?.MB1?.player2, 'Elijah Saunders');
		assert.equal(results.divisions['mens-singles-b']?.MB1?.court, 'Court 2');
		assert.equal(results.divisions['mens-singles-b']?.MB1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD3?.winner, 2);
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD3?.score, '15-5, 15-3');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD3?.court, 'Court 1');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD4?.winner, 2);
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD4?.score, '15-1, 15-7');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD4?.player2, 'Mike Bock / Terry Money');
		assert.equal(results.divisions['mens-doubles-centurion']?.MCSD4?.court, 'Court 2');
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
			'mens-singles-b': {
				MB8: {
					player1: 'Scott Gill',
					player2: 'Elijah Saunders',
					winner: 2,
					score: '15-5, 15-14',
					court: 'Court 1',
				},
			},
		});
		assert.equal(keys.includes('mens-age-60:M60+8'), false);
		assert.equal(keys.includes('mens-singles-b:MB8'), false);
	});

	it('keeps Sunday MB3/MCSD3/MCSD4 overrides when a confirmed r2-push matches them', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-singles-b': {
				MB3: {
					player1: 'Kyle Artman',
					player2: 'Matt Kern',
					winner: 2,
					score: '15-7, 15-11',
					court: 'Court 3',
				},
			},
			'mens-doubles-centurion': {
				MCSD3: {
					player1: 'Dirk Huck / John Joseph',
					player2: 'Val Peco / Tyson Peco',
					winner: 2,
					score: '15-5, 15-3',
					court: 'Court 1',
				},
				MCSD4: {
					player1: 'Tony Gutierrez / Gene Fry',
					player2: 'Mike Bock / Terry Money',
					winner: 2,
					score: '15-1, 15-7',
					court: 'Court 2',
				},
			},
		});
		assert.equal(keys.includes('mens-singles-b:MB3'), false);
		assert.equal(keys.includes('mens-doubles-centurion:MCSD3'), false);
		assert.equal(keys.includes('mens-doubles-centurion:MCSD4'), false);
	});

	it('yields MB8 once a confirmed r2-push names a different winner or score', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-singles-b': {
				MB8: {
					player1: 'Scott Gill',
					player2: 'Elijah Saunders',
					winner: 1,
					score: '15-5, 15-14',
					court: 'Court 1',
				},
			},
		});
		assert.ok(keys.includes('mens-singles-b:MB8'));
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
