import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyResultsToEvent } from '../../data/events';
import { PORT_ST_LUCIE_EVENT } from '../../data/port-st-lucie-event';
import { LIVE_EVENTS } from './config';
import { describeBadMatchHtml, htmlLooksLikeMatchPage, parseMatchPage, winnerNameFromHtml } from './parse-match-page';
import { extractRoundRobinFromHtml, extractScore, extractSingleElimFromHtml } from './parse-r2';
import { ownDrawFinal, resolveMatchResult } from './resolve-results';
import {
	applyActivityUpdates,
	applyMatchOverrides,
	BROWSER_HEADERS,
	detectActivityChanges,
	dropPublishedQuarantine,
	isRetryableStatus,
	mergeOneMatch,
	mergeScrapedResults,
	USER_AGENT,
} from './scrape';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => readFileSync(resolve(fixtures, name), 'utf-8');

const mbDraw = extractSingleElimFromHtml(read('psl-mb-draw.html'));
const mbdDraw = extractRoundRobinFromHtml(read('psl-mbd-draw.html'));
const medDraw = extractSingleElimFromHtml(read('psl-med-draw.html'));
const mcsdDraw = extractSingleElimFromHtml(read('psl-mcsd-draw.html'));
const m60Draw = extractSingleElimFromHtml(read('psl-m60-draw.html'));
const mb10Page = parseMatchPage(read('psl-mb10-match.html'));
const mb9Page = parseMatchPage(read('psl-mb9-match.html'));
const mbd4Page = parseMatchPage(read('psl-mbd4-match.html'));
const med10Page = parseMatchPage(read('psl-med10-match.html'));
const mcsd6Page = parseMatchPage(read('psl-mcsd6-match.html'));
const m605Page = parseMatchPage(read('psl-m605-match.html'));
const m607Page = parseMatchPage(read('psl-m607-match.html'));
const m609Page = parseMatchPage(read('psl-m609-match.html'));
const med11Page = parseMatchPage(read('psl-med11-match.html'));
const mbd5Page = parseMatchPage(read('psl-mbd5-match.html'));
const m609Html = read('psl-m609-match.html');
const med11Html = read('psl-med11-match.html');
const med10Html = read('psl-med10-match.html');
const mbd5Html = read('psl-mbd5-match.html');
const m605Html = read('psl-m605-match.html');
const m607Html = read('psl-m607-match.html');

function courtless(draw: (typeof m60Draw.matches)[string]) {
	const { court: _c, scheduledTime: _t, ...rest } = draw;
	return rest;
}

function resolveCode(draw: ReturnType<typeof extractSingleElimFromHtml>, matchId: string, page: ReturnType<typeof parseMatchPage>) {
	const parsed = draw.matches[matchId];
	assert.ok(parsed, `missing ${matchId} on draw`);
	return resolveMatchResult({
		matchId,
		draw: parsed,
		page,
		advancements: draw.advancements,
	});
}

describe('R2 explicit match-page winners', () => {
	it('MB10: Ben Mordkovich def Ann Brandt 15-13, 15-13', () => {
		const { record, quarantine } = resolveCode(mbDraw, 'MB10', mb10Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.player1, 'Ben Mordkovich');
		assert.equal(record.player2, 'Ann Brandt');
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-13, 15-13');
	});

	it('MB9: Elijah Saunders def Mark Manzano 15-9, 15-10', () => {
		const { record, quarantine } = resolveCode(mbDraw, 'MB9', mb9Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.match(record.player1 ?? '', /Saunders/);
		assert.match(record.player2 ?? '', /Manzano/);
		assert.equal(record.score, '15-9, 15-10');
	});

	it('MBD4: Appleby/Kern def Estepan/Bray 15-4, 15-9', () => {
		const { record, quarantine } = resolveCode(mbdDraw, 'MBD4', mbd4Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.match(record.player1 ?? '', /Appleby/);
		assert.match(record.player1 ?? '', /Kern/);
		assert.match(record.player2 ?? '', /Estepan/);
		assert.equal(record.score, '15-4, 15-9');
	});

	it('MED10: Huck/Joseph no-show win', () => {
		const { record, quarantine } = resolveCode(medDraw, 'MED10', med10Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.match(record.player1 ?? '', /Huck/);
		assert.match(record.score ?? '', /No Show/i);
	});

	it('flipped player order still orients the score to the match-page winner', () => {
		const orig = mbDraw.matches.MB10!;
		const draw = {
			...orig,
			player1: 'Ann Brandt',
			player2: 'Ben Mordkovich',
			drawWinner: undefined,
		};
		const { record, quarantine } = resolveMatchResult({
			matchId: 'MB10',
			draw,
			page: mb10Page,
			advancements: mbDraw.advancements,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 2);
		assert.equal(record.player1, 'Ann Brandt');
		assert.equal(record.player2, 'Ben Mordkovich');
		assert.equal(record.score, '15-13, 15-13');
	});
});

describe('score without a winner stays undecided', () => {
	it("MCSD6 WBF - No Show does not publish a winner", () => {
		const { record, quarantine } = resolveCode(mcsdDraw, 'MCSD6', mcsd6Page);
		assert.equal(record.winner, undefined);
		assert.equal(quarantine, undefined);
		assert.match(record.score ?? '', /No Show/i);
	});

	it('keeps MCSD6 score on the event and clears the court when live has no winner and no court', () => {
		const staticMcsd6 = PORT_ST_LUCIE_EVENT.divisionDetails
			.find((d) => d.id === 'mens-doubles-centurion')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'MCSD6');
		assert.equal(staticMcsd6?.court, 'Court 4');
		assert.equal(staticMcsd6?.score, undefined);

		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-doubles-centurion': {
				MCSD6: {
					player1: 'Dirk Huck / John Joseph',
					player2: 'Jack McDonald / Yelandi Rivero',
					score: 'WBF - No Show',
					scheduledTime: 'Saturday · 2:00 PM',
				},
			},
		});
		const live = event.divisionDetails
			.find((d) => d.id === 'mens-doubles-centurion')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'MCSD6');
		assert.equal(live?.score, 'WBF - No Show');
		assert.equal(live?.winner, undefined);
		assert.equal(live?.court, undefined);
		assert.equal(live?.scheduledTime, 'Saturday · 2:00 PM');
	});
});

describe('courts and times from R2 override static event data', () => {
	it('M60+9 / M60+5 / M60+7 and MBD4 courts match R2, not the stale site values', () => {
		const staticMatch = (id: string) =>
			PORT_ST_LUCIE_EVENT.divisionDetails
				.flatMap((d) => [
					...(d.rounds?.flatMap((r) => r.matches) ?? []),
					...(d.roundRobinMatches ?? []),
				])
				.find((m) => m.matchId === id);
		assert.equal(staticMatch('M60+9')?.court, 'Court 3');
		assert.equal(staticMatch('M60+5')?.court, 'Court 4');
		assert.equal(staticMatch('M60+7')?.court, 'Court 1');
		assert.equal(staticMatch('MBD4')?.court, 'Court 3');

		const m609 = resolveMatchResult({ matchId: 'M60+9', draw: m60Draw.matches['M60+9']! });
		const m605 = resolveMatchResult({ matchId: 'M60+5', draw: m60Draw.matches['M60+5']!, page: m605Page });
		const m607 = resolveMatchResult({ matchId: 'M60+7', draw: m60Draw.matches['M60+7']!, page: m607Page });
		const mbd4 = resolveMatchResult({
			matchId: 'MBD4',
			draw: mbdDraw.matches.MBD4!,
			page: mbd4Page,
		});
		assert.equal(m609.record.court, 'Court 1');
		assert.equal(m605.record.court, 'Court 2');
		assert.equal(m607.record.court, 'Court 3');
		assert.equal(mbd4.record.court, 'Court 4');
		assert.equal(mbd4.record.scheduledTime, 'Friday · 4:30 PM');

		const courtOnly = (r: typeof m605.record) => ({
			player1: r.player1,
			player2: r.player2,
			court: r.court,
			scheduledTime: r.scheduledTime,
		});
		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-age-60': {
				'M60+9': m609.record,
				'M60+5': courtOnly(m605.record),
				'M60+7': courtOnly(m607.record),
			},
			'mens-doubles-b': { MBD4: mbd4.record },
		});
		const m60 = event.divisionDetails.find((d) => d.id === 'mens-age-60');
		const mbd = event.divisionDetails.find((d) => d.id === 'mens-doubles-b');
		const find = (div = m60, id: string) =>
			div?.rounds?.flatMap((r) => r.matches).find((m) => m.matchId === id) ??
			div?.roundRobinMatches?.find((m) => m.matchId === id);

		assert.equal(find(m60, 'M60+9')?.court, 'Court 1');
		assert.equal(find(m60, 'M60+5')?.court, 'Court 2');
		assert.equal(find(m60, 'M60+7')?.court, 'Court 3');
		assert.equal(find(mbd, 'MBD4')?.court, 'Court 4');
		assert.notEqual(find(m60, 'M60+9')?.court, 'Court 3');
		assert.notEqual(find(mbd, 'MBD4')?.court, 'Court 3');

		const profileCourt = (name: string, division: string) =>
			event.profiles.find((p) => p.name === name && p.division === division)?.note;
		assert.equal(profileCourt('John Wuchte', "Men's Age Singles: 60+"), 'Court 1');
		assert.equal(profileCourt('Scott Gill', "Men's Age Singles: 60+"), 'Court 2');
		assert.equal(profileCourt('Jim Russell', "Men's Age Singles: 60+"), 'Court 3');
	});
});

describe('disagreement is quarantined, not published', () => {
	it('holds the result when the match page winner disagrees with the draw box', () => {
		const flippedPage = { ...mb10Page, winnerName: 'Ann Brandt' };
		const { record, quarantine } = resolveCode(mbDraw, 'MB10', flippedPage);
		assert.ok(quarantine);
		assert.match(quarantine.reason, /disagree/i);
		assert.equal(record.winner, undefined);
	});
});

describe('activity corrections replace the old feed entry', () => {
	it('removes Ann def Ben and writes a Correction for Ben def Ann', () => {
		const event = LIVE_EVENTS.psl;
		const prev = {
			'mens-singles-b': {
				MB10: { player1: 'Ben Mordkovich', player2: 'Ann Brandt', winner: 2 as const, score: '15-13, 15-13' },
			},
		};
		const next = {
			'mens-singles-b': {
				MB10: { player1: 'Ben Mordkovich', player2: 'Ann Brandt', winner: 1 as const, score: '15-13, 15-13' },
			},
		};
		const at = '2026-10-23T21:15:00.000Z';
		const { events, retractMatchIds } = detectActivityChanges(event, prev, next, at);
		assert.deepEqual(retractMatchIds, ['MB10']);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.correction, true);
		assert.match(events[0]?.headline ?? '', /Correction: Ben Mordkovich def Ann Brandt/);

		const feed = applyActivityUpdates(
			{
				lastUpdated: '2026-10-23T21:10:00.000Z',
				eventSlug: event.slug,
				events: [
					{
						id: 'old-mb10',
						at: '2026-10-23T21:10:00.000Z',
						type: 'result',
						divisionId: 'mens-singles-b',
						divisionLabel: "Men's Singles: B",
						matchId: 'MB10',
						headline: 'Ann Brandt def Ben Mordkovich',
						detail: '15-13,15-13',
						bracketHref: '/events/port-st-lucie-open/divisions/mens-singles-b',
					},
				],
			},
			event.slug,
			events,
			retractMatchIds,
			at,
		);
		assert.equal(feed.events.length, 1);
		assert.equal(feed.events[0]?.id, events[0]?.id);
		assert.doesNotMatch(feed.events.map((e) => e.headline).join('\n'), /Ann Brandt def Ben Mordkovich/);
	});
});

describe('match-result-overrides still win', () => {
	it('applies scripts/match-result-overrides.json on top of a resolved match', () => {
		const divisions = applyMatchOverrides('ocala-open', {
			'mens-singles-open': {
				MO9: { player1: 'A', player2: 'B', winner: 1, score: '15-1, 15-1' },
			},
		});
		assert.equal(divisions['mens-singles-open']?.MO9?.winner, 2);
		assert.equal(divisions['mens-singles-open']?.MO9?.score, '15-4, 2-15, 11-3');
	});

	it('publishes confirmed PSL MBD4 / M60+5 / M60+7 overrides', () => {
		const divisions = applyMatchOverrides('port-st-lucie-open', {
			'mens-doubles-b': {
				MBD4: { player1: 'Ryan Appleby / Matt Kern', player2: 'Jonathan Estepan / Daniel Bray' },
				MBD5: { player1: 'Paul Sotolongo / Mark Manzano', player2: 'Jonathan Estepan / Daniel Bray' },
				MBD1: {
					player1: 'Ryan Appleby / Matt Kern',
					player2: 'Paul Sotolongo / Mark Manzano',
					scheduledTime: 'Saturday · 3:00 PM',
				},
			},
			'mens-age-60': {
				'M60+9': { player1: 'John Wuchte', player2: 'Larry Prince Jr.' },
				'M60+5': { player1: 'Scott Gill', player2: 'Mike Boyar' },
				'M60+7': { player1: 'Jim Russell', player2: 'Charles Cole' },
				'M60+8': { player1: 'Val Peco', player2: 'John Wuchte', scheduledTime: 'Saturday · 2:00 PM' },
			},
			'mens-doubles-elite': {
				MED11: { player1: 'Mike Bock / Terry Money', player2: 'Chris Steinheiser / John Johnston' },
				MED10: { player1: 'Dirk Huck / John Joseph', player2: 'Greg Caruso / Alex Bartolome' },
			},
			'mens-age-50': {
				'M50+3': { player1: 'John Johnston', player2: 'Timothy Schnellenberger' },
				'M50+4': { player1: 'Tyson Peco', player2: 'TBD', court: 'Court 2', scheduledTime: 'Saturday · 2:00 PM' },
			},
			'mens-doubles-a': {
				MAD5: {
					player1: 'Brendan Anthony / Jose Gallegos',
					player2: 'Paul Sotolongo / Kyle Artman',
					court: 'Court 3',
				},
			},
			'mens-singles-b': {
				MB8: {
					player1: 'Scott Gill',
					player2: 'Elijah Saunders',
					court: 'Court 1',
					scheduledTime: 'Saturday · 1:00 PM',
				},
				MB4: { scheduledTime: 'Sunday · 8:00 AM' },
			},
		});
		assert.equal(divisions['mens-doubles-b']?.MBD4?.winner, 1);
		assert.equal(divisions['mens-doubles-b']?.MBD4?.score, '15-4, 15-9');
		assert.equal(divisions['mens-doubles-b']?.MBD4?.court, 'Court 4');
		assert.equal(divisions['mens-doubles-b']?.MBD5?.court, 'Court 4');
		assert.equal(divisions['mens-doubles-b']?.MBD5?.scheduledTime, 'Friday · 6:30 PM');
		assert.equal(divisions['mens-age-60']?.['M60+5']?.winner, 2);
		assert.equal(divisions['mens-age-60']?.['M60+5']?.score, '15-7, 15-8');
		assert.equal(divisions['mens-age-60']?.['M60+5']?.court, 'Court 2');
		assert.equal(divisions['mens-age-60']?.['M60+5']?.scheduledTime, 'Friday · 5:30 PM');
		assert.equal(divisions['mens-age-60']?.['M60+7']?.winner, 2);
		assert.equal(divisions['mens-age-60']?.['M60+7']?.score, '15-5, 14-14, Win by forfeit');
		assert.equal(divisions['mens-age-60']?.['M60+7']?.court, 'Court 3');
		assert.equal(divisions['mens-age-60']?.['M60+9']?.court, 'Court 1');
		assert.equal(divisions['mens-doubles-elite']?.MED11?.court, 'Court 2');
		assert.equal(divisions['mens-doubles-elite']?.MED10?.court, 'Court 2');
		assert.equal(divisions['mens-age-50']?.['M50+3']?.winner, 2);
		assert.equal(divisions['mens-age-50']?.['M50+3']?.score, '11-15, 15-8, 11-7');
		assert.equal(divisions['mens-age-50']?.['M50+3']?.court, 'Court 1');
		assert.equal(divisions['mens-doubles-a']?.MAD5?.court, 'Court 4');
		assert.equal(divisions['mens-age-60']?.['M60+8']?.winner, 1);
		assert.equal(divisions['mens-age-60']?.['M60+8']?.score, '15-1, 15-2');
		assert.equal(divisions['mens-age-60']?.['M60+8']?.court, 'Court 3');
		assert.equal(divisions['mens-age-60']?.['M60+8']?.scheduledTime, 'Saturday · 2:00 PM');
		assert.equal(divisions['mens-age-50']?.['M50+4']?.player1, 'Tyson Peco');
		assert.equal(divisions['mens-age-50']?.['M50+4']?.player2, 'Ben Kniesly');
		assert.equal(divisions['mens-age-50']?.['M50+4']?.winner, 1);
		assert.equal(divisions['mens-age-50']?.['M50+4']?.score, '15-4, 15-1');
		assert.equal(divisions['mens-age-50']?.['M50+4']?.court, 'Court 1');
		assert.equal(divisions['mens-age-50']?.['M50+4']?.scheduledTime, 'Saturday · 2:00 PM');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.player1, 'Tyson Peco');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.player2, 'Timothy Schnellenberger');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.winner, 1);
		assert.equal(divisions['mens-age-50']?.['M50+1']?.score, '15-1, 15-4');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.court, 'Court 1');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(divisions['mens-doubles-b']?.MBD3?.court, 'Court 2');
		assert.equal(divisions['mens-doubles-b']?.MBD3?.winner, 2);
		assert.equal(divisions['mens-doubles-b']?.MBD3?.score, '15-1, 15-12');
		assert.equal(divisions['mens-doubles-b']?.MBD1?.winner, 1);
		assert.equal(divisions['mens-doubles-b']?.MBD1?.score, '15-3, 15-7');
		assert.equal(divisions['mens-doubles-b']?.MBD1?.scheduledTime, 'Saturday · 3:00 PM');
		assert.equal(divisions['mens-doubles-b']?.MBD2?.player1, 'Jonathan Estepan / Daniel Bray');
		assert.equal(divisions['mens-doubles-b']?.MBD2?.player2, 'Steve Disalvo / Kyle Artman');
		assert.equal(divisions['mens-doubles-b']?.MBD2?.winner, 2);
		assert.equal(divisions['mens-doubles-b']?.MBD2?.score, '6-15, 15-10, 15-8');
		assert.equal(divisions['mens-doubles-b']?.MBD2?.court, 'Court 3');
		assert.equal(divisions['mens-doubles-b']?.MBD2?.scheduledTime, 'Sunday · 2:00 PM');
		assert.equal(divisions['mens-doubles-centurion']?.MCSD6?.score, '15-7, 15-13');
		assert.equal(divisions['mens-doubles-centurion']?.MCSD6?.winner, 1);
		assert.equal(divisions['mens-singles-b']?.MB8?.player1, 'Scott Gill');
		assert.equal(divisions['mens-singles-b']?.MB8?.player2, 'Elijah Saunders');
		assert.equal(divisions['mens-singles-b']?.MB8?.winner, 2);
		assert.equal(divisions['mens-singles-b']?.MB8?.score, '15-5, 15-14');
		assert.equal(divisions['mens-singles-b']?.MB8?.court, 'Court 1');
		assert.equal(divisions['mens-singles-b']?.MB8?.scheduledTime, 'Saturday · 1:00 PM');
		assert.equal(divisions['mens-singles-b']?.MB4?.player1, 'Elijah Saunders');
		assert.equal(divisions['mens-singles-b']?.MB4?.player2, 'Daniel Bray');
		assert.equal(divisions['mens-singles-b']?.MB4?.winner, undefined);
		assert.equal(divisions['mens-singles-b']?.MB4?.court, 'Court 2');
		assert.equal(divisions['mens-singles-b']?.MB4?.scheduledTime, 'Sunday · 8:00 AM');
		assert.equal(divisions['mens-singles-b']?.MB3?.winner, 2);
		assert.equal(divisions['mens-singles-b']?.MB3?.score, '15-7, 15-11');
		assert.equal(divisions['mens-singles-b']?.MB1?.player1, 'Elijah Saunders');
		assert.equal(divisions['mens-singles-b']?.MB1?.player2, 'Matt Kern');
		assert.equal(divisions['mens-singles-b']?.MB1?.winner, 1);
		assert.equal(divisions['mens-singles-b']?.MB1?.score, '15-13, 12-15, 11-4');
		assert.equal(divisions['mens-singles-b']?.MB1?.court, 'Court 4');
		assert.equal(divisions['mens-doubles-open']?.MOD3?.player1, 'Tyson Peco / Naomi Ros');
		assert.equal(divisions['mens-doubles-open']?.MOD3?.winner, 1);
		assert.equal(divisions['mens-doubles-open']?.MOD3?.score, '15-4, 15-6');
		assert.equal(divisions['mens-doubles-open']?.MOD1?.player2, 'Tyson Peco / Naomi Ros');
		assert.equal(divisions['mens-doubles-open']?.MOD1?.winner, 2);
		assert.equal(divisions['mens-doubles-open']?.MOD1?.score, '15-6, 15-8');
		assert.equal(divisions['mens-doubles-centurion']?.MCSD3?.winner, 2);
		assert.equal(divisions['mens-doubles-centurion']?.MCSD3?.score, '15-5, 15-3');
		assert.equal(divisions['mens-doubles-centurion']?.MCSD4?.winner, 2);
		assert.equal(divisions['mens-doubles-centurion']?.MCSD4?.score, '15-1, 15-7');
		assert.equal(divisions['mens-doubles-elite']?.MED4?.court, 'Court 4');
		assert.equal(divisions['mens-doubles-elite']?.MED4?.winner, 2);
		assert.equal(divisions['mens-doubles-elite']?.MED4?.score, '15-7, 15-14');
		assert.equal(divisions['mens-doubles-elite']?.MED1?.player1, 'Wade Stubanas / Brian Grantham');
		assert.equal(divisions['mens-doubles-elite']?.MED1?.player2, 'Mike Bock / Terry Money');
		assert.equal(divisions['mens-doubles-elite']?.MED1?.winner, 1);
		assert.equal(divisions['mens-doubles-elite']?.MED1?.score, '10-15, 15-7, 11-6');
		assert.equal(divisions['mens-doubles-elite']?.MED1?.court, 'Court 2');
		assert.equal(divisions['mens-doubles-elite']?.MED1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(divisions['mens-doubles-elite']?.MED3?.winner, 1);
		assert.equal(divisions['mens-doubles-elite']?.MED3?.score, '14-15, 15-4, 11-6');
		assert.equal(divisions['mens-doubles-elite']?.MED3?.court, 'Court 2');
		assert.equal(divisions['mens-singles-a']?.MA1?.player1, 'Brendan Anthony');
		assert.equal(divisions['mens-singles-a']?.MA1?.player2, 'Brian Grantham');
		assert.equal(divisions['mens-singles-a']?.MA1?.winner, 1);
		assert.equal(divisions['mens-singles-a']?.MA1?.score, '14-15, 15-5, 11-4');
		assert.equal(divisions['mens-singles-a']?.MA1?.court, 'Court 1');
		assert.equal(divisions['mens-singles-a']?.MA1?.scheduledTime, 'Sunday · 2:00 PM');
		assert.equal(divisions['mens-doubles-a']?.MAD4?.winner, 1);
		assert.equal(divisions['mens-doubles-a']?.MAD4?.score, '13-15, 15-4, 11-3');
		assert.equal(divisions['mens-doubles-a']?.MAD4?.court, 'Court 3');
		assert.equal(divisions['mens-doubles-a']?.MAD1?.player1, 'Tony Gutierrez / Gene Fry');
		assert.equal(divisions['mens-doubles-a']?.MAD1?.player2, 'Troy Ayers / Greg Caruso');
		assert.equal(divisions['mens-doubles-a']?.MAD1?.winner, 2);
		assert.equal(divisions['mens-doubles-a']?.MAD1?.score, '15-3, 15-12');
		assert.equal(divisions['mens-doubles-a']?.MAD1?.court, 'Court 2');
		assert.equal(divisions['mens-doubles-a']?.MAD1?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(divisions['mens-age-60']?.['M60+1']?.player1, 'Val Peco');
		assert.equal(divisions['mens-age-60']?.['M60+1']?.player2, 'Dirk Huck');
		assert.equal(divisions['mens-age-60']?.['M60+1']?.winner, 1);
		assert.equal(divisions['mens-age-60']?.['M60+1']?.score, '15-2, 15-1');
		assert.equal(divisions['mens-age-60']?.['M60+1']?.court, 'Court 3');
		assert.equal(divisions['mens-age-60']?.['M60+1']?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.player1, 'Tyson Peco');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.player2, 'Timothy Schnellenberger');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.winner, 1);
		assert.equal(divisions['mens-age-50']?.['M50+1']?.score, '15-1, 15-4');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.court, 'Court 1');
		assert.equal(divisions['mens-age-50']?.['M50+1']?.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(divisions['mens-singles-open']?.MO1?.winner, 1);
		assert.equal(divisions['mens-singles-open']?.MO1?.score, '15-10, 15-13');
		assert.equal(divisions['mens-singles-open']?.MO1?.court, 'Court 1');
		assert.equal(divisions['mens-singles-open']?.MO1?.player1, 'Annie Sanchez');
		assert.equal(divisions['mens-singles-open']?.MO1?.player2, 'Naomi Ros');
		assert.equal(divisions['mens-singles-b']?.MB1?.player1, 'Elijah Saunders');
		assert.equal(divisions['mens-singles-b']?.MB1?.player2, 'Matt Kern');
		assert.equal(divisions['mens-singles-b']?.MB1?.winner, 1);
		assert.equal(divisions['mens-singles-b']?.MB1?.score, '15-13, 12-15, 11-4');
		assert.equal(divisions['mens-singles-b']?.MB1?.court, 'Court 4');
		assert.equal(divisions['mens-doubles-open']?.MOD1?.player2, 'Tyson Peco / Naomi Ros');
		assert.equal(divisions['mens-doubles-open']?.MOD1?.winner, 2);
		assert.equal(divisions['mens-doubles-open']?.MOD1?.score, '15-6, 15-8');
	});
});

describe('merge keeps an unpublished score-without-winner undecided', () => {
	it('keeps a published final when a later resolved page has score text but no winner', () => {
		const merged = mergeOneMatch(
			{ player1: 'Huck / Joseph', player2: 'McDonald / Rivero', winner: 1, score: 'WBF - No Show' },
			{ player1: 'Huck / Joseph', player2: 'McDonald / Rivero', score: 'WBF - No Show' },
			{ quarantined: false, resolved: true },
		);
		assert.equal(merged.winner, 1);
		assert.equal(merged.score, 'WBF - No Show');
	});

	it('keeps a stored WBF/no-show score when a resolved page clears the court and has no winner', () => {
		const merged = mergeOneMatch(
			{
				player1: 'Dirk Huck / John Joseph',
				player2: 'Jack McDonald / Yelandi Rivero',
				score: 'WBF - No Show',
				court: 'Court 4',
				scheduledTime: 'Saturday · 2:00 PM',
			},
			{
				player1: 'Dirk Huck / John Joseph',
				player2: 'Jack McDonald / Yelandi Rivero',
				scheduledTime: 'Saturday · 2:00 PM',
			},
			{ quarantined: false, resolved: true },
		);
		assert.equal(merged.winner, undefined);
		assert.equal(merged.score, 'WBF - No Show');
		assert.equal(merged.court, undefined);
		assert.equal(merged.scheduledTime, 'Saturday · 2:00 PM');
	});

	it('publishes incoming WBF/no-show score text even when there is no winner', () => {
		const merged = mergeOneMatch(
			{
				player1: 'Dirk Huck / John Joseph',
				player2: 'Jack McDonald / Yelandi Rivero',
				court: 'Court 4',
				scheduledTime: 'Saturday · 2:00 PM',
			},
			{
				player1: 'Dirk Huck / John Joseph',
				player2: 'Jack McDonald / Yelandi Rivero',
				score: 'WBF - No Show',
				scheduledTime: 'Saturday · 2:00 PM',
			},
			{ quarantined: false, resolved: true },
		);
		assert.equal(merged.winner, undefined);
		assert.equal(merged.score, 'WBF - No Show');
		assert.equal(merged.court, undefined);
	});
});

describe('✓ Winner label including doubles and forfeits', () => {
	it('reads the ✓ Winner badge on live singles, doubles, and forfeit pages', () => {
		assert.equal(mb10Page.winnerName, 'Ben Mordkovich');
		assert.match(mb10Page.winnerName ?? '', /✓|Winner|Ben/i);
		assert.equal(mbd4Page.winnerName, 'Ryan Appleby / Matt Kern');
		assert.equal(med10Page.winnerName, 'Dirk Huck / John Joseph');
		assert.equal(med10Page.score, 'WBF - No Show');
		assert.equal(mcsd6Page.winnerName, null);
	});

	it('recognizes a ✓ Winner label without relying on classList', () => {
		const html = `
			<div class="r2p-versus-side">
				<div class="r2p-side-heading"><span>✓ Winner</span></div>
				<div class="r2p-side-names"><a>Ben Mordkovich</a></div>
			</div>
			<div class="r2p-versus-side">
				<div class="r2p-side-heading"></div>
				<div class="r2p-side-names"><a>Ann Brandt</a></div>
			</div>
			<div class="r2p-match-result"><strong>15-13, 15-13</strong></div>`;
		const page = parseMatchPage(html);
		assert.equal(page.winnerName, 'Ben Mordkovich');
		assert.equal(page.score, '15-13, 15-13');
	});
});

describe('score leak: next-round slot scores belong to the previous match', () => {
	it('does not put MB9/MB10/MED10 scores on unplayed MB8/MB7/MED7', () => {
		assert.equal(mbDraw.matches.MB8?.drawScore, undefined);
		assert.equal(mbDraw.matches.MB7?.drawScore, undefined);
		assert.equal(medDraw.matches.MED7?.drawScore, undefined);
		assert.equal(mbDraw.matches.MB9?.drawScore, '15-9, 15-10');
		assert.equal(mbDraw.matches.MB10?.drawScore, '15-13, 15-13');
		assert.equal(medDraw.matches.MED10?.drawScore, 'WBF - No Show');

		const mb8 = resolveMatchResult({ matchId: 'MB8', draw: mbDraw.matches.MB8! });
		const mb7 = resolveMatchResult({ matchId: 'MB7', draw: mbDraw.matches.MB7! });
		const med7 = resolveMatchResult({ matchId: 'MED7', draw: medDraw.matches.MED7! });
		assert.equal(mb8.record.score, undefined);
		assert.equal(mb7.record.score, undefined);
		assert.equal(med7.record.score, undefined);
		assert.doesNotMatch(med7.record.score ?? '', /Haacke|MED7|4:00/);
	});

	it('does not swallow adjacent cells into a WBF score', () => {
		assert.equal(extractScore('WBF - No Show MED7 Sa 4:00 P#4 Haacke / Haacke'), 'WBF - No Show');
	});
});

describe('short next-round names expand to full roster names', () => {
	it('maps E Saunders, B Mordkovich, S Gill, and Huck/Joseph from the draw roster', () => {
		assert.equal(mbDraw.matches.MB8?.player1, 'Scott Gill');
		assert.equal(mbDraw.matches.MB8?.player2, 'Elijah Saunders');
		assert.equal(mbDraw.matches.MB7?.player1, 'Ben Mordkovich');
		assert.match(medDraw.matches.MED7?.player1 ?? '', /Huck/);
		assert.match(medDraw.matches.MED7?.player1 ?? '', /Joseph/);
		assert.doesNotMatch(mbDraw.matches.MB8?.player2 ?? '', /^E /);

		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-singles-b': {
				MB8: { player1: 'S Gill', player2: 'E Saunders' },
				MB7: { player1: 'B Mordkovich', player2: 'M Kern' },
			},
			'mens-doubles-elite': {
				MED7: { player1: 'Huck / Joseph', player2: 'Haacke / Haacke' },
			},
		});
		const mb = event.divisionDetails.find((d) => d.id === 'mens-singles-b');
		const med = event.divisionDetails.find((d) => d.id === 'mens-doubles-elite');
		const find = (div = mb, id: string) =>
			div?.rounds?.flatMap((r) => r.matches).find((m) => m.matchId === id);
		assert.equal(find(mb, 'MB8')?.player2, 'Elijah Saunders');
		assert.equal(find(mb, 'MB8')?.player1, 'Scott Gill');
		assert.equal(find(mb, 'MB7')?.player1, 'Ben Mordkovich');
		assert.match(find(med, 'MED7')?.player1 ?? '', /Huck/);
	});
});

describe('live R2 6:11 PM: RR doubles and player-2 60+ winners', () => {
	it('MBD4 Appleby/Kern def Estepan/Bray 15-4, 15-9 on Court 4', () => {
		assert.equal(mbdDraw.matches.MBD4?.r2MatchId, '4979574');
		const { record, quarantine } = resolveCode(mbdDraw, 'MBD4', mbd4Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-4, 15-9');
		assert.equal(record.court, 'Court 4');
		assert.match(record.player1 ?? '', /Appleby/);
		assert.match(record.player1 ?? '', /Kern/);
	});

	it('M60+5 Mike Boyar (player 2) def Scott Gill 15-7, 15-8 on Court 2', () => {
		assert.equal(m60Draw.matches['M60+5']?.r2MatchId, '4972803');
		assert.equal(m605Page.winnerName, 'Mike Boyar');
		const { record, quarantine } = resolveCode(m60Draw, 'M60+5', m605Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.player1, 'Scott Gill');
		assert.equal(record.player2, 'Mike Boyar');
		assert.equal(record.winner, 2);
		assert.equal(record.score, '15-7, 15-8');
		assert.equal(record.court, 'Court 2');
	});

	it('M60+7 Charles Cole (player 2) def Jim Russell by forfeit on Court 3', () => {
		assert.equal(m60Draw.matches['M60+7']?.r2MatchId, '4972801');
		assert.equal(m607Page.winnerName, 'Charles Cole');
		assert.match(m607Page.score ?? '', /15-5, 14-14/);
		assert.match(m607Page.score ?? '', /forfeit/i);
		const { record, quarantine } = resolveCode(m60Draw, 'M60+7', m607Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.player1, 'Jim Russell');
		assert.equal(record.player2, 'Charles Cole');
		assert.equal(record.winner, 2);
		assert.match(record.score ?? '', /15-5, 14-14/);
		assert.match(record.score ?? '', /forfeit/i);
		assert.equal(record.court, 'Court 3');
	});

	it('MED10 forfeit win stays published and is not a stale quarantine', () => {
		const { record, quarantine } = resolveCode(medDraw, 'MED10', med10Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.match(record.score ?? '', /No Show/i);
	});

	it('reads ✓ Winner after VS as player 2, and before VS as player 1 doubles', () => {
		const afterVs = `
			<div class="r2p-versus-side">
				<div class="r2p-side-heading"></div>
				<div class="r2p-side-names"><a>Scott Gill</a></div>
			</div>
			<div class="r2p-versus-chip" aria-label="versus">VS</div>
			<div class="r2p-versus-side">
				<div class="r2p-side-heading"><span>✓ Winner</span></div>
				<div class="r2p-side-names"><a>Mike Boyar</a></div>
			</div>
			<div class="r2p-match-result"><strong>15-7, 15-8</strong></div>`;
		const afterPage = parseMatchPage(afterVs);
		assert.equal(afterPage.winnerName, 'Mike Boyar');
		assert.equal(winnerNameFromHtml(afterVs).winnerName, 'Mike Boyar');
		assert.equal(afterPage.player1, 'Scott Gill');
		assert.equal(afterPage.player2, 'Mike Boyar');

		const beforeVs = `
			<div class="r2p-versus-side">
				<div class="r2p-side-heading"><span>✓ Winner</span></div>
				<div class="r2p-side-names"><span>Ryan Appleby</span><span>Matt Kern</span></div>
			</div>
			<div class="r2p-versus-chip" aria-label="versus">VS</div>
			<div class="r2p-versus-side">
				<div class="r2p-side-heading"></div>
				<div class="r2p-side-names"><span>Jonathan Estepan</span><span>Daniel Bray</span></div>
			</div>
			<div class="r2p-match-result"><strong>15-4, 15-9</strong></div>`;
		assert.equal(parseMatchPage(beforeVs).winnerName, 'Ryan Appleby / Matt Kern');
		assert.equal(winnerNameFromHtml(beforeVs).winnerName, 'Ryan Appleby / Matt Kern');
	});
});

describe('quarantine list clears once a match publishes', () => {
	it('drops MED10 after the forfeit win is already published', () => {
		const event = LIVE_EVENTS.psl;
		const existing = {
			lastUpdated: '2026-10-23T21:15:00.000Z',
			divisions: {
				'mens-doubles-elite': {
					MED10: {
						player1: 'Dirk Huck / John Joseph',
						player2: 'McDonald / Rivero',
						winner: 1 as const,
						score: 'WBF - No Show',
					},
				},
			},
		};
		const merged = mergeScrapedResults(
			event,
			existing,
			{
				scraped: 1,
				matchesWithResults: 0,
				divisions: {
					'mens-doubles-elite': {
						MED10: {
							player1: 'Dirk Huck / John Joseph',
							player2: 'McDonald / Rivero',
							score: 'WBF - No Show',
						},
					},
				},
				divisionReports: [],
				errors: [],
				quarantined: [
					{
						matchId: 'MED10',
						divisionId: 'mens-doubles-elite',
						reason: 'draw marks a winner but the match page does not',
					},
				],
				resolvedMatchIds: ['MED10'],
				audit: [],
			},
			{ lastUpdated: null, eventSlug: event.slug, events: [] },
			'2026-10-23T22:10:00.000Z',
		);
		assert.equal(merged.results.divisions['mens-doubles-elite']?.MED10?.winner, 1);
		assert.equal(
			merged.quarantined.find((q) => q.matchId === 'MED10'),
			undefined,
		);
		assert.deepEqual(
			dropPublishedQuarantine(
				[{ matchId: 'MED10', reason: 'draw marks a winner but the match page does not' }],
				existing.divisions,
			),
			[],
		);
	});
});

describe('missing match-page markup falls back to that match own draw result', () => {
	const stubPage = `<html><body><p>R2 Sports</p></body></html>`;

	it('treats a short stub without versus markup as missing versus/result markup and logs a snippet', () => {
		assert.equal(htmlLooksLikeMatchPage(stubPage), false);
		const reason = describeBadMatchHtml(stubPage);
		assert.match(reason, /missing versus\/result markup/i);
		assert.match(reason, /bytes:/);
	});

	it('publishes MBD4 from the draw when r2-push returns that stub', () => {
		assert.ok(ownDrawFinal(mbdDraw.matches.MBD4!));
		const { record, quarantine } = resolveMatchResult({
			matchId: 'MBD4',
			draw: mbdDraw.matches.MBD4!,
			page: null,
			pageError: describeBadMatchHtml(stubPage),
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-4, 15-9');
		assert.match(record.player1 ?? '', /Appleby/);
	});

	it('does not invent a 60+ score when the draw box has a winner but no own-box score', () => {
		assert.equal(ownDrawFinal(m60Draw.matches['M60+5']!), null);
		const { record, quarantine } = resolveMatchResult({
			matchId: 'M60+5',
			draw: m60Draw.matches['M60+5']!,
			page: null,
			pageError: describeBadMatchHtml(stubPage),
		});
		assert.ok(quarantine);
		assert.match(quarantine.reason, /missing versus\/result markup/i);
		assert.equal(record.winner, undefined);
	});

	it('sends full Chrome navigation headers on production fetches', () => {
		assert.match(BROWSER_HEADERS['user-agent'] ?? '', /Chrome\/124/);
		assert.equal(BROWSER_HEADERS['user-agent'], USER_AGENT);
		assert.match(BROWSER_HEADERS.accept ?? '', /text\/html/);
		assert.equal(BROWSER_HEADERS['accept-language'], 'en-US,en;q=0.9');
		assert.equal(BROWSER_HEADERS['sec-fetch-dest'], 'document');
		assert.equal(BROWSER_HEADERS['sec-fetch-mode'], 'navigate');
		assert.match(BROWSER_HEADERS['sec-ch-ua'] ?? '', /Chromium/);
	});
});

describe('page failures keep a published result', () => {
	it('retries HTTP 500/502/503/504', () => {
		assert.equal(isRetryableStatus(500), true);
		assert.equal(isRetryableStatus(503), true);
		assert.equal(isRetryableStatus(404), false);
	});

	it('quarantine or missing match page does not wipe the last published winner', () => {
		const kept = mergeOneMatch(
			{ player1: 'Ben Mordkovich', player2: 'Ann Brandt', winner: 1, score: '15-13, 15-13' },
			{ player1: 'Ben Mordkovich', player2: 'Ann Brandt', court: 'Court 1' },
			{ quarantined: true, resolved: false },
		);
		assert.equal(kept.winner, 1);
		assert.equal(kept.score, '15-13, 15-13');
		assert.equal(kept.court, 'Court 1');

		const unavailable = resolveMatchResult({
			matchId: 'MB9',
			draw: { ...mbDraw.matches.MB9!, drawScore: '15-9, 15-10' },
			pageError: 'HTTP 500 for https://www.r2sports.com/r2-push.asp',
		});
		assert.ok(unavailable.quarantine);
		assert.equal(unavailable.record.winner, undefined);
		const merged = mergeOneMatch(
			{ player1: 'Elijah Saunders', player2: 'Mark Manzano', winner: 1, score: '15-9, 15-10' },
			unavailable.record,
			{ quarantined: true, resolved: false },
		);
		assert.equal(merged.winner, 1);
		assert.equal(merged.score, '15-9, 15-10');
	});

	it('does not blank a known court or time when the incoming scrape omitted them', () => {
		const kept = mergeOneMatch(
			{
				player1: 'John Wuchte',
				player2: 'Larry Prince Jr.',
				winner: 1,
				score: '14-15, 15-8, 15-5',
				court: 'Court 1',
				scheduledTime: 'Friday · 5:30 PM',
			},
			{
				player1: 'John Wuchte',
				player2: 'Larry Prince Jr.',
				winner: 1,
				score: '14-15, 15-8, 15-5',
			},
			{ quarantined: false, resolved: true },
		);
		assert.equal(kept.court, 'Court 1');
		assert.equal(kept.scheduledTime, 'Friday · 5:30 PM');
		assert.equal(kept.winner, 1);
	});
});

describe('finished matches keep court and time from the R2 match page', () => {
	const expected: Array<{
		id: string;
		draw: typeof m60Draw;
		page: ReturnType<typeof parseMatchPage>;
		html: string;
		court: string;
		time: string;
	}> = [
		{ id: 'M60+9', draw: m60Draw, page: m609Page, html: m609Html, court: 'Court 1', time: 'Friday · 5:30 PM' },
		{ id: 'M60+5', draw: m60Draw, page: m605Page, html: m605Html, court: 'Court 2', time: 'Friday · 5:30 PM' },
		{ id: 'M60+7', draw: m60Draw, page: m607Page, html: m607Html, court: 'Court 3', time: 'Friday · 5:30 PM' },
		{ id: 'MED11', draw: medDraw, page: med11Page, html: med11Html, court: 'Court 2', time: 'Friday · 6:30 PM' },
		{ id: 'MED10', draw: medDraw, page: med10Page, html: med10Html, court: 'Court 2', time: 'Friday · 4:30 PM' },
		{ id: 'MBD5', draw: mbdDraw, page: mbd5Page, html: mbd5Html, court: 'Court 4', time: 'Friday · 6:30 PM' },
	];

	it('publishes match-page court/time even after the finished draw box drops #court', () => {
		for (const row of expected) {
			const parsed = row.draw.matches[row.id];
			assert.ok(parsed, `missing ${row.id}`);
			const { record, quarantine } = resolveMatchResult({
				matchId: row.id,
				draw: courtless(parsed),
				page: row.page,
				pageHtml: row.html,
			});
			assert.equal(quarantine, undefined, row.id);
			assert.equal(record.court, row.court, row.id);
			assert.equal(record.scheduledTime, row.time, row.id);
			assert.ok(record.winner === 1 || record.winner === 2, row.id);
		}
	});

	it('still reads court/time from r2-push HTML when the page parse is treated as a stub', () => {
		for (const row of expected) {
			const parsed = row.draw.matches[row.id];
			assert.ok(parsed, `missing ${row.id}`);
			const { record } = resolveMatchResult({
				matchId: row.id,
				draw: courtless(parsed),
				page: null,
				pageError: 'match page HTML missing versus/result markup (800 bytes: stub)',
				pageHtml: row.html,
			});
			assert.equal(record.court, row.court, row.id);
			assert.equal(record.scheduledTime, row.time, row.id);
		}
	});

	it('overlays those courts onto the static event and restores a wiped results blob', () => {
		const incoming: Record<string, Record<string, ReturnType<typeof resolveMatchResult>['record']>> = {
			'mens-age-60': {},
			'mens-doubles-elite': {},
			'mens-doubles-b': {},
		};
		const divFor: Record<string, string> = {
			'M60+9': 'mens-age-60',
			'M60+5': 'mens-age-60',
			'M60+7': 'mens-age-60',
			MED11: 'mens-doubles-elite',
			MED10: 'mens-doubles-elite',
			MBD5: 'mens-doubles-b',
		};
		// 11:36 PM EDT blob: winners published, draw had dropped #court, match-page
		// schedule never made it onto the record.
		const wiped: Record<string, Record<string, { player1: string; player2: string; winner: 1 | 2; score: string; scheduledTime?: string }>> = {
			'mens-age-60': {
				'M60+9': { player1: 'John Wuchte', player2: 'Larry Prince Jr.', winner: 1, score: '14-15, 15-8, 15-5' },
				'M60+5': { player1: 'Scott Gill', player2: 'Mike Boyar', winner: 2, score: '15-7, 15-8' },
				'M60+7': { player1: 'Jim Russell', player2: 'Charles Cole', winner: 2, score: '15-5, 14-14, Win by forfeit' },
			},
			'mens-doubles-elite': {
				MED11: { player1: 'Mike Bock / Terry Money', player2: 'Chris Steinheiser / John Johnston', winner: 1, score: '15-4, 15-11' },
				MED10: { player1: 'Dirk Huck / John Joseph', player2: 'Greg Caruso / Alex Bartolome', winner: 1, score: 'WBF - No Show' },
			},
			'mens-doubles-b': {
				MBD5: {
					player1: 'Paul Sotolongo / Mark Manzano',
					player2: 'Jonathan Estepan / Daniel Bray',
					winner: 2,
					score: '9-15, 15-14, 11-5',
					scheduledTime: 'Friday · 6:30 PM',
				},
			},
		};
		for (const row of expected) {
			const parsed = row.draw.matches[row.id]!;
			incoming[divFor[row.id]!]![row.id] = resolveMatchResult({
				matchId: row.id,
				draw: courtless(parsed),
				page: row.page,
				pageHtml: row.html,
			}).record;
		}

		const restored = mergeScrapedResults(
			LIVE_EVENTS.psl,
			{ lastUpdated: '2026-10-24T03:36:44.755Z', divisions: wiped },
			{
				scraped: 3,
				matchesWithResults: 6,
				divisions: incoming,
				divisionReports: [],
				errors: [],
				quarantined: [],
				resolvedMatchIds: expected.map((r) => r.id),
				audit: [],
			},
			{ lastUpdated: null, eventSlug: 'port-st-lucie-open', events: [] },
			'2026-10-24T08:00:00.000Z',
		);
		assert.equal(restored.changed, true);
		assert.equal(restored.results.divisions['mens-age-60']?.['M60+9']?.court, 'Court 1');
		assert.equal(restored.results.divisions['mens-age-60']?.['M60+5']?.court, 'Court 2');
		assert.equal(restored.results.divisions['mens-age-60']?.['M60+7']?.court, 'Court 3');
		assert.equal(restored.results.divisions['mens-doubles-elite']?.MED11?.court, 'Court 2');
		assert.equal(restored.results.divisions['mens-doubles-elite']?.MED10?.court, 'Court 2');
		assert.equal(restored.results.divisions['mens-doubles-b']?.MBD5?.court, 'Court 4');
		assert.equal(restored.results.divisions['mens-doubles-b']?.MBD5?.scheduledTime, 'Friday · 6:30 PM');

		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, restored.results.divisions);
		const find = (divId: string, id: string) => {
			const div = event.divisionDetails.find((d) => d.id === divId);
			return (
				div?.rounds?.flatMap((r) => r.matches).find((m) => m.matchId === id) ??
				div?.roundRobinMatches?.find((m) => m.matchId === id)
			);
		};
		assert.equal(find('mens-age-60', 'M60+9')?.court, 'Court 1');
		assert.equal(find('mens-age-60', 'M60+5')?.court, 'Court 2');
		assert.equal(find('mens-age-60', 'M60+7')?.court, 'Court 3');
		assert.equal(find('mens-doubles-elite', 'MED11')?.court, 'Court 2');
		assert.equal(find('mens-doubles-elite', 'MED10')?.court, 'Court 2');
		assert.equal(find('mens-doubles-b', 'MBD5')?.court, 'Court 4');
		assert.equal(find('mens-age-60', 'M60+9')?.scheduledTime, 'Friday · 5:30 PM');
		assert.equal(find('mens-doubles-elite', 'MED10')?.scheduledTime, 'Friday · 4:30 PM');
	});
});

describe('Sunday draw: blue winner border, not green loser line', () => {
	const sundayMcsd = extractSingleElimFromHtml(read('psl-mcsd-draw-sunday.html'));
	const sundayMb = extractSingleElimFromHtml(read('psl-mb-draw-sunday.html'));
	const mcsd3Page = parseMatchPage(read('psl-mcsd3-match.html'));
	const mcsd4Page = parseMatchPage(read('psl-mcsd4-match.html'));
	const mb3Page = parseMatchPage(read('psl-mb3-match.html'));

	it('MCSD4 draw names Bock/Money (blue), not Gutierrez/Fry (green leftover)', () => {
		const draw = sundayMcsd.matches.MCSD4;
		assert.ok(draw);
		assert.match(draw.player1 ?? '', /Gutierrez/);
		assert.match(draw.player2 ?? '', /Bock/);
		assert.equal(draw.drawWinner, 2);
		assert.match(draw.drawWinnerName ?? '', /Bock/);
		assert.equal(draw.drawWinnerSource, 'box-border');
	});

	it('MCSD3 draw names the Pecos, not Huck/Joseph leftover green', () => {
		const draw = sundayMcsd.matches.MCSD3;
		assert.ok(draw);
		assert.match(draw.player1 ?? '', /Huck/);
		assert.match(draw.player2 ?? '', /Peco/);
		assert.equal(draw.drawWinner, 2);
		assert.match(draw.drawWinnerName ?? '', /Peco/);
	});

	it('resolves MCSD4/MCSD3 from the match page without quarantining', () => {
		const mcsd4 = resolveCode(sundayMcsd, 'MCSD4', mcsd4Page);
		assert.equal(mcsd4.quarantine, undefined);
		assert.equal(mcsd4.record.winner, 2);
		assert.equal(mcsd4.record.score, '15-1, 15-7');
		assert.equal(mcsd4.record.court, 'Court 2');
		const mcsd3 = resolveCode(sundayMcsd, 'MCSD3', mcsd3Page);
		assert.equal(mcsd3.quarantine, undefined);
		assert.equal(mcsd3.record.winner, 2);
		assert.equal(mcsd3.record.score, '15-5, 15-3');
		assert.equal(mcsd3.record.court, 'Court 1');
	});

	it('keeps later-round MB names from the parent box, not the nested match-link table', () => {
		const mb3 = sundayMb.matches.MB3;
		assert.ok(mb3);
		assert.match(mb3.player1 ?? '', /Artman/);
		assert.match(mb3.player2 ?? '', /Kern/);
		assert.equal(mb3.drawWinner, 2);
		assert.match(mb3.drawWinnerName ?? '', /Kern/);
		const mb1 = sundayMb.matches.MB1;
		assert.ok(mb1);
		assert.match(mb1.player1 ?? '', /Saunders/);
		assert.match(mb1.player2 ?? '', /Kern/);
		assert.equal(mb1.drawWinner, undefined);
	});

	it('resolves MB3 Kern from the match page', () => {
		const { record, quarantine } = resolveCode(sundayMb, 'MB3', mb3Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 2);
		assert.equal(record.score, '15-7, 15-11');
		assert.equal(record.court, 'Court 3');
		assert.match(record.player2 ?? '', /Kern/);
	});
});

describe('Sunday Elite ME3 / ME1', () => {
	const sundayMe = extractSingleElimFromHtml(read('psl-me-draw-sunday.html'));
	const me3Page = parseMatchPage(read('psl-me3-match.html'));
	const me1Page = parseMatchPage(read('psl-me1-match.html'));

	it('keeps later-round ME3 names and the blue Haacke winner, not the nested link table', () => {
		const draw = sundayMe.matches.ME3;
		assert.ok(draw);
		assert.equal(draw.player1, 'Scott Haacke');
		assert.equal(draw.player2, 'Chris Dermody');
		assert.equal(draw.drawWinner, 1);
		assert.equal(draw.drawWinnerName, 'Scott Haacke');
	});

	it('does not treat a 3-game dropped-first-game score as a disagreement', () => {
		assert.equal(me3Page.winnerName, 'Scott Haacke');
		assert.equal(me3Page.score, '7-15, 15-9, 11-3');
		const { record, quarantine } = resolveCode(sundayMe, 'ME3', me3Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '7-15, 15-9, 11-3');
		assert.equal(record.court, 'Court 1');
		assert.equal(record.scheduledTime, 'Sunday · 10:00 AM');
	});

	it('reads ME1 as Taylor vs Haacke, Sunday 3:00 PM Court 1, not final', () => {
		const draw = sundayMe.matches.ME1;
		assert.ok(draw);
		assert.equal(draw.player1, 'Isaac Taylor');
		assert.equal(draw.player2, 'Scott Haacke');
		assert.equal(draw.drawWinner, undefined);
		assert.equal(draw.court, 'Court 1');
		assert.equal(draw.scheduledTime, 'Sunday · 3:00 PM');
		const { record, quarantine } = resolveCode(sundayMe, 'ME1', me1Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, undefined);
		assert.equal(record.player1, 'Isaac Taylor');
		assert.equal(record.player2, 'Scott Haacke');
		assert.equal(record.court, 'Court 1');
		assert.equal(me1Page.winnerName, null);
	});
});

describe('Sunday Elite doubles MED4 / MED1', () => {
	const sundayMed = extractSingleElimFromHtml(read('psl-med-draw-sunday.html'));
	const med4Page = parseMatchPage(read('psl-med4-match.html'));
	const med3Page = parseMatchPage(read('psl-med3-match.html'));

	it('reads MED4 Stubanas/Grantham over Schulze/Anthony 15-7, 15-14 on Court 4', () => {
		const draw = sundayMed.matches.MED4;
		assert.ok(draw);
		assert.match(draw.player1 ?? '', /Schulze/);
		assert.match(draw.player2 ?? '', /Stubanas/);
		assert.equal(draw.drawWinner, 2);
		assert.match(draw.drawWinnerName ?? '', /Stubanas|Grantham/);
		assert.equal(med4Page.winnerName, 'Wade Stubanas / Brian Grantham');
		assert.equal(med4Page.score, '15-7, 15-14');
		assert.equal(med4Page.court, 'Court 4');
		const { record, quarantine } = resolveCode(sundayMed, 'MED4', med4Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 2);
		assert.equal(record.score, '15-7, 15-14');
		assert.equal(record.court, 'Court 4');
		assert.equal(record.scheduledTime, 'Sunday · 12:00 PM');
	});

	it('reads MED3 Bock/Money over Haacke/Haacke 14-15, 15-4, 11-6 on Court 2', () => {
		const draw = sundayMed.matches.MED3;
		assert.ok(draw);
		assert.match(draw.player1 ?? '', /Bock/);
		assert.match(draw.player2 ?? '', /Haacke/);
		assert.equal(draw.court, 'Court 2');
		assert.equal(draw.scheduledTime, 'Sunday · 12:00 PM');
		assert.equal(med3Page.winnerName, 'Mike Bock / Terry Money');
		assert.equal(med3Page.score, '14-15, 15-4, 11-6');
		assert.equal(med3Page.court, 'Court 2');
		const { record, quarantine } = resolveCode(sundayMed, 'MED3', med3Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '14-15, 15-4, 11-6');
		assert.equal(record.court, 'Court 2');
	});

	it('keeps a scheduled MED1 final with the MED4 winner side and no viewAppMatch', () => {
		const draw = sundayMed.matches.MED1;
		assert.ok(draw);
		assert.equal(draw.r2MatchId, undefined);
		assert.match(draw.player1 ?? '', /Stubanas|Grantham/);
		assert.equal(draw.player2, null);
		assert.equal(draw.court, 'Court 3');
		assert.equal(draw.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(draw.drawWinner, undefined);
	});

	it('also recovers MED1 from the older Saturday MED fixture', () => {
		assert.equal(medDraw.matches.MED1?.court, 'Court 3');
		assert.equal(medDraw.matches.MED1?.scheduledTime, 'Sunday · 3:00 PM');
		assert.equal(medDraw.matches.MED8, undefined);
	});
});

describe('Sunday A doubles MAD4 / MAD1', () => {
	const sundayMad = extractSingleElimFromHtml(read('psl-mad-draw-sunday.html'));
	const mad4Page = parseMatchPage(read('psl-mad4-match.html'));
	const mad1Page = parseMatchPage(read('psl-mad1-match.html'));

	it('reads MAD4 Gutierrez/Fry over Sotolongo/Artman 13-15, 15-4, 11-3 on Court 3', () => {
		const draw = sundayMad.matches.MAD4;
		assert.ok(draw);
		assert.match(draw.player1 ?? '', /Gutierrez/);
		assert.match(draw.player2 ?? '', /Sotolongo|Artman/);
		assert.equal(draw.drawWinner, 1);
		assert.match(draw.drawWinnerName ?? '', /Gutierrez|Fry/);
		assert.equal(mad4Page.winnerName, 'Tony Gutierrez / Gene Fry');
		assert.equal(mad4Page.score, '13-15, 15-4, 11-3');
		assert.equal(mad4Page.court, 'Court 3');
		const { record, quarantine } = resolveCode(sundayMad, 'MAD4', mad4Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '13-15, 15-4, 11-3');
		assert.equal(record.court, 'Court 3');
		assert.equal(record.scheduledTime, 'Sunday · 11:00 AM');
	});

	it('reads MAD1 Ayers/Caruso over Gutierrez/Fry 15-3, 15-12 on Court 2', () => {
		const draw = sundayMad.matches.MAD1;
		assert.ok(draw);
		assert.match(draw.player1 ?? '', /Gutierrez|Fry/);
		assert.match(draw.player2 ?? '', /Ayers|Caruso/);
		assert.equal(draw.scheduledTime, 'Sunday · 4:00 PM');
		assert.equal(mad1Page.winnerName, 'Troy Ayers / Greg Caruso');
		assert.equal(mad1Page.score, '15-3, 15-12');
		assert.equal(mad1Page.court, 'Court 2');
		const { record, quarantine } = resolveCode(sundayMad, 'MAD1', mad1Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 2);
		assert.equal(record.score, '15-3, 15-12');
		assert.match(record.player1 ?? '', /Gutierrez/);
		assert.match(record.player2 ?? '', /Ayers|Caruso/);
		assert.equal(record.court, 'Court 2');
		assert.equal(record.scheduledTime, 'Sunday · 4:00 PM');
	});
});

describe('Sunday Open MO1', () => {
	const sundayMo = extractRoundRobinFromHtml(read('psl-mo-rr-sunday.html'));
	const mo1Page = parseMatchPage(read('psl-mo1-match.html'));

	it('reads MO1 Sanchez over Ros 15-10, 15-13 on Court 1', () => {
		const draw = sundayMo.matches.MO1;
		assert.ok(draw);
		assert.equal(draw.player1, 'Annie Sanchez');
		assert.equal(draw.player2, 'Naomi Ros');
		assert.equal(draw.drawWinner, 1);
		assert.equal(draw.drawWinnerName, 'Annie Sanchez');
		assert.equal(draw.drawScore, '15-10, 15-13');
		assert.equal(mo1Page.winnerName, 'Annie Sanchez');
		assert.equal(mo1Page.score, '15-10, 15-13');
		assert.equal(mo1Page.court, 'Court 1');
		const { record, quarantine } = resolveMatchResult({
			matchId: 'MO1',
			draw,
			page: mo1Page,
			advancements: sundayMo.advancements,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-10, 15-13');
		assert.equal(record.court, 'Court 1');
		assert.equal(record.scheduledTime, 'Sunday · 1:00 PM');
	});
});

describe('Sunday A singles MA1', () => {
	const ma1Page = parseMatchPage(read('psl-ma1-match.html'));

	it('reads MA1 Anthony over Grantham 14-15, 15-5, 11-4 on Court 1', () => {
		assert.equal(ma1Page.winnerName, 'Brendan Anthony');
		assert.equal(ma1Page.score, '14-15, 15-5, 11-4');
		assert.equal(ma1Page.court, 'Court 1');
		assert.equal(ma1Page.scheduledTime, 'Sunday · 2:00 PM');
		const { record, quarantine } = resolveMatchResult({
			matchId: 'MA1',
			draw: {
				player1: 'Brendan Anthony',
				player2: 'Brian Grantham',
				court: 'Court 1',
				scheduledTime: 'Sunday · 2:00 PM',
			},
			page: ma1Page,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '14-15, 15-5, 11-4');
		assert.equal(record.court, 'Court 1');
		assert.equal(record.scheduledTime, 'Sunday · 2:00 PM');
	});
});

describe('Sunday B doubles MBD2', () => {
	const mbd2Page = parseMatchPage(read('psl-mbd2-match.html'));

	it('reads MBD2 Disalvo/Artman over Estepan/Bray 6-15, 15-10, 15-8 on Court 3', () => {
		assert.equal(mbd2Page.winnerName, 'Steve Disalvo / Kyle Artman');
		assert.equal(mbd2Page.score, '6-15, 15-10, 15-8');
		assert.equal(mbd2Page.court, 'Court 3');
		const { record, quarantine } = resolveCode(mbdDraw, 'MBD2', mbd2Page);
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 2);
		assert.equal(record.score, '6-15, 15-10, 15-8');
		assert.equal(record.court, 'Court 3');
		assert.equal(record.scheduledTime, 'Sunday · 2:00 PM');
		assert.match(record.player1 ?? '', /Estepan/);
		assert.match(record.player2 ?? '', /Disalvo/);
	});
});

describe('Sunday Elite doubles MED1 final', () => {
	const med1Page = parseMatchPage(read('psl-med1-match.html'));

	it('reads MED1 Stubanas/Grantham over Bock/Money 10-15, 15-7, 11-6 on Court 2', () => {
		assert.equal(med1Page.winnerName, 'Wade Stubanas / Brian Grantham');
		assert.equal(med1Page.score, '10-15, 15-7, 11-6');
		assert.equal(med1Page.court, 'Court 2');
		const { record, quarantine } = resolveMatchResult({
			matchId: 'MED1',
			draw: {
				player1: 'Wade Stubanas / Brian Grantham',
				player2: 'Mike Bock / Terry Money',
				court: 'Court 3',
				scheduledTime: 'Sunday · 3:00 PM',
			},
			page: med1Page,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '10-15, 15-7, 11-6');
		assert.equal(record.court, 'Court 2');
		assert.equal(record.scheduledTime, 'Sunday · 3:00 PM');
	});
});

describe('Sunday 60+ M60+1 final', () => {
	const m601Page = parseMatchPage(read('psl-m601-match.html'));

	it('reads M60+1 Peco over Huck 15-2, 15-1 on Court 3', () => {
		assert.equal(m601Page.winnerName, 'Val Peco');
		assert.equal(m601Page.score, '15-2, 15-1');
		assert.equal(m601Page.court, 'Court 3');
		const { record, quarantine } = resolveMatchResult({
			matchId: 'M60+1',
			draw: {
				player1: 'Val Peco',
				player2: 'Dirk Huck',
				court: 'Court 2',
				scheduledTime: 'Sunday · 4:00 PM',
			},
			page: m601Page,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-2, 15-1');
		assert.equal(record.court, 'Court 3');
		assert.equal(record.scheduledTime, 'Sunday · 4:00 PM');
	});
});

describe('Sunday 50+ M50+1 final', () => {
	const m501Page = parseMatchPage(read('psl-m501-match.html'));

	it('reads M50+1 Peco over Schnellenberger 15-1, 15-4 on Court 1', () => {
		assert.equal(m501Page.winnerName, 'Tyson Peco');
		assert.equal(m501Page.score, '15-1, 15-4');
		assert.equal(m501Page.court, 'Court 1');
		const { record, quarantine } = resolveMatchResult({
			matchId: 'M50+1',
			draw: {
				player1: 'Tyson Peco',
				player2: 'Timothy Schnellenberger',
				court: 'Court 1',
				scheduledTime: 'Sunday · 4:00 PM',
			},
			page: m501Page,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-1, 15-4');
		assert.equal(record.court, 'Court 1');
		assert.equal(record.scheduledTime, 'Sunday · 4:00 PM');
	});
});

describe('Sunday B final MB1', () => {
	const mb1Page = parseMatchPage(read('psl-mb1-match.html'));

	it('reads MB1 Saunders over Kern 15-13, 12-15, 11-4 on Court 4', () => {
		assert.equal(mb1Page.winnerName, 'Elijah Saunders');
		assert.equal(mb1Page.score, '15-13, 12-15, 11-4');
		assert.equal(mb1Page.court, 'Court 4');
		const { record, quarantine } = resolveMatchResult({
			matchId: 'MB1',
			draw: {
				player1: 'Elijah Saunders',
				player2: 'Matt Kern',
				court: 'Court 2',
				scheduledTime: 'Sunday · 3:00 PM',
			},
			page: mb1Page,
		});
		assert.equal(quarantine, undefined);
		assert.equal(record.winner, 1);
		assert.equal(record.score, '15-13, 12-15, 11-4');
		assert.equal(record.court, 'Court 4');
		assert.equal(record.scheduledTime, 'Sunday · 3:00 PM');
	});
});

describe('Open doubles MOD pool', () => {
	const modRr = extractRoundRobinFromHtml(read('psl-mod-rr.html'));
	const mod1Page = parseMatchPage(read('psl-mod1-match.html'));

	it('reads Peco/Ros as the MOD pool winner and has no Kinkin', () => {
		assert.equal(modRr.matches.MOD3?.player1, 'Tyson Peco / Naomi Ros');
		assert.equal(modRr.matches.MOD3?.player2, 'Jack McDonald / Yelandi Rivero');
		assert.equal(modRr.matches.MOD3?.drawWinner, 1);
		assert.equal(modRr.matches.MOD3?.drawScore, '15-4, 15-6');
		assert.equal(modRr.matches.MOD1?.player2, 'Tyson Peco / Naomi Ros');
		assert.equal(modRr.matches.MOD1?.drawWinner, 2);
		assert.equal(modRr.matches.MOD1?.drawScore, '15-6, 15-8');
		assert.equal(mod1Page.winnerName, 'Tyson Peco / Naomi Ros');
		assert.equal(mod1Page.score, '15-6, 15-8');
		assert.equal(mod1Page.court, 'Court 4');
		assert.equal(read('psl-mod-rr.html').includes('Kinkin'), false);
	});
});

