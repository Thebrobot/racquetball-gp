import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyResultsToEvent } from '../../data/events';
import { PORT_ST_LUCIE_EVENT } from '../../data/port-st-lucie-event';
import { LIVE_EVENTS } from './config';
import { parseMatchPage } from './parse-match-page';
import { extractRoundRobinFromHtml, extractSingleElimFromHtml } from './parse-r2';
import { resolveMatchResult } from './resolve-results';
import { applyActivityUpdates, applyMatchOverrides, detectActivityChanges, mergeOneMatch } from './scrape';

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
		const m605 = resolveMatchResult({ matchId: 'M60+5', draw: m60Draw.matches['M60+5']! });
		const m607 = resolveMatchResult({ matchId: 'M60+7', draw: m60Draw.matches['M60+7']! });
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

		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-age-60': {
				'M60+9': m609.record,
				'M60+5': m605.record,
				'M60+7': m607.record,
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
});

describe('merge keeps an unpublished score-without-winner undecided', () => {
	it('resolved match page without a winner does not inherit a previous winner', () => {
		const merged = mergeOneMatch(
			{ player1: 'Huck / Joseph', player2: 'McDonald / Rivero', winner: 1, score: 'WBF - No Show' },
			{ player1: 'Huck / Joseph', player2: 'McDonald / Rivero', score: 'WBF - No Show' },
			{ quarantined: false, resolved: true },
		);
		assert.equal(merged.winner, undefined);
	});
});
