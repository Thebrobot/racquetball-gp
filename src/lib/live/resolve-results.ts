/**
 * Combine the draw page and the per-match page into a publishable result.
 * The match page winner badge is required to publish a winner. Draw signals
 * (same-box border, RR "- W", later-round advancement) may only confirm or
 * quarantine — they never assign a winner on their own.
 */
import { matchWinnerSide, scoresEqual } from './r2-names';
import type { ParsedMatchPage } from './parse-match-page';
import { toMatchRecord, type DrawAdvancement, type MatchRecord, type ParsedDrawMatch } from './parse-r2';
import type { QuarantinedMatch } from './types';

export type ResolveInput = {
	matchId: string;
	divisionId?: string;
	draw: ParsedDrawMatch;
	page?: ParsedMatchPage | null;
	pageError?: string | null;
	advancements?: DrawAdvancement[];
};

export type ResolveOutput = {
	record: MatchRecord;
	/** True when we successfully read a match page (even if it has no winner). */
	resolved: boolean;
	quarantine?: QuarantinedMatch;
};

function pickSchedule(draw: ParsedDrawMatch, page?: ParsedMatchPage | null): { court?: string; scheduledTime?: string } {
	const court = page?.court ?? draw.court;
	const scheduledTime = page?.scheduledTime ?? draw.scheduledTime;
	const out: { court?: string; scheduledTime?: string } = {};
	if (court) out.court = court;
	if (scheduledTime) out.scheduledTime = scheduledTime;
	return out;
}

function advancementSides(
	advancements: DrawAdvancement[],
	player1: string | null | undefined,
	player2: string | null | undefined,
): { side: 1 | 2; score: string | null }[] {
	const hits: { side: 1 | 2; score: string | null }[] = [];
	for (const adv of advancements) {
		const side = matchWinnerSide(adv.name, player1, player2);
		if (side == null) continue;
		hits.push({ side, score: adv.score });
	}
	return hits;
}

export function resolveMatchResult(input: ResolveInput): ResolveOutput {
	const { matchId, divisionId, draw, page, pageError, advancements = [] } = input;
	const p1 = draw.player1 ?? page?.player1 ?? null;
	const p2 = draw.player2 ?? page?.player2 ?? null;
	const schedule = pickSchedule(draw, page);
	const base: MatchRecord = { player1: p1, player2: p2, ...schedule };

	const drawLooksFinished = draw.drawWinner != null || Boolean(draw.drawWinnerName) || Boolean(draw.drawScore);
	const q = (reason: string): ResolveOutput => ({
		record: base,
		resolved: Boolean(page),
		quarantine: { matchId, divisionId, reason },
	});

	if (pageError && drawLooksFinished) {
		return q(`match page unavailable: ${pageError}`);
	}

	if (!page) {
		if (drawLooksFinished) return q('explicit match-page winner missing');
		return { record: base, resolved: false };
	}

	if (page.ambiguous) return q('match page winner is ambiguous');

	const advHits = advancementSides(advancements, p1, p2);
	const advSides = new Set(advHits.map((h) => h.side));

	if (!page.winnerName) {
		if (draw.drawWinner != null || draw.drawWinnerName) {
			return q('draw marks a winner but the match page does not');
		}
		if (advSides.size === 1) {
			return q('draw advancement names a winner but the match page does not');
		}
		if (page.score) base.score = page.score;
		else if (draw.drawScore) base.score = draw.drawScore;
		return { record: base, resolved: true };
	}

	const pageSide = matchWinnerSide(page.winnerName, p1, p2);
	if (pageSide == null) {
		return q(`match page winner "${page.winnerName}" does not uniquely match either player`);
	}

	const drawSide = draw.drawWinnerName
		? matchWinnerSide(draw.drawWinnerName, p1, p2)
		: draw.drawWinner;
	if (drawSide != null && drawSide !== pageSide) {
		return q('draw box winner disagrees with match page');
	}
	if (advSides.size > 1) {
		return q('draw advancement names both players');
	}
	if (advSides.size === 1 && !advSides.has(pageSide)) {
		return q('draw advancement disagrees with match page');
	}

	const score = page.score ?? draw.drawScore ?? advHits.find((h) => h.side === pageSide)?.score ?? undefined;
	const record: MatchRecord = { ...base, winner: pageSide };
	if (score) record.score = score;
	return { record, resolved: true };
}

export function publishableRecord(parsed: ParsedDrawMatch, resolved?: ResolveOutput): MatchRecord {
	return resolved?.record ?? toMatchRecord(parsed);
}

export function resultFieldsEqual(a?: MatchRecord | null, b?: MatchRecord | null): boolean {
	if ((a?.winner ?? null) !== (b?.winner ?? null)) return false;
	return scoresEqual(a?.score, b?.score);
}
