/**
 * Decide which r2-push match pages to fetch, and recognize IP-block / captcha
 * bodies so we never treat them as a result or a blank scrape.
 */
import type { MatchRecord, ParsedDrawMatch } from './parse-r2';
import { scoresEqual } from './r2-names';

export const MATCH_PAGE_GAP_MS = 400;
export const R2_BLOCK_BACKOFF_MS = 5_000;

const GHOST = /^(tbd|bye)$/i;

export function htmlLooksLikeR2Block(html: string): boolean {
	const t = String(html ?? '').replace(/\s+/g, ' ').trim();
	if (!t) return false;
	if (/this ip has been blocked|ip has been blocked/i.test(t)) return true;
	if (/attention required\s*\|?\s*cloudflare/i.test(t)) return true;
	if (/cf-challenge|cf-browser-verification|just a moment\.\.\./i.test(t)) return true;
	if (/\bcaptcha\b/i.test(t) && t.length < 4_000) return true;
	if (/unusual traffic|access denied/i.test(t) && t.length < 2_000) return true;
	return false;
}

export function describeR2Block(html: string, max = 140): string {
	const compact = String(html ?? '').replace(/\s+/g, ' ').trim();
	return `R2 blocked this IP (${compact.length} bytes: ${compact.slice(0, max) || 'empty'})`;
}

export function isR2BlockedReason(reason?: string | null): boolean {
	return /R2 blocked this IP|this ip has been blocked|attention required|cf-challenge|cf-browser-verification|\bcaptcha\b/i.test(
		reason ?? '',
	);
}

function named(slot?: string | null): boolean {
	return Boolean(slot && !GHOST.test(slot.trim()));
}

/** Normalize `Court 4` / `Court #4` / `4` so a moved court still compares. */
export function normalizeCourt(court?: string | null): string | null {
	const raw = String(court ?? '').replace(/\s+/g, ' ').trim();
	if (!raw) return null;
	const n = raw.match(/(\d{1,2})\s*$/);
	return n ? `Court ${n[1]}` : raw;
}

/** Non-empty draw court that is not the court we already published. Blank draw court is not a disagreement. */
export function storedCourtDisagreesWithDraw(
	draw: ParsedDrawMatch,
	existing?: MatchRecord | null,
): boolean {
	const drawCourt = normalizeCourt(draw.court);
	const storedCourt = normalizeCourt(existing?.court);
	if (!drawCourt || !storedCourt) return false;
	return drawCourt !== storedCourt;
}

/** Draw box "changed" vs our store — empty draw court/time after Final is not a change. */
export function drawBoxChanged(draw: ParsedDrawMatch, existing?: MatchRecord | null): boolean {
	if (!existing) return true;
	if ((draw.player1 ?? null) !== (existing.player1 ?? null)) return true;
	if ((draw.player2 ?? null) !== (existing.player2 ?? null)) return true;
	if (storedCourtDisagreesWithDraw(draw, existing)) return true;
	if (draw.scheduledTime && draw.scheduledTime !== existing.scheduledTime) return true;
	if (draw.drawScore && !scoresEqual(draw.drawScore, existing.score)) return true;
	if (draw.drawWinner != null && draw.drawWinner !== existing.winner) return true;
	return false;
}

export function drawLooksFinished(draw: ParsedDrawMatch): boolean {
	return draw.drawWinner != null || Boolean(draw.drawWinnerName) || Boolean(draw.drawScore);
}

export function storeHasFinal(existing?: MatchRecord | null): boolean {
	return existing?.winner === 1 || existing?.winner === 2;
}

/**
 * Turn `Saturday · 9:00 AM` into an epoch ms in America/New_York on the
 * weekday nearest `now` (tournament weekends).
 */
export function scheduledSlotMs(scheduledTime: string | undefined, now: Date): number | null {
	const m = scheduledTime?.match(
		/^(Friday|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday)\s*·\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i,
	);
	if (!m) return null;
	const wantDay = m[1]!.toLowerCase();
	let hour = Number(m[2]);
	const minute = Number(m[3]);
	const mer = m[4]!.toUpperCase();
	if (mer === 'PM' && hour < 12) hour += 12;
	if (mer === 'AM' && hour === 12) hour = 0;

	const tz = 'America/New_York';
	for (let delta = -3; delta <= 4; delta++) {
		const probe = new Date(now.getTime() + delta * 86_400_000);
		const day = probe.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
		if (day.toLowerCase() !== wantDay) continue;
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).formatToParts(probe);
		const y = parts.find((p) => p.type === 'year')?.value;
		const mo = parts.find((p) => p.type === 'month')?.value;
		const d = parts.find((p) => p.type === 'day')?.value;
		if (!y || !mo || !d) continue;
		const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
		for (const offset of ['-04:00', '-05:00']) {
			const stamp = Date.parse(`${y}-${mo}-${d}T${clock}${offset}`);
			if (!Number.isFinite(stamp)) continue;
			const check = new Date(stamp).toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
			if (check.toLowerCase() === wantDay) return stamp;
		}
	}
	return null;
}

/** On court now, or due in the next 30 minutes / started in the last 2 hours. */
export function isMatchInProgress(scheduledTime: string | undefined, now = new Date()): boolean {
	const slot = scheduledSlotMs(scheduledTime, now);
	if (slot == null) return false;
	const before = 30 * 60 * 1000;
	const after = 2 * 60 * 60 * 1000;
	const t = now.getTime();
	return t >= slot - before && t <= slot + after;
}

/**
 * Fetch a match page only when the draw box changed, the match is on court
 * (or just finished) and we do not yet have a final, or a stored final's court
 * disagrees with a non-empty court on the draw. Never refetch an unchanged
 * finished match. A blank R2 court is not a reason to refetch.
 */
export function shouldFetchMatchPage(
	draw: ParsedDrawMatch,
	existing?: MatchRecord | null,
	now = new Date(),
): boolean {
	if (!draw.r2MatchId) return false;
	// Finished + stored court ≠ draw court → one r2-push refetch to reconcile.
	if (drawLooksFinished(draw) && storedCourtDisagreesWithDraw(draw, existing)) return true;
	const storedFinal = storeHasFinal(existing);
	const changed = drawBoxChanged(draw, existing);
	if (storedFinal && !changed) return false;
	if (changed) return true;
	if (drawLooksFinished(draw) && !storedFinal) return true;
	if (!storedFinal && named(draw.player1) && named(draw.player2) && isMatchInProgress(draw.scheduledTime, now)) {
		return true;
	}
	return false;
}

export function r2BlockSummary(scraped: {
	r2Blocked?: boolean;
	r2BlockedCount?: number;
	errors?: string[];
}): { r2Blocked: boolean; r2BlockedCount: number; lastError: string | null } {
	const count = scraped.r2BlockedCount ?? 0;
	const blocked = Boolean(scraped.r2Blocked) || count > 0;
	if (blocked) {
		return {
			r2Blocked: true,
			r2BlockedCount: count,
			lastError: `R2 blocked this IP (${count} request${count === 1 ? '' : 's'})`,
		};
	}
	const errors = scraped.errors ?? [];
	return {
		r2Blocked: false,
		r2BlockedCount: 0,
		lastError: errors.length ? errors.join('; ').slice(0, 400) : null,
	};
}
