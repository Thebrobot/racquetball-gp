import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIVE_EVENTS } from './config';
import type { ParsedDrawMatch } from './parse-r2';
import { ownDrawFinal, resolveMatchResult } from './resolve-results';
import {
	DRAW_ROTATION_PER_RUN,
	MATCH_PAGE_GAP_MS,
	R2_BLOCK_SKIP_RUNS,
	describeR2Block,
	drawBoxChanged,
	htmlLooksLikeR2Block,
	isMatchInFetchWindow,
	isMatchInProgress,
	isR2BlockedReason,
	nextSkipRunsRemaining,
	r2BlockSummary,
	selectDivisionCodesToScrape,
	shouldFetchMatchPage,
	shouldSkipBlockedRun,
	storedCourtDisagreesWithDraw,
} from './r2-match-fetch';
import { applyResultsToEvent } from '../../data/events';
import { PORT_ST_LUCIE_EVENT } from '../../data/port-st-lucie-event';
import { applyMatchOverrides, mergeOneMatch, mergeScrapedResults, turningFinal } from './scrape';
import { parseMatchPage } from './parse-match-page';

const IP_BLOCK = 'This IP has been blocked';
const CAPTCHA = `<!DOCTYPE html><html><head><title>Attention Required | Cloudflare</title></head>
		<body>Please enable cookies. cf-browser-verification captcha</body></html>`;

const m503Draw: ParsedDrawMatch = {
	player1: 'John Johnston',
	player2: 'Timothy Schnellenberger',
	r2MatchId: '4970003',
	scheduledTime: 'Saturday · 9:00 AM',
	court: 'Court 1',
	drawWinner: 2,
	drawWinnerName: 'Timothy Schnellenberger',
	drawScore: '11-15, 15-8, 11-7',
	drawWinnerSource: 'box-border',
};

const now1010 = new Date('2026-10-24T14:10:00.000Z'); // 10:10 AM EDT Saturday

describe('R2 IP block and captcha pages', () => {
	it('detects the 248-byte This IP has been blocked body', () => {
		assert.equal(htmlLooksLikeR2Block(IP_BLOCK), true);
		const padded = IP_BLOCK.padEnd(248, '.');
		assert.equal(padded.length, 248);
		assert.equal(htmlLooksLikeR2Block(padded), true);
		assert.match(describeR2Block(padded), /R2 blocked this IP/);
		assert.match(describeR2Block(padded), /248 bytes/);
	});

	it('detects Cloudflare captcha / challenge pages', () => {
		assert.equal(htmlLooksLikeR2Block(CAPTCHA), true);
		assert.equal(isR2BlockedReason(describeR2Block(CAPTCHA)), true);
	});

	it('does not treat a real match page as a block', () => {
		assert.equal(htmlLooksLikeR2Block('<div class="r2p-versus-side">Winner</div>'), false);
	});

	it('never publishes a draw result from a block page', () => {
		assert.ok(ownDrawFinal(m503Draw));
		const { record, quarantine } = resolveMatchResult({
			matchId: 'M50+3',
			draw: m503Draw,
			page: null,
			pageError: describeR2Block(IP_BLOCK),
			pageHtml: IP_BLOCK,
		});
		assert.ok(quarantine);
		assert.match(quarantine.reason, /R2 blocked this IP/);
		assert.equal(record.winner, undefined);
	});

	it('keeps the last published winner when the incoming page is a block', () => {
		const incoming = resolveMatchResult({
			matchId: 'M50+3',
			draw: m503Draw,
			page: null,
			pageError: describeR2Block(IP_BLOCK),
			pageHtml: IP_BLOCK,
		});
		const kept = mergeOneMatch(
			{
				player1: 'John Johnston',
				player2: 'Timothy Schnellenberger',
				winner: 2,
				score: '11-15, 15-8, 11-7',
				court: 'Court 1',
			},
			incoming.record,
			{ quarantined: true, resolved: false },
		);
		assert.equal(kept.winner, 2);
		assert.equal(kept.score, '11-15, 15-8, 11-7');
		assert.equal(kept.court, 'Court 1');
	});

	it('surfaces r2Blocked + lastError for /api/live/status', () => {
		const summary = r2BlockSummary({ r2Blocked: true, r2BlockedCount: 3, errors: [] });
		assert.equal(summary.r2Blocked, true);
		assert.equal(summary.r2BlockedCount, 3);
		assert.match(summary.lastError ?? '', /R2 blocked this IP \(3 requests\)/);
	});
});

describe('M50+3 override publishes Schnellenberger as player 2', () => {
	it('uses winner 2 because Johnston is player 1 on the draw and in the store', () => {
		assert.equal(m503Draw.player1, 'John Johnston');
		assert.equal(m503Draw.player2, 'Timothy Schnellenberger');
		const divisions = applyMatchOverrides('port-st-lucie-open', {
			'mens-age-50': {
				'M50+3': {
					player1: 'John Johnston',
					player2: 'Timothy Schnellenberger',
					court: 'Court 1',
					scheduledTime: 'Saturday · 9:00 AM',
				},
			},
		});
		const row = divisions['mens-age-50']?.['M50+3'];
		assert.equal(row?.winner, 2);
		assert.equal(row?.score, '11-15, 15-8, 11-7');
		assert.equal(row?.player2, 'Timothy Schnellenberger');
	});

	it('next sync publishes M50+3 from the override even when r2-push is blocked', () => {
		const blocked = resolveMatchResult({
			matchId: 'M50+3',
			divisionId: 'mens-age-50',
			draw: m503Draw,
			page: null,
			pageError: describeR2Block(IP_BLOCK),
			pageHtml: IP_BLOCK,
		});
		const merged = mergeScrapedResults(
			LIVE_EVENTS.psl,
			{
				lastUpdated: '2026-10-24T14:00:00.000Z',
				divisions: {
					'mens-age-50': {
						'M50+3': {
							player1: 'John Johnston',
							player2: 'Timothy Schnellenberger',
							court: 'Court 1',
							scheduledTime: 'Saturday · 9:00 AM',
						},
					},
				},
			},
			{
				scraped: 1,
				matchesWithResults: 0,
				divisions: { 'mens-age-50': { 'M50+3': blocked.record } },
				divisionReports: [],
				errors: [],
				quarantined: blocked.quarantine ? [blocked.quarantine] : [],
				resolvedMatchIds: [],
				audit: [],
				r2Blocked: true,
				r2BlockedCount: 1,
			},
			{ lastUpdated: null, eventSlug: 'port-st-lucie-open', events: [] },
			'2026-10-24T14:15:00.000Z',
		);
		const row = merged.results.divisions['mens-age-50']?.['M50+3'];
		assert.equal(row?.winner, 2);
		assert.equal(row?.score, '11-15, 15-8, 11-7');
		assert.equal(
			merged.quarantined.find((q) => q.matchId === 'M50+3'),
			undefined,
		);
	});
});

describe('match-page fetch volume', () => {
	it('does not refetch an unchanged finished match', () => {
		assert.equal(
			shouldFetchMatchPage(m503Draw, {
				player1: 'John Johnston',
				player2: 'Timothy Schnellenberger',
				winner: 2,
				score: '11-15, 15-8, 11-7',
				court: 'Court 1',
				scheduledTime: 'Saturday · 9:00 AM',
			}, now1010),
			false,
		);
	});

	it('fetches a recently finished match that is not yet final in our store', () => {
		assert.equal(
			shouldFetchMatchPage(
				m503Draw,
				{
					player1: 'John Johnston',
					player2: 'Timothy Schnellenberger',
					court: 'Court 1',
					scheduledTime: 'Saturday · 9:00 AM',
				},
				now1010,
			),
			true,
		);
	});

	it('fetches when the draw box score or winner changed', () => {
		assert.equal(
			drawBoxChanged(m503Draw, {
				player1: 'John Johnston',
				player2: 'Timothy Schnellenberger',
				winner: 1,
				score: '15-1, 15-1',
			}),
			true,
		);
		assert.equal(
			shouldFetchMatchPage(
				m503Draw,
				{
					player1: 'John Johnston',
					player2: 'Timothy Schnellenberger',
					winner: 1,
					score: '15-1, 15-1',
				},
				now1010,
			),
			true,
		);
	});

	it('treats a Saturday 9:00 AM slot as in progress at 10:10 AM EDT', () => {
		assert.equal(isMatchInProgress('Saturday · 9:00 AM', now1010), true);
		assert.equal(isMatchInProgress('Sunday · 2:00 PM', now1010), false);
	});

	it('does not fetch an upcoming match that has not started and is not finished', () => {
		const upcoming: ParsedDrawMatch = {
			player1: 'Tyson Peco',
			player2: 'Richard Unzueta',
			r2MatchId: '4970004',
			scheduledTime: 'Saturday · 2:00 PM',
			court: 'Court 2',
		};
		assert.equal(
			shouldFetchMatchPage(
				upcoming,
				{
					player1: 'Tyson Peco',
					player2: 'Richard Unzueta',
					scheduledTime: 'Saturday · 2:00 PM',
					court: 'Court 2',
				},
				now1010,
			),
			false,
		);
	});

	it('does not treat a finished draw that dropped #court as a change', () => {
		assert.equal(
			drawBoxChanged(
				{ ...m503Draw, court: undefined, scheduledTime: undefined },
				{
					player1: 'John Johnston',
					player2: 'Timothy Schnellenberger',
					winner: 2,
					score: '11-15, 15-8, 11-7',
					court: 'Court 1',
					scheduledTime: 'Saturday · 9:00 AM',
				},
			),
			false,
		);
	});
});

const mad5Draw: ParsedDrawMatch = {
	player1: 'Brendan Anthony / Jose Gallegos',
	player2: 'Paul Sotolongo / Kyle Artman',
	r2MatchId: '4972807',
	scheduledTime: 'Saturday · 10:00 AM',
	court: 'Court 4',
	drawWinner: 2,
	drawWinnerName: 'Paul Sotolongo / Kyle Artman',
	drawScore: 'WBF - No Show',
	drawWinnerSource: 'box-border',
};

const mad5StoredCourt3 = {
	player1: 'Brendan Anthony / Jose Gallegos',
	player2: 'Paul Sotolongo / Kyle Artman',
	winner: 2 as const,
	score: 'WBF - No Show',
	court: 'Court 3',
	scheduledTime: 'Saturday · 10:00 AM',
};

const mad5PageHtml = `
	<div class="r2p-versus-grid">
		<div class="r2p-versus-side"><div class="r2p-side-names"><span>Brendan Anthony</span><span>Jose Gallegos</span></div></div>
		<div class="r2p-versus-chip">VS</div>
		<div class="r2p-versus-side r2p-side-bottom r2p-side-winner">
			<span class="r2p-winner-badge">&#10003; Winner</span>
			<div class="r2p-side-names"><span>Paul Sotolongo</span><span>Kyle Artman</span></div>
		</div>
	</div>
	<div class="r2p-match-result"><strong>WBF - No Show</strong><span class="r2p-win-method">WBF - No Show</span></div>
	<span class="r2p-final-badge">Final</span>
	<p class="r2p-scheduled">Court 4 &middot; Scheduled Oct 24, 2026 at 10:00 AM</p>
`;

describe('MAD5 court reconcile (stored Court 3, R2 Court 4)', () => {
	it('override publishes Court 4 on the next sync', () => {
		const divisions = applyMatchOverrides('port-st-lucie-open', {
			'mens-doubles-a': {
				MAD5: {
					player1: 'Brendan Anthony / Jose Gallegos',
					player2: 'Paul Sotolongo / Kyle Artman',
					winner: 2,
					score: 'WBF - No Show',
					court: 'Court 3',
					scheduledTime: 'Saturday · 10:00 AM',
				},
			},
		});
		assert.equal(divisions['mens-doubles-a']?.MAD5?.court, 'Court 4');
		assert.equal(divisions['mens-doubles-a']?.MAD5?.winner, 2);
	});

	it('refetches a finished match when the stored court disagrees with a non-empty draw court', () => {
		assert.equal(storedCourtDisagreesWithDraw(mad5Draw, mad5StoredCourt3), true);
		assert.equal(shouldFetchMatchPage(mad5Draw, mad5StoredCourt3, now1010), true);
	});

	it('does not refetch when the finished draw dropped its court', () => {
		const courtless = { ...mad5Draw, court: undefined };
		assert.equal(storedCourtDisagreesWithDraw(courtless, mad5StoredCourt3), false);
		assert.equal(shouldFetchMatchPage(courtless, mad5StoredCourt3, now1010), false);
	});

	it('does not refetch an unchanged finished match whose court still matches', () => {
		assert.equal(
			shouldFetchMatchPage(mad5Draw, { ...mad5StoredCourt3, court: 'Court 4' }, now1010),
			false,
		);
	});

	it('takes court and time from the match page that first captures the result, not the stored court', () => {
		const page = parseMatchPage(mad5PageHtml);
		assert.equal(page.court, 'Court 4');
		assert.equal(page.scheduledTime, 'Saturday · 10:00 AM');
		assert.match(page.winnerName ?? '', /Sotolongo/);

		const existing = {
			player1: 'Brendan Anthony / Jose Gallegos',
			player2: 'Paul Sotolongo / Kyle Artman',
			court: 'Court 3',
			scheduledTime: 'Saturday · 10:00 AM',
		};
		const resolved = resolveMatchResult({
			matchId: 'MAD5',
			divisionId: 'mens-doubles-a',
			draw: { ...mad5Draw, court: 'Court 3' },
			page,
			pageHtml: mad5PageHtml,
		});
		assert.equal(resolved.record.winner, 2);
		assert.equal(resolved.record.court, 'Court 4');
		assert.equal(turningFinal(existing, resolved.record), true);

		const merged = mergeOneMatch(existing, resolved.record, {
			quarantined: false,
			resolved: true,
		});
		assert.equal(merged.court, 'Court 4');
		assert.equal(merged.scheduledTime, 'Saturday · 10:00 AM');
		assert.equal(merged.winner, 2);
		assert.equal(merged.score, 'WBF - No Show');
	});

	it('does not let an unresolved snapshot court overwrite a stored final court', () => {
		const merged = mergeOneMatch(
			{
				player1: 'Ben Mordkovich',
				player2: 'Matt Kern',
				winner: 2,
				score: '15-5, 15-8',
				court: 'Court 1',
				scheduledTime: 'Saturday · 1:00 PM',
			},
			{
				player1: 'Ben Mordkovich',
				player2: 'Matt Kern',
				winner: 2,
				score: '15-5, 15-8',
				court: 'Court 3',
				scheduledTime: 'Saturday · 1:00 PM',
			},
			{ quarantined: false, resolved: false },
		);
		assert.equal(merged.court, 'Court 1');
	});

	it('prefers a resolved R2 match-page court over the stored final court', () => {
		const merged = mergeOneMatch(
			{
				player1: 'Ben Mordkovich',
				player2: 'Matt Kern',
				winner: 2,
				score: '15-5, 15-8',
				court: 'Court 3',
				scheduledTime: 'Saturday · 1:00 PM',
			},
			{
				player1: 'Ben Mordkovich',
				player2: 'Matt Kern',
				winner: 2,
				score: '15-5, 15-8',
				court: 'Court 1',
				scheduledTime: 'Saturday · 1:00 PM',
			},
			{ quarantined: false, resolved: true },
		);
		assert.equal(merged.court, 'Court 1');
	});

	it('never wipes a stored court when the incoming R2 court is blank', () => {
		const merged = mergeOneMatch(
			mad5StoredCourt3,
			{
				player1: 'Brendan Anthony / Jose Gallegos',
				player2: 'Paul Sotolongo / Kyle Artman',
				winner: 2,
				score: 'WBF - No Show',
			},
			{ quarantined: false, resolved: true },
		);
		assert.equal(merged.court, 'Court 3');
		assert.equal(merged.scheduledTime, 'Saturday · 10:00 AM');
	});

	it('overlays Court 4 onto the static PSL event (Court 2)', () => {
		const staticMad5 = PORT_ST_LUCIE_EVENT.divisionDetails
			.find((d) => d.id === 'mens-doubles-a')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'MAD5');
		assert.equal(staticMad5?.court, 'Court 2');

		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-doubles-a': {
				MAD5: {
					player1: 'Brendan Anthony / Jose Gallegos',
					player2: 'Paul Sotolongo / Kyle Artman',
					winner: 2,
					score: 'WBF - No Show',
					court: 'Court 4',
					scheduledTime: 'Saturday · 10:00 AM',
				},
			},
		});
		const live = event.divisionDetails
			.find((d) => d.id === 'mens-doubles-a')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'MAD5');
		assert.equal(live?.court, 'Court 4');
	});
});

const mb8Draw: ParsedDrawMatch = {
	player1: 'Scott Gill',
	player2: 'Elijah Saunders',
	r2MatchId: '4972796',
	scheduledTime: 'Saturday · 1:00 PM',
};

const mb8StoredCourt1 = {
	player1: 'Scott Gill',
	player2: 'Elijah Saunders',
	court: 'Court 1',
	scheduledTime: 'Saturday · 1:00 PM',
};

const mb8PageNoCourt = `
	<div class="r2p-versus-grid">
		<div class="r2p-versus-side"><div class="r2p-side-names"><span>Scott Gill</span></div></div>
		<div class="r2p-versus-chip">VS</div>
		<div class="r2p-versus-side r2p-side-bottom"><div class="r2p-side-names"><span>Elijah Saunders</span></div></div>
	</div>
	<div class="r2p-match-result"><strong></strong></div>
	<p class="r2p-scheduled">Scheduled Oct 24, 2026 at 1:00 PM</p>
`;

const mb8PageCourt1 = `
	<div class="r2p-versus-grid">
		<div class="r2p-versus-side"><div class="r2p-side-names"><span>Scott Gill</span></div></div>
		<div class="r2p-versus-chip">VS</div>
		<div class="r2p-versus-side r2p-side-bottom"><div class="r2p-side-names"><span>Elijah Saunders</span></div></div>
	</div>
	<div class="r2p-match-result"><strong></strong></div>
	<p class="r2p-scheduled">Court 1 &middot; Scheduled Oct 24, 2026 at 1:00 PM</p>
`;

describe('non-final court mirrors the R2 match page (MB8)', () => {
	it('clears a stored court when the match is not final and the match page has no court', () => {
		const page = parseMatchPage(mb8PageNoCourt);
		assert.equal(page.court, undefined);
		const resolved = resolveMatchResult({
			matchId: 'MB8',
			divisionId: 'mens-singles-b',
			draw: mb8Draw,
			page,
			pageHtml: mb8PageNoCourt,
		});
		assert.equal(resolved.resolved, true);
		assert.equal(resolved.record.winner, undefined);
		assert.equal(resolved.record.court, undefined);

		const merged = mergeOneMatch(mb8StoredCourt1, resolved.record, {
			quarantined: false,
			resolved: true,
		});
		assert.equal(merged.court, undefined);
		assert.equal(merged.scheduledTime, 'Saturday · 1:00 PM');
		assert.equal(merged.winner, undefined);
	});

	it('keeps a stored court when a final match page/draw is blank', () => {
		const merged = mergeOneMatch(
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
		assert.equal(merged.court, 'Court 1');
		assert.equal(merged.scheduledTime, 'Friday · 5:30 PM');
	});

	it('keeps the court when the draw is blank but the match page still has one', () => {
		const page = parseMatchPage(mb8PageCourt1);
		assert.equal(page.court, 'Court 1');
		const resolved = resolveMatchResult({
			matchId: 'MB8',
			divisionId: 'mens-singles-b',
			draw: mb8Draw,
			page,
			pageHtml: mb8PageCourt1,
		});
		assert.equal(resolved.record.court, 'Court 1');
		const merged = mergeOneMatch(mb8StoredCourt1, resolved.record, {
			quarantined: false,
			resolved: true,
		});
		assert.equal(merged.court, 'Court 1');
	});

	it('does not clear a stored court from a draw-only blank (no match page yet)', () => {
		const resolved = resolveMatchResult({
			matchId: 'MB8',
			divisionId: 'mens-singles-b',
			draw: mb8Draw,
			page: null,
		});
		assert.equal(resolved.resolved, false);
		const merged = mergeOneMatch(mb8StoredCourt1, resolved.record, {
			quarantined: false,
			resolved: false,
		});
		assert.equal(merged.court, 'Court 1');
	});

	it('fetches a not-final match whose stored court remains after the draw dropped it', () => {
		const now1230 = new Date('2026-10-24T16:30:00.000Z'); // 12:30 PM EDT — in the 1:00 PM window
		assert.equal(shouldFetchMatchPage(mb8Draw, mb8StoredCourt1, now1230), true);
	});

	it('does not refetch an unchanged not-final match outside the current window', () => {
		assert.equal(shouldFetchMatchPage(mb8Draw, mb8StoredCourt1, now1010), false);
	});

	it('clears the static PSL MB8 court when live results have no court', () => {
		const staticMb8 = PORT_ST_LUCIE_EVENT.divisionDetails
			.find((d) => d.id === 'mens-singles-b')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'MB8');
		assert.ok(staticMb8?.court);

		const event = applyResultsToEvent(PORT_ST_LUCIE_EVENT, {
			'mens-singles-b': {
				MB8: {
					player1: 'Scott Gill',
					player2: 'Elijah Saunders',
					scheduledTime: 'Saturday · 1:00 PM',
				},
			},
		});
		const live = event.divisionDetails
			.find((d) => d.id === 'mens-singles-b')
			?.rounds?.flatMap((r) => r.matches)
			.find((m) => m.matchId === 'MB8');
		assert.equal(live?.court, undefined);
		assert.equal(live?.scheduledTime, 'Saturday · 1:00 PM');
	});
});

const now1410 = new Date('2026-10-24T18:10:00.000Z'); // 2:10 PM EDT Saturday — the blocked run

describe('fetch window, draw rotation, and multi-run backoff', () => {
	it('spaces match-page fetches by 1000ms and skips the next two runs after a block', () => {
		assert.equal(MATCH_PAGE_GAP_MS, 1_000);
		assert.equal(R2_BLOCK_SKIP_RUNS, 2);
		assert.equal(DRAW_ROTATION_PER_RUN, 2);
		assert.equal(shouldSkipBlockedRun(2), true);
		assert.equal(shouldSkipBlockedRun(1), true);
		assert.equal(shouldSkipBlockedRun(0), false);
		assert.equal(shouldSkipBlockedRun(2, true), false);
		assert.equal(nextSkipRunsRemaining(0, true), 2);
		assert.equal(nextSkipRunsRemaining(2, false), 1);
		assert.equal(nextSkipRunsRemaining(1, false), 0);
		assert.equal(nextSkipRunsRemaining(2, false, true), 0);
		assert.equal(nextSkipRunsRemaining(2, true, true), 2);
	});

	it('treats Saturday 2:00 PM as in the 60min-past / 90min-ahead window at 2:10 PM EDT', () => {
		assert.equal(isMatchInFetchWindow('Saturday · 2:00 PM', now1410), true);
		assert.equal(isMatchInFetchWindow('Saturday · 1:00 PM', now1410), true);
		assert.equal(isMatchInFetchWindow('Saturday · 9:00 AM', now1410), false);
		assert.equal(isMatchInFetchWindow('Sunday · 2:00 PM', now1410), false);
	});

	it('fetches an unchanged not-final match only while it sits in the current window', () => {
		const sat2: ParsedDrawMatch = {
			player1: 'Val Peco',
			player2: 'John Wuchte',
			r2MatchId: '4972808',
			scheduledTime: 'Saturday · 2:00 PM',
			court: 'Court 3',
		};
		const stored = {
			player1: 'Val Peco',
			player2: 'John Wuchte',
			scheduledTime: 'Saturday · 2:00 PM',
			court: 'Court 3',
		};
		assert.equal(shouldFetchMatchPage(sat2, stored, now1410), true);
		assert.equal(shouldFetchMatchPage(sat2, stored, now1010), false);
	});

	it('still fetches a newly-final or changed not-final match outside the window', () => {
		const finished: ParsedDrawMatch = {
			player1: 'Val Peco',
			player2: 'John Wuchte',
			r2MatchId: '4972808',
			scheduledTime: 'Saturday · 2:00 PM',
			drawWinner: 1,
			drawScore: '15-1, 15-2',
		};
		assert.equal(
			shouldFetchMatchPage(
				finished,
				{ player1: 'Val Peco', player2: 'John Wuchte', scheduledTime: 'Saturday · 2:00 PM' },
				now1010,
			),
			true,
		);
		assert.equal(
			shouldFetchMatchPage(
				{ ...finished, player2: 'Larry Prince Jr.' },
				{ player1: 'Val Peco', player2: 'John Wuchte', scheduledTime: 'Saturday · 2:00 PM' },
				now1010,
			),
			true,
		);
	});

	it('always scrapes windowed divisions and rotates one or two others', () => {
		const codes = ['MO', 'ME', 'MA', 'MB', 'M50+', 'M60+', 'MBD', 'MAD'];
		const inWindow = new Set(['M60+', 'M50+', 'MBD']);
		const picked = selectDivisionCodesToScrape(codes, inWindow, now1410);
		assert.ok(picked.includes('M60+'));
		assert.ok(picked.includes('M50+'));
		assert.ok(picked.includes('MBD'));
		assert.equal(picked.length, 5);
		const idle = picked.filter((c) => !inWindow.has(c));
		assert.equal(idle.length, 2);
		const later = selectDivisionCodesToScrape(codes, inWindow, new Date(now1410.getTime() + 5 * 60 * 1000));
		assert.notDeepEqual(idle, later.filter((c) => !inWindow.has(c)));
	});
});
