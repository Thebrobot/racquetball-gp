/**
 * Live E2E against R2 Sports. Fetches real pages (no browser) for:
 *   TID 52059 — NMRA Tempe (round robin)
 *   TID 50993 — Junior Nationals (elim, RR, Olympic)
 *
 * Run: npm run test:r2-e2e
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { delay, divisionListUrl, drawOutUrl, fetchText, looksLikeR2Html, mapPool, matchPageUrl } from '../../src/lib/results/fetch.ts';
import { parseDivisionList } from '../../src/lib/results/parse-divisions.ts';
import { parseDrawPage } from '../../src/lib/results/parse-draw.ts';
import { parseMatchPage, parsedMatchesEqual } from '../../src/lib/results/parse-match.ts';
import { validateParsedMatch } from '../../src/lib/results/validate.ts';

const EXAMPLES = [
	{ tid: '52059', divID: 0, combinedID: 237423, label: '52059 RR MS3545' },
	{ tid: '50993', divID: 879, combinedID: 0, label: '50993 elim B10D' },
	{ tid: '50993', divID: 0, combinedID: 237267, label: '50993 RR 6/8 MB' },
	{ tid: '50993', divID: 0, combinedID: 237208, label: '50993 Olympic 10U Blue' },
] as const;

describe('R2 live pages (no browser)', () => {
	it('division lists are server-rendered and auto-discoverable', async () => {
		for (const tid of ['52059', '50993'] as const) {
			const { html } = await fetchText(divisionListUrl(tid));
			assert.ok(looksLikeR2Html(html), `TID ${tid} list missing viewBracket`);
			const divs = parseDivisionList(html);
			assert.ok(divs.length >= 10, `TID ${tid} discovered ${divs.length} divisions`);
			assert.ok(
				divs.every((d) => (d.divID === 0) !== (d.combinedID === 0) || d.divID !== d.combinedID),
				'exactly one of divID/combinedID should be non-zero',
			);
			if (tid === '52059') {
				assert.ok(divs.some((d) => d.combinedID === 237423));
			}
			if (tid === '50993') {
				assert.ok(divs.some((d) => d.divID === 879));
				assert.ok(divs.some((d) => d.combinedID === 237267));
				assert.ok(divs.some((d) => d.combinedID === 237208));
			}
			console.log(`  TID ${tid}: discovered ${divs.length} draws`);
		}
	});

	it('example draws yield match IDs and match pages agree on a second read', async () => {
		const summary: string[] = [];

		for (const [i, ex] of EXAMPLES.entries()) {
			if (i > 0) await delay(1500);
			const { url, html } = await fetchText(drawOutUrl(ex.tid, ex.divID, ex.combinedID));
			assert.ok(looksLikeR2Html(html), `${ex.label} draw was not HTML`);
			const draw = parseDrawPage(html, { divID: ex.divID, combinedID: ex.combinedID, finalUrl: url });
			assert.ok(draw.matches.length > 0, `${ex.label} had no viewAppMatch IDs`);

			const sample = draw.matches.slice(0, Math.min(draw.matches.length, 6));
			const reads = await mapPool(sample, 2, async (ref) => {
				const a = parseMatchPage((await fetchText(matchPageUrl(ex.tid, ref.r2MatchId))).html, ref.r2MatchId);
				await delay(400);
				const b = parseMatchPage((await fetchText(matchPageUrl(ex.tid, ref.r2MatchId))).html, ref.r2MatchId);
				assert.ok(parsedMatchesEqual(a, b), `${ex.label} ${ref.r2MatchId} disagreed across reads`);
				const issues = validateParsedMatch(a, 'flexible').filter((i) => i.level === 'error');
				return { ref, parsed: a, issues };
			});

			const withWinner = reads.filter((r) => r.parsed.winner === 1 || r.parsed.winner === 2);
			const named = withWinner.filter((r) => r.parsed.player1 && r.parsed.player2);
			const winnerOk = named.filter((r) => {
				const name = r.parsed.winner === 1 ? r.parsed.player1 : r.parsed.player2;
				return !!name && name.toUpperCase() !== 'BYE';
			});
			const junkScores = reads.filter((r) => r.parsed.score && /\d{3,}/.test(r.parsed.score));
			const parseOk = reads.filter((r) => r.parsed.player1 && (r.parsed.player2 || r.parsed.status === 'bye'));
			const hardErrors = reads.flatMap((r) => r.issues.filter((i) => i.level === 'error'));

			assert.equal(junkScores.length, 0, `${ex.label} produced junk scores`);
			assert.equal(winnerOk.length, named.length, `${ex.label} winner was not a match player`);
			assert.equal(hardErrors.length, 0, `${ex.label} hard validation errors: ${hardErrors.map((i) => i.message).join('; ')}`);

			const accuracy = reads.length ? (parseOk.length / reads.length) * 100 : 0;
			summary.push(
				`${ex.label}: ${draw.matches.length} match IDs, sampled ${reads.length}, ${withWinner.length} with winner, parse accuracy ${accuracy.toFixed(0)}% vs match pages`,
			);
			assert.ok(accuracy >= 95, `${ex.label} accuracy ${accuracy}%`);
		}

		console.log('\nE2E accuracy vs R2 match pages:');
		for (const line of summary) console.log(`  ${line}`);
	});
});
