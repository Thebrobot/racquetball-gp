/**
 * Standings row + podium HTML, shared by the server-rendered leaderboard page
 * and the client script that re-renders when the division changes. Keeping
 * one template means the two never drift.
 */
import {
	leaderboardTotal,
	formatPlayerInitials,
	isPendingPlaceholder,
	type LbRow,
} from '../data/leaderboard';
import { getPlayerImageForDisplay } from '../data/player-images';
import { getPlayerSlug } from '../data/players';

export function escHtml(s: string): string {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
export function escAttr(s: string): string {
	return escHtml(s).replace(/'/g, '&#39;');
}

const BADGE_CLASS = { q: 'badge-q', pace: 'badge-pace', chase: 'badge-chase' } as const;
const BADGE_LABEL = { q: 'Qualified', pace: 'On Pace', chase: 'Chasing' } as const;
const MEDALS = ['🥇', '🥈', '🥉'] as const;

function avatarHtml(r: LbRow, cssPx: number, cls: string): string {
	const src = getPlayerImageForDisplay(r.name, cssPx) ?? r.image;
	if (src) {
		return `<img class="${cls}" src="${escAttr(src)}" alt="" width="${cssPx}" height="${cssPx}" loading="lazy" decoding="async" />`;
	}
	return `<span class="${cls} ${cls}--fallback" aria-hidden="true">${escHtml(formatPlayerInitials(r.name))}</span>`;
}

function nameHtml(r: LbRow, cls: string): string {
	if (isPendingPlaceholder(r)) return `<span class="${cls}">${escHtml(r.name)}</span>`;
	return `<a class="${cls}" href="/players/${escAttr(getPlayerSlug(r.name))}">${escHtml(r.name)}</a>`;
}

/** One standings row. `place` is the assigned place (ties share a number). */
export function renderStandingsRow(r: LbRow, place: number, maxPts: number): string {
	const total = leaderboardTotal(r);
	const pct = maxPts > 0 ? Math.round((total / maxPts) * 100) : 0;
	const rank =
		place >= 1 && place <= 3
			? `<span class="lb2-medal" aria-label="Place ${place}">${MEDALS[place - 1]}</span>`
			: `<span class="lb2-rank-num">${place || '-'}</span>`;
	const stops = `${r.attendance ?? 0}/4`;
	const mini = [
		`L1 ${r.s1 || '–'}`,
		`L2 ${r.s2 || '–'}`,
		`${stops} stops`,
		`${r.wins ?? 0}W`,
	].join(' · ');
	const note = r.note ? `<span class="lb2-note">${escHtml(r.note)}</span>` : '';
	return `<div class="lb2-row lb2-row--${r.status}${place === 1 ? ' lb2-row--lead' : ''}" role="row">
  <span class="lb2-rank" role="cell">${rank}</span>
  <div class="lb2-player" role="cell">
    ${avatarHtml(r, 40, 'lb2-avatar')}
    <div class="lb2-player-text">
      ${nameHtml(r, 'lb2-name')}
      ${r.city ? `<span class="lb2-city">${escHtml(r.city)}</span>` : ''}
      ${note}
      <span class="lb2-mini">${mini} · <b class="lb2-mini-status">${BADGE_LABEL[r.status]}</b></span>
      <span class="lb2-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
    </div>
  </div>
  <span class="lb2-cell lb2-cell--wide" role="cell">${r.s1 || '–'}</span>
  <span class="lb2-cell lb2-cell--wide" role="cell">${r.s2 || '–'}</span>
  <span class="lb2-total" role="cell"><b>${total}</b><small>pts</small></span>
  <span class="lb2-cell lb2-cell--wide" role="cell">${r.wins ?? 0}</span>
  <span class="lb2-cell lb2-cell--wide" role="cell">${place || '-'}</span>
  <span class="lb2-cell lb2-cell--wide" role="cell">${stops}</span>
  <span class="lb2-status lb2-cell--wide" role="cell"><span class="lb-badge ${BADGE_CLASS[r.status]}">${BADGE_LABEL[r.status]}</span></span>
</div>`;
}

/** Compact podium: up to three tiles in a row. */
export function renderPodium(rows: LbRow[]): string {
	return rows
		.slice(0, 3)
		.map((r, i) => {
			const total = leaderboardTotal(r);
			return `<article class="lb2-tile lb2-tile--${i + 1}">
  <div class="lb2-tile-media">
    ${avatarHtml(r, 64, 'lb2-tile-avatar')}
    <span class="lb2-tile-medal" aria-hidden="true">${MEDALS[i]}</span>
  </div>
  ${nameHtml(r, 'lb2-tile-name')}
  ${r.city ? `<span class="lb2-tile-city">${escHtml(r.city)}</span>` : ''}
  <span class="lb2-tile-pts"><b>${total}</b> pts</span>
  <span class="lb-badge ${BADGE_CLASS[r.status]}">${BADGE_LABEL[r.status]}</span>
</article>`;
		})
		.join('');
}
