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

		const me3 = bundled.divisions['mens-singles-elite']?.ME3;
		assert.equal(me3?.player1, 'Scott Haacke');
		assert.equal(me3?.player2, 'Chris Dermody');
		assert.equal(me3?.winner, 1);
		assert.equal(me3?.score, '7-15, 15-9, 15-3');
		assert.equal(me3?.court, 'Court 1');
		assert.equal(me3?.scheduledTime, 'Sunday · 10:00 AM');
		const me1 = bundled.divisions['mens-singles-elite']?.ME1;
		assert.equal(me1?.player1, 'Isaac Taylor');
		assert.equal(me1?.player2, 'Scott Haacke');
		assert.equal(me1?.winner, undefined);
		assert.equal(me1?.court, 'Court 1');
		assert.equal(me1?.scheduledTime, 'Sunday · 3:00 PM');

		const med4 = bundled.divisions['mens-doubles-elite']?.MED4;
		assert.equal(med4?.player1, 'Samuel Schulze / Brendan Anthony');
		assert.equal(med4?.player2, 'Wade Stubanas / Brian Grantham');
		assert.equal(med4?.winner, 2);
		assert.equal(med4?.score, '15-7, 15-14');
		assert.equal(med4?.court, 'Court 4');
		assert.equal(med4?.scheduledTime, 'Sunday · 12:00 PM');
		const med1 = bundled.divisions['mens-doubles-elite']?.MED1;
		assert.equal(med1?.player1, 'Wade Stubanas / Brian Grantham');
		assert.equal(med1?.player2, undefined);
		assert.equal(med1?.court, 'Court 3');
		assert.equal(med1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(med1?.winner, undefined);
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED3?.winner, undefined);
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED3?.court, 'Court 2');
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED3?.player1, 'Mike Bock / Terry Money');
		assert.equal(bundled.divisions['mens-doubles-elite']?.MED3?.player2, 'Scott Haacke / Bryon Haacke');

		const mad4 = bundled.divisions['mens-doubles-a']?.MAD4;
		assert.equal(mad4?.player1, 'Tony Gutierrez / Gene Fry');
		assert.equal(mad4?.player2, 'Paul Sotolongo / Kyle Artman');
		assert.equal(mad4?.winner, 1);
		assert.equal(mad4?.score, '13-15, 15-4, 11-3');
		assert.equal(mad4?.court, 'Court 3');
		assert.equal(mad4?.scheduledTime, 'Sunday · 11:00 AM');
		const mad1 = bundled.divisions['mens-doubles-a']?.MAD1;
		assert.equal(mad1?.player1, 'Tony Gutierrez / Gene Fry');
		assert.equal(mad1?.player2, 'Troy Ayers / Greg Caruso');
		assert.equal(mad1?.winner, undefined);
		assert.equal(mad1?.court, 'Court 3');
		assert.equal(mad1?.scheduledTime, 'Sunday · 4:00 PM');

		const mo1 = bundled.divisions['mens-singles-open']?.MO1;
		assert.equal(mo1?.player1, 'Annie Sanchez');
		assert.equal(mo1?.player2, 'Naomi Ros');
		assert.equal(mo1?.winner, 1);
		assert.equal(mo1?.score, '15-10, 15-13');
		assert.equal(mo1?.court, 'Court 1');
		assert.equal(mo1?.scheduledTime, 'Sunday · 1:00 PM');
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

		const me3 = findPslMatch('ME3');
		assert.equal(me3 && 'player1' in me3 ? me3.player1 : undefined, 'Scott Haacke');
		assert.equal(me3 && 'player2' in me3 ? me3.player2 : undefined, 'Chris Dermody');
		assert.equal(me3?.winner, 1);
		assert.equal(me3?.score, '7-15, 15-9, 15-3');
		assert.equal(me3?.court, 'Court 1');
		const me1 = findPslMatch('ME1');
		assert.equal(me1 && 'player1' in me1 ? me1.player1 : undefined, 'Isaac Taylor');
		assert.equal(me1 && 'player2' in me1 ? me1.player2 : undefined, 'Scott Haacke');
		assert.equal(me1?.court, 'Court 1');
		assert.equal(me1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(me1?.winner, undefined);

		const med4 = findPslMatch('MED4');
		assert.equal(med4 && 'player1' in med4 ? med4.player1 : undefined, 'Samuel Schulze / Brendan Anthony');
		assert.equal(med4 && 'player2' in med4 ? med4.player2 : undefined, 'Wade Stubanas / Brian Grantham');
		assert.equal(med4?.court, 'Court 4');
		assert.equal(med4?.scheduledTime, 'Sunday · 12:00 PM');
		assert.equal(med4?.winner, 2);
		assert.equal(med4?.score, '15-7, 15-14');
		const med1 = findPslMatch('MED1');
		assert.equal(med1 && 'player1' in med1 ? med1.player1 : undefined, 'Wade Stubanas / Brian Grantham');
		assert.equal(med1 && 'player2' in med1 ? med1.player2 : undefined, 'TBD');
		assert.equal(med1?.court, 'Court 3');
		assert.equal(med1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(med1?.winner, undefined);
		assert.equal(findPslMatch('MED3')?.winner, undefined);
		assert.equal(findPslMatch('MED3')?.court, 'Court 2');

		const mad4 = findPslMatch('MAD4');
		assert.equal(mad4 && 'player1' in mad4 ? mad4.player1 : undefined, 'Tony Gutierrez / Gene Fry');
		assert.equal(mad4 && 'player2' in mad4 ? mad4.player2 : undefined, 'Paul Sotolongo / Kyle Artman');
		assert.equal(mad4?.winner, 1);
		assert.equal(mad4?.score, '13-15, 15-4, 11-3');
		assert.equal(mad4?.court, 'Court 3');
		assert.equal(mad4?.scheduledTime, 'Sunday · 11:00 AM');
		const mad1 = findPslMatch('MAD1');
		assert.equal(mad1 && 'player1' in mad1 ? mad1.player1 : undefined, 'Tony Gutierrez / Gene Fry');
		assert.equal(mad1 && 'player2' in mad1 ? mad1.player2 : undefined, 'Troy Ayers / Greg Caruso');
		assert.equal(mad1?.court, 'Court 3');
		assert.equal(mad1?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(mad1?.winner, undefined);

		const mo1 = findPslMatch('MO1');
		assert.equal(mo1 && 'team1' in mo1 ? mo1.team1 : undefined, 'Annie Sanchez');
		assert.equal(mo1 && 'team2' in mo1 ? mo1.team2 : undefined, 'Naomi Ros');
		assert.equal(mo1?.winner, 1);
		assert.equal(mo1?.score, '15-10, 15-13');
		assert.equal(mo1?.court, 'Court 1');
		assert.equal(mo1?.scheduledTime, 'Sunday · 1:00 PM');
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

	it('publishes ME3 Haacke and the ME1 pairing onto last-good blob data', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T15:40:00.000Z',
				divisions: {
					'mens-singles-elite': {
						ME3: {
							player1: 'Scott Haacke',
							player2: 'Chris Dermody',
							court: 'Court 1',
							scheduledTime: 'Sunday · 10:00 AM',
						},
						ME4: {
							player1: 'Trevor Morgan',
							player2: 'Isaac Taylor',
							winner: 2,
							score: '15-9, 15-10',
							court: 'Court 1',
							scheduledTime: 'Sunday · 9:00 AM',
						},
					},
				},
			},
			'2026-10-25T15:50:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-singles-elite']?.ME3?.winner, 1);
		assert.equal(results.divisions['mens-singles-elite']?.ME3?.score, '7-15, 15-9, 15-3');
		assert.equal(results.divisions['mens-singles-elite']?.ME3?.court, 'Court 1');
		assert.equal(results.divisions['mens-singles-elite']?.ME1?.player1, 'Isaac Taylor');
		assert.equal(results.divisions['mens-singles-elite']?.ME1?.player2, 'Scott Haacke');
		assert.equal(results.divisions['mens-singles-elite']?.ME1?.court, 'Court 1');
		assert.equal(results.divisions['mens-singles-elite']?.ME1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(results.divisions['mens-singles-elite']?.ME1?.winner, undefined);
	});

	it('publishes MED4 Stubanas/Grantham and the MED1 named side onto last-good blob data', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T16:00:00.000Z',
				divisions: {
					'mens-doubles-elite': {
						MED4: {
							player1: 'Samuel Schulze / Brendan Anthony',
							player2: 'Wade Stubanas / Brian Grantham',
							court: 'Court 2',
							scheduledTime: 'Sunday · 12:00 PM',
						},
						MED3: {
							player1: 'Mike Bock / Terry Money',
							player2: 'Scott Haacke / Bryon Haacke',
							court: 'Court 3',
							scheduledTime: 'Sunday · 12:00 PM',
						},
					},
				},
			},
			'2026-10-25T16:45:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-doubles-elite']?.MED4?.winner, 2);
		assert.equal(results.divisions['mens-doubles-elite']?.MED4?.score, '15-7, 15-14');
		assert.equal(results.divisions['mens-doubles-elite']?.MED4?.court, 'Court 4');
		assert.equal(results.divisions['mens-doubles-elite']?.MED4?.player1, 'Samuel Schulze / Brendan Anthony');
		assert.equal(results.divisions['mens-doubles-elite']?.MED4?.player2, 'Wade Stubanas / Brian Grantham');
		assert.equal(results.divisions['mens-doubles-elite']?.MED1?.player1, 'Wade Stubanas / Brian Grantham');
		assert.equal(results.divisions['mens-doubles-elite']?.MED1?.player2, undefined);
		assert.equal(results.divisions['mens-doubles-elite']?.MED1?.court, 'Court 3');
		assert.equal(results.divisions['mens-doubles-elite']?.MED1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(results.divisions['mens-doubles-elite']?.MED1?.winner, undefined);
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.winner, undefined);
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.court, 'Court 2');
	});

	it('publishes the MED3 Court 2 move onto last-good blob data without a result', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T16:45:00.000Z',
				divisions: {
					'mens-doubles-elite': {
						MED3: {
							player1: 'Mike Bock / Terry Money',
							player2: 'Scott Haacke / Bryon Haacke',
							court: 'Court 3',
							scheduledTime: 'Sunday · 12:00 PM',
						},
					},
				},
			},
			'2026-10-25T17:05:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.court, 'Court 2');
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.player1, 'Mike Bock / Terry Money');
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.player2, 'Scott Haacke / Bryon Haacke');
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.winner, undefined);
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.score, undefined);
		assert.equal(results.divisions['mens-doubles-elite']?.MED3?.scheduledTime, 'Sunday · 12:00 PM');
	});

	it('publishes MO1 Sanchez onto last-good blob data', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T16:50:00.000Z',
				divisions: {
					'mens-singles-open': {
						MO1: {
							player1: 'Annie Sanchez',
							player2: 'Naomi Ros',
							court: 'Court 1',
							scheduledTime: 'Sunday · 1:00 PM',
						},
					},
				},
			},
			'2026-10-25T17:15:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-singles-open']?.MO1?.winner, 1);
		assert.equal(results.divisions['mens-singles-open']?.MO1?.score, '15-10, 15-13');
		assert.equal(results.divisions['mens-singles-open']?.MO1?.court, 'Court 1');
		assert.equal(results.divisions['mens-singles-open']?.MO1?.player1, 'Annie Sanchez');
		assert.equal(results.divisions['mens-singles-open']?.MO1?.player2, 'Naomi Ros');
	});

	it('Open RR standings become Sanchez 3-0, Linnell 2-1, Ros 1-2, Steinheiser 0-3', () => {
		const event = applyResultsToEvent(
			PORT_ST_LUCIE_EVENT,
			getBundledResults('port-st-lucie-open').divisions,
		);
		const div = event.divisionDetails.find((d) => d.id === 'mens-singles-open');
		assert.ok(div?.roundRobinMatches);
		const standings = new Map(
			(div.roundRobinPlayers ?? []).map((name) => [name, { name, w: 0, l: 0 }]),
		);
		for (const m of div.roundRobinMatches) {
			if (m.winner !== 1 && m.winner !== 2) continue;
			const winner = m.winner === 1 ? m.team1 : m.team2;
			const loser = m.winner === 1 ? m.team2 : m.team1;
			const ws = standings.get(winner);
			const ls = standings.get(loser);
			if (ws) ws.w++;
			if (ls) ls.l++;
		}
		const ranked = [...standings.values()].sort((a, b) => b.w - a.w || a.l - b.l);
		assert.deepEqual(
			ranked.map((r) => `${r.name} ${r.w}-${r.l}`),
			['Annie Sanchez 3-0', 'Joe Linnell 2-1', 'Naomi Ros 1-2', 'Chris Steinheiser 0-3'],
		);
	});

	it('publishes MAD4 Gutierrez/Fry and the MAD1 pairing onto last-good blob data', () => {
		const { results, changed } = overlayOverridesOnFile(
			'port-st-lucie-open',
			{
				lastUpdated: '2026-10-25T16:15:00.000Z',
				divisions: {
					'mens-doubles-a': {
						MAD4: {
							player1: 'Tony Gutierrez / Gene Fry',
							player2: 'Paul Sotolongo / Kyle Artman',
							court: 'Court 3',
							scheduledTime: 'Sunday · 11:00 AM',
						},
						MAD3: {
							player1: 'Troy Ayers / Greg Caruso',
							player2: 'Wade Stubanas / Timothy Burke',
							winner: 1,
							score: '5-15, 15-14, 11-5',
							court: 'Court 2',
							scheduledTime: 'Sunday · 10:00 AM',
						},
					},
				},
			},
			'2026-10-25T16:40:00.000Z',
		);
		assert.equal(changed, true);
		assert.equal(results.divisions['mens-doubles-a']?.MAD4?.winner, 1);
		assert.equal(results.divisions['mens-doubles-a']?.MAD4?.score, '13-15, 15-4, 11-3');
		assert.equal(results.divisions['mens-doubles-a']?.MAD4?.court, 'Court 3');
		assert.equal(results.divisions['mens-doubles-a']?.MAD4?.player1, 'Tony Gutierrez / Gene Fry');
		assert.equal(results.divisions['mens-doubles-a']?.MAD4?.player2, 'Paul Sotolongo / Kyle Artman');
		assert.equal(results.divisions['mens-doubles-a']?.MAD1?.player1, 'Tony Gutierrez / Gene Fry');
		assert.equal(results.divisions['mens-doubles-a']?.MAD1?.player2, 'Troy Ayers / Greg Caruso');
		assert.equal(results.divisions['mens-doubles-a']?.MAD1?.court, 'Court 3');
		assert.equal(results.divisions['mens-doubles-a']?.MAD1?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(results.divisions['mens-doubles-a']?.MAD1?.winner, undefined);
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

	it('keeps the ME3 override when a confirmed r2-push matches it', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-singles-elite': {
				ME3: {
					player1: 'Scott Haacke',
					player2: 'Chris Dermody',
					winner: 1,
					score: '7-15, 15-9, 15-3',
					court: 'Court 1',
				},
			},
		});
		assert.equal(keys.includes('mens-singles-elite:ME3'), false);
	});

	it('keeps the MAD4 override when a confirmed r2-push matches it', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-doubles-a': {
				MAD4: {
					player1: 'Tony Gutierrez / Gene Fry',
					player2: 'Paul Sotolongo / Kyle Artman',
					winner: 1,
					score: '13-15, 15-4, 11-3',
					court: 'Court 3',
				},
			},
		});
		assert.equal(keys.includes('mens-doubles-a:MAD4'), false);
	});

	it('keeps the MED4 override when a confirmed r2-push matches it', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-doubles-elite': {
				MED4: {
					player1: 'Samuel Schulze / Brendan Anthony',
					player2: 'Wade Stubanas / Brian Grantham',
					winner: 2,
					score: '15-7, 15-14',
					court: 'Court 4',
				},
			},
		});
		assert.equal(keys.includes('mens-doubles-elite:MED4'), false);
	});

	it('keeps the MED3 Court 2 override when a confirmed r2-push matches it', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-doubles-elite': {
				MED3: {
					player1: 'Mike Bock / Terry Money',
					player2: 'Scott Haacke / Bryon Haacke',
					court: 'Court 2',
					scheduledTime: 'Sunday · 12:00 PM',
				},
			},
		});
		assert.equal(keys.includes('mens-doubles-elite:MED3'), false);
	});

	it('keeps the MO1 override when a confirmed r2-push matches it', () => {
		const keys = collectSupersededOverrides('port-st-lucie-open', {
			'mens-singles-open': {
				MO1: {
					player1: 'Annie Sanchez',
					player2: 'Naomi Ros',
					winner: 1,
					score: '15-10, 15-13',
					court: 'Court 1',
				},
			},
		});
		assert.equal(keys.includes('mens-singles-open:MO1'), false);
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
