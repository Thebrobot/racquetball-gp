import {
	lbData,
	LB_DIVISIONS_BY_CATEGORY,
	LB_CATEGORY_HEADING,
	isDivisionInCategory,
	isValidLbCategory,
	type LbCategory,
	PENDING_ROW,
	leaderboardTotal,
	getSortedRows,
	formatPlayerInitials,
	isPendingPlaceholder,
} from '../data/leaderboard';
import { getPlayerImageForDisplay } from '../data/player-images';
import { getPlayerSlug } from '../data/players';

function esc(s: string): string {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
	return esc(s).replace(/'/g, '&#39;');
}

let currentTab: LbCategory = 'singles';

const LB_SESSION_KEY = 'lb:lastDivByCat';

function readDivisionSession(): Partial<Record<LbCategory, string>> {
	try {
		const raw = sessionStorage.getItem(LB_SESSION_KEY);
		if (!raw) return {};
		return JSON.parse(raw) as Partial<Record<LbCategory, string>>;
	} catch {
		return {};
	}
}

function writeDivisionForCurrentTab(divisionId: string) {
	try {
		const map = readDivisionSession();
		map[currentTab] = divisionId;
		sessionStorage.setItem(LB_SESSION_KEY, JSON.stringify(map));
	} catch {
		/* ignore */
	}
}

function rebuildDivisionSelect() {
	const sel = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!sel) return;
	const list = LB_DIVISIONS_BY_CATEGORY[currentTab];
	sel.innerHTML = list.map((d) => `<option value="${escAttr(d.id)}">${esc(d.label)}</option>`).join('');
	const map = readDivisionSession();
	const want = map[currentTab];
	const pick = want && list.some((x) => x.id === want) ? want : (list[0]?.id ?? '');
	sel.value = pick;
}

function syncUrl() {
	const sel = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!sel) return;
	const params = new URLSearchParams(window.location.search);
	params.set('event', currentTab);
	params.set('division', sel.value);
	window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

type LiveWeekendEntry = {
	slug: string;
	name: string;
	dateRange: string;
	cityLine: string;
	startDate: string;
	endDate: string;
	watchLiveUrl: string | null;
};

function parseRangeInstant(dateStr: string, isEnd = false): number {
	return new Date(`${dateStr}T${isEnd ? '23:59:59' : '00:00:00'}`).getTime();
}

function findLiveWeekendEvent(entries: LiveWeekendEntry[], now = Date.now()): LiveWeekendEntry | null {
	const live = entries
		.map((e) => ({
			e,
			start: parseRangeInstant(e.startDate, false),
			end: parseRangeInstant(e.endDate, true),
		}))
		.filter(({ start, end }) => now >= start && now <= end)
		.sort((a, b) => b.start - a.start);
	return live[0]?.e ?? null;
}

function livePromoDismissKey(event: LiveWeekendEntry): string {
	return `gp:livePromoDismissed:${event.slug}:${event.endDate}`;
}

function initLiveWeekendPromo() {
	const dataEl = document.getElementById('gp-live-weekend-data');
	const root = document.getElementById('gp-live-weekend-promo');
	const titleEl = document.getElementById('gp-live-weekend-title');
	const subEl = document.getElementById('gp-live-weekend-sub');
	const actionsEl = document.getElementById('gp-live-weekend-actions');
	const closeBtn = document.getElementById('gp-live-weekend-close');
	if (!dataEl || !root || !titleEl || !subEl || !actionsEl || !closeBtn) return;

	const panel = root;
	const close = closeBtn;

	let entries: LiveWeekendEntry[];
	try {
		entries = JSON.parse(dataEl.textContent || '[]') as LiveWeekendEntry[];
	} catch {
		return;
	}
	if (!Array.isArray(entries) || !entries.length) return;

	const liveEvent = findLiveWeekendEvent(entries);
	if (!liveEvent) return;

	const dismissStorageKey = livePromoDismissKey(liveEvent);
	try {
		if (localStorage.getItem(dismissStorageKey) === '1') return;
	} catch {
		/* ignore */
	}

	titleEl.textContent = liveEvent.name;
	subEl.textContent = `${liveEvent.dateRange} · ${liveEvent.cityLine}`;

	const parts: string[] = [];
	if (liveEvent.watchLiveUrl) {
		parts.push(
			`<a class="gp-live-weekend-promo__btn gp-live-weekend-promo__btn--primary" href="${escAttr(liveEvent.watchLiveUrl)}" rel="noopener noreferrer" target="_blank">Watch live on Facebook</a>`,
		);
	}
	const bracketsHref = `/events/${liveEvent.slug}#brackets`;
	const participantsHref = `/events/${liveEvent.slug}/participants`;
	parts.push(
		`<a class="gp-live-weekend-promo__btn gp-live-weekend-promo__btn--ghost" href="${escAttr(bracketsHref)}">Brackets &amp; schedule</a>`,
	);
	parts.push(
		`<a class="gp-live-weekend-promo__btn gp-live-weekend-promo__btn--ghost" href="${escAttr(participantsHref)}">Participants</a>`,
	);
	actionsEl.innerHTML = parts.join('');

	function dismiss() {
		try {
			localStorage.setItem(dismissStorageKey, '1');
		} catch {
			/* ignore */
		}
		panel.classList.remove('gp-live-weekend-promo--visible');
		panel.setAttribute('aria-hidden', 'true');
		panel.setAttribute('hidden', '');
		document.removeEventListener('keydown', onDocKey);
	}

	function onDocKey(e: KeyboardEvent) {
		if (e.key === 'Escape') dismiss();
	}

	close.addEventListener('click', dismiss);

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const delayMs = reducedMotion ? 0 : 800;

	window.setTimeout(() => {
		panel.removeAttribute('hidden');
		panel.setAttribute('aria-hidden', 'false');
		void panel.offsetWidth;
		panel.classList.add('gp-live-weekend-promo--visible');
		document.addEventListener('keydown', onDocKey);
	}, delayMs);
}

function initNavDrawer() {
	const btn = document.getElementById('gp-nav-menu-btn') as HTMLButtonElement | null;
	const backdrop = document.querySelector<HTMLElement>('.nav-drawer-backdrop');
	const navPanel = document.getElementById('gp-primary-nav');
	const register = document.querySelector<HTMLAnchorElement>('.nav-pill .nav-register');
	const drawerClose = document.getElementById('gp-nav-drawer-close');
	if (!btn || !backdrop || !navPanel) return;

	const menuBtn = btn;
	const navBackdrop = backdrop;
	const primaryNav = navPanel;

	const mq = window.matchMedia('(max-width: 640px)');

	function isMobile() {
		return mq.matches;
	}

	function applyPanelState() {
		const mobile = isMobile();
		menuBtn.setAttribute('aria-hidden', mobile ? 'false' : 'true');
		menuBtn.tabIndex = mobile ? 0 : -1;
		if (!mobile) {
			document.documentElement.classList.remove('nav-drawer-open');
			menuBtn.setAttribute('aria-expanded', 'false');
			primaryNav.removeAttribute('inert');
			primaryNav.removeAttribute('aria-hidden');
			navBackdrop.setAttribute('aria-hidden', 'true');
			const label = menuBtn.querySelector('.visually-hidden');
			if (label) label.textContent = 'Open menu';
			return;
		}
		const open = document.documentElement.classList.contains('nav-drawer-open');
		primaryNav.toggleAttribute('inert', !open);
		primaryNav.setAttribute('aria-hidden', open ? 'false' : 'true');
		navBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
		menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
		const label = menuBtn.querySelector('.visually-hidden');
		if (label) label.textContent = open ? 'Close menu' : 'Open menu';
	}

	function setOpen(open: boolean) {
		if (!isMobile()) return;
		document.documentElement.classList.toggle('nav-drawer-open', open);
		applyPanelState();
	}

	menuBtn.addEventListener('click', () => {
		if (!isMobile()) return;
		setOpen(!document.documentElement.classList.contains('nav-drawer-open'));
	});
	navBackdrop.addEventListener('click', () => setOpen(false));
	primaryNav.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) =>
		a.addEventListener('click', () => setOpen(false)),
	);
	register?.addEventListener('click', () => setOpen(false));
	drawerClose?.addEventListener('click', () => setOpen(false));
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') setOpen(false);
	});
	mq.addEventListener('change', applyPanelState);
	window.addEventListener('resize', applyPanelState);
	applyPanelState();
}

function setLbTab(tab: string) {
	currentTab = tab as LbCategory;
	document.querySelectorAll('.lb-tab[data-lb-tab]').forEach((b) => {
		b.classList.toggle('active', (b as HTMLElement).dataset.lbTab === tab);
	});
	rebuildDivisionSelect();
	syncUrl();
	renderLb();
}

function onLbDivisionChange() {
	const sel = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!sel) return;
	writeDivisionForCurrentTab(sel.value);
	syncUrl();
	renderLb();
}

function goToStandings(category: LbCategory, division: string, scroll = true) {
	if (!isDivisionInCategory(category, division)) return;
	currentTab = category;
	document.querySelectorAll('.lb-tab[data-lb-tab]').forEach((b) => {
		b.classList.toggle('active', (b as HTMLElement).dataset.lbTab === category);
	});
	rebuildDivisionSelect();
	const sel = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (sel) {
		sel.value = division;
		writeDivisionForCurrentTab(division);
	}
	syncUrl();
	renderLb();
	if (scroll) {
		document.getElementById('lb-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		document.getElementById('divSelect')?.focus({ preventScroll: true });
	}
}

function initLeaderboardPage() {
	const sel = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!sel) return;

	const params = new URLSearchParams(window.location.search);
	const ev = params.get('event');
	const div = params.get('division');
	if (ev && div && isValidLbCategory(ev) && isDivisionInCategory(ev, div)) {
		currentTab = ev;
		document.querySelectorAll('.lb-tab[data-lb-tab]').forEach((b) => {
			b.classList.toggle('active', (b as HTMLElement).dataset.lbTab === ev);
		});
		rebuildDivisionSelect();
		sel.value = div;
		writeDivisionForCurrentTab(div);
		syncUrl();
		renderLb();
	} else {
		rebuildDivisionSelect();
		renderLb();
	}

	document.getElementById('lb-overview')?.addEventListener('click', (e) => {
		if ((e.target as HTMLElement).closest('a.lb-overview-name-link')) return;
		const card = (e.target as HTMLElement).closest<HTMLElement>('[data-lb-event][data-lb-division]');
		if (!card) return;
		const cat = card.dataset.lbEvent;
		const division = card.dataset.lbDivision;
		if (cat && division && isValidLbCategory(cat) && isDivisionInCategory(cat, division)) {
			goToStandings(cat, division, true);
		}
	});
}

function renderLbPlayerAvatar(r: { name: string; image?: string }, cssPx = 40): string {
	const src = getPlayerImageForDisplay(r.name, cssPx) ?? r.image;
	if (src) {
		return `<img class="lb-player-avatar" src="${escAttr(src)}" alt="" width="${cssPx}" height="${cssPx}" loading="lazy" decoding="async" />`;
	}
	return `<span class="lb-player-avatar lb-player-avatar--fallback" aria-hidden="true">${esc(formatPlayerInitials(r.name))}</span>`;
}

function renderLb() {
	const tbody = document.getElementById('lb-tbody');
	if (!tbody) return;
	const divSelect = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!divSelect) return;
	const div = divSelect.value;
	const catData = lbData[currentTab];
	let rows = catData && catData[div] ? [...catData[div]] : [];
	if (!rows.length) {
		rows = [PENDING_ROW];
	}
	rows.sort((a, b) => leaderboardTotal(b) - leaderboardTotal(a));
	const maxPts = rows.length ? rows[0].s1 + rows[0].s2 : 1;
	tbody.innerHTML = rows
		.map((r, i) => {
			const total = r.s1 + r.s2;
			const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
			const medals = ['🥇', '🥈', '🥉'];
			const rankDisp =
				i < 3 ? `<span class="lb-medal">${medals[i]}</span>` : `<span class="${rankClass}">${i + 1}</span>`;
			const pctFill = maxPts > 0 ? Math.round((total / maxPts) * 100) : 0;
			const badgeMap = { q: 'badge-q', pace: 'badge-pace', chase: 'badge-chase' };
			const badgeLabel = { q: 'Qualified', pace: 'On Pace', chase: 'Chasing' };
			const noteHtml = r.note
				? `<span style="font-size:13px;color:var(--green);display:block;">${esc(r.note)}</span>`
				: '';
			const nameHtml = isPendingPlaceholder(r)
				? `<span class="lb-player-name">${esc(r.name)}</span>`
				: `<a class="lb-player-name lb-player-name-link" href="/players/${escAttr(getPlayerSlug(r.name))}">${esc(r.name)}</a>`;
			return `<tr>
      <td class="lb-rank-cell">${rankDisp}</td>
      <td>
        <div class="lb-player-cell">
          ${renderLbPlayerAvatar(r)}
          <div class="lb-player-text">
            ${nameHtml}
            <span class="lb-player-city">${esc(r.city)}</span>
            ${noteHtml}
            <div class="lb-progress-bar"><div class="lb-progress-fill" style="width:${pctFill}%"></div></div>
          </div>
        </div>
      </td>
      <td class="lb-stops right hide-mobile">${r.s1 || '-'}</td>
      <td class="lb-stops right hide-mobile">${r.s2 || '-'}</td>
      <td class="lb-pts-cell ${i === 0 ? 'leader' : ''}">${total}</td>
      <td class="lb-stops right hide-mobile">${r.wins ?? 0}</td>
      <td class="lb-stops right hide-mobile">${r.place ?? '-'}</td>
      <td class="lb-stops right hide-mobile">${r.attendance ?? 0}/4</td>
      <td class="lb-status-cell"><span class="lb-badge ${badgeMap[r.status]}">${badgeLabel[r.status]}</span></td>
    </tr>`;
		})
		.join('');
	updateLbContextLine();
	renderLbSpotlight();
}

function updateLbContextLine() {
	const el = document.getElementById('lb-context-line');
	const sel = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!el || !sel) return;
	const divLabel = sel.options[sel.selectedIndex]?.text?.trim() ?? '';
	el.textContent = `${LB_CATEGORY_HEADING[currentTab]} · ${divLabel}`;
}

const SPOTLIGHT_MEDALS = ['🥇', '🥈', '🥉'];

function renderLbSpotlight() {
	const host = document.getElementById('lb-spotlight-cards');
	if (!host) return;
	const divSelect = document.getElementById('divSelect') as HTMLSelectElement | null;
	if (!divSelect) return;
	const div = divSelect.value;
	const rows = getSortedRows(currentTab, div, true).slice(0, 3);

	host.innerHTML = rows
		.map((r, i) => {
			const total = leaderboardTotal(r);
			const medal = SPOTLIGHT_MEDALS[i] ?? '';
			const badgeMap = { q: 'badge-q', pace: 'badge-pace', chase: 'badge-chase' };
			const badgeLabel = { q: 'Qualified', pace: 'On Pace', chase: 'Chasing' };
			const mediaInner = (() => {
				const src = getPlayerImageForDisplay(r.name, 120) ?? r.image;
				if (src) {
					return `<img class="lb-spot-media-img" src="${escAttr(src)}" alt="" width="120" height="120" loading="lazy" decoding="async" />`;
				}
				return `<span class="lb-spot-media-initials" aria-hidden="true">${esc(formatPlayerInitials(r.name))}</span>`;
			})();
			const mediaClass =
				getPlayerImageForDisplay(r.name, 120) ?? r.image
					? 'lb-spot-media'
					: 'lb-spot-media lb-spot-media--fallback';
			const taglineHtml = r.tagline ? `<p class="lb-spot-tagline">${esc(r.tagline)}</p>` : '';
			const noteHtml = r.note ? `<p class="lb-spot-note">${esc(r.note)}</p>` : '';
			const nameHtml = isPendingPlaceholder(r)
				? `<h3 class="lb-spot-name">${esc(r.name)}</h3>`
				: `<h3 class="lb-spot-name"><a class="lb-spot-name-link" href="/players/${escAttr(getPlayerSlug(r.name))}">${esc(r.name)}</a></h3>`;
			return `<article class="lb-spot-card">
        <div class="${mediaClass}">
          <span class="lb-spot-rank-badge">${medal}</span>
          ${mediaInner}
        </div>
        <div class="lb-spot-card-body">
          ${nameHtml}
          <p class="lb-spot-city">${esc(r.city)}</p>
          ${taglineHtml}
          ${noteHtml}
          <p class="lb-spot-pts"><strong>${total}</strong> pts</p>
          <span class="lb-badge ${badgeMap[r.status]}">${badgeLabel[r.status]}</span>
        </div>
      </article>`;
		})
		.join('');
}

// ── SEASON STRIP AUTO-SCROLL ────────────────────────────────────────────────
// Clones the stop items for seamless looping, then scrolls at a fixed
// pixel-per-second rate using delta-time so speed is frame-rate independent.
// Starts with the "next" event visible and pauses on hover/touch.

function initSeasonStrip() {
	const strip = document.querySelector<HTMLElement>('.season-strip');
	if (!strip) return;
	const track = strip.querySelector<HTMLElement>('.strip-track');
	if (!track) return;

	const origItems = Array.from(
		track.querySelectorAll<HTMLElement>('.stop-item'),
	);
	if (origItems.length === 0) return;

	// ── Clone items once for seamless loop ──
	origItems.forEach((item) => {
		const clone = item.cloneNode(true) as HTMLElement;
		clone.setAttribute('aria-hidden', 'true');
		track.appendChild(clone);
	});

	// Wait for layout so offsetLeft / offsetWidth are populated
	requestAnimationFrame(() => {
		// Width of a single copy of all stops
		const singleWidth = origItems.reduce((sum, el) => sum + el.offsetWidth, 0);
		if (singleWidth === 0) return;

		// Find the offset of the "next" stop so we start there
		const nextItem = origItems.find((el) => el.classList.contains('next'));
		const startOffset = nextItem ? nextItem.offsetLeft : 0;

		let currentX = -startOffset;
		const SPEED_PX_PER_S = 60; // pixels per second, comfortable reading pace
		let lastTime = performance.now();
		let paused = false;

		const pause = () => {
			paused = true;
		};
		const resume = () => {
			paused = false;
			lastTime = performance.now(); // reset timer so no jump on resume
		};

		strip.addEventListener('mouseenter', pause);
		strip.addEventListener('mouseleave', resume);
		strip.addEventListener('touchstart', pause, { passive: true });
		strip.addEventListener('touchend', () =>
			setTimeout(resume, 1500),
		);

		function tick(now: number) {
			const delta = now - lastTime;
			lastTime = now;

			if (!paused) {
				currentX -= (SPEED_PX_PER_S * delta) / 1000;
				// Seamless loop: once we've scrolled past the first copy, jump back
				if (currentX <= -singleWidth) {
					currentX += singleWidth;
				}
				track!.style.transform = `translateX(${currentX}px)`;
			}

			requestAnimationFrame(tick);
		}

		// Set initial position before first paint
		track.style.transform = `translateX(${currentX}px)`;
		requestAnimationFrame(tick);
	});
}

// ── BRACKET LAYOUT + SVG CONNECTORS ────────────────────────────────────────
// CSS cannot reliably align bracket columns when match heights vary, so we
// use JavaScript to measure actual DOM positions and then:
//   1. Apply margin-top to matches in later rounds so each is vertically
//      centred between the two "feeder" matches from the previous round.
//   2. Draw an SVG overlay with ⊢-shaped connectors that use the real
//      pixel positions, guaranteed to line up no matter the content size.

function initBracketLayout() {
	document.querySelectorAll<HTMLElement>('.bracket-grid').forEach((grid) => {
		void layoutAndDrawBracket(grid);
	});

	let resizeTimer: ReturnType<typeof setTimeout>;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			document.querySelectorAll<HTMLElement>('.bracket-grid').forEach((grid) => {
				grid
					.querySelectorAll<HTMLElement>('.bracket-match')
					.forEach((m) => (m.style.marginTop = ''));
				const champ = grid.querySelector<HTMLElement>('.bracket-champion');
				if (champ) champ.style.marginTop = '';
				void layoutAndDrawBracket(grid);
			});
		}, 150);
	});
}

async function layoutAndDrawBracket(grid: HTMLElement) {
	// Handle both wrapped (mobile) and unwrapped (desktop) structures
	const track = grid.querySelector<HTMLElement>('.bracket-track');
	const rounds = track
		? Array.from(track.querySelectorAll<HTMLElement>('.bracket-round'))
		: Array.from(grid.querySelectorAll<HTMLElement>(':scope > .bracket-round'));
	if (rounds.length < 2) return;

	// ── 1. Reset any previously applied margins ──
	grid
		.querySelectorAll<HTMLElement>('.bracket-match')
		.forEach((m) => (m.style.marginTop = ''));

	const isMobile = window.matchMedia('(max-width: 640px)').matches;

	// On mobile, the ESPN-style slider handles layout; skip margin
	// positioning and connectors entirely (only 1 round visible at a time).
	if (isMobile) {
		return;
	}

	// ── 2. Position each round's matches relative to their feeders ──
	for (let rIdx = 1; rIdx < rounds.length; rIdx++) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

		const prevRound = rounds[rIdx - 1]!;
		const currRound = rounds[rIdx]!;

		const prevMatches = Array.from(
			prevRound.querySelectorAll<HTMLElement>('.bracket-match'),
		);
		const currMatches = Array.from(
			currRound.querySelectorAll<HTMLElement>('.bracket-match'),
		);
		if (prevMatches.length === 0 || currMatches.length === 0) continue;

		if (prevMatches.length <= currMatches.length) continue;

		const gridTop = grid.getBoundingClientRect().top;

		const prevCenters = prevMatches.map((m) => {
			const r = m.getBoundingClientRect();
			return r.top + r.height / 2 - gridTop;
		});
		const currCenters = currMatches.map((m) => {
			const r = m.getBoundingClientRect();
			return r.top + r.height / 2 - gridTop;
		});

		let cumShift = 0;
		for (let mIdx = 0; mIdx < currMatches.length; mIdx++) {
			const c1 =
				prevCenters[mIdx * 2] ?? prevCenters[prevCenters.length - 1] ?? 0;
			const c2 = prevCenters[mIdx * 2 + 1] ?? c1;
			const targetCenter = (c1 + c2) / 2;

			const rawAdj = targetCenter - (currCenters[mIdx] ?? 0);
			const adj = rawAdj - cumShift;

			const existing =
				parseFloat(currMatches[mIdx]!.style.marginTop || '0') || 0;
			currMatches[mIdx]!.style.marginTop = `${existing + adj}px`;
			cumShift += adj;
		}
	}

	// ── 3. Align champion card with the Final match ──
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	const champEl = grid.querySelector<HTMLElement>('.bracket-champion');
	const lastRound = rounds[rounds.length - 1];
	if (champEl && lastRound) {
		champEl.style.marginTop = '';
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const finalMatch = lastRound.querySelector<HTMLElement>('.bracket-match');
		if (finalMatch) {
			const gridTop = grid.getBoundingClientRect().top;
			const rF = finalMatch.getBoundingClientRect();
			const rC = champEl.getBoundingClientRect();
			const finalCenter = rF.top + rF.height / 2 - gridTop;
			const champCenter = rC.top + rC.height / 2 - gridTop;
			const adj = finalCenter - champCenter;
			const existing = parseFloat(champEl.style.marginTop || '0') || 0;
			champEl.style.marginTop = `${existing + adj}px`;
		}
	}

	// ── 4. Draw SVG connectors once final layout has settled ──
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	drawBracketConnectors(grid, rounds);
}

function drawBracketConnectors(grid: HTMLElement, rounds: HTMLElement[]) {
	grid.querySelector('.bracket-svg-connectors')?.remove();

	const gridRect = grid.getBoundingClientRect();
	const scrollLeft = grid.scrollLeft;
	const scrollTop = grid.scrollTop;
	const { clientLeft, clientTop } = grid;
	/** Viewport position -> coordinates in the grid scrollable content box (matches absolute SVG 0,0). */
	const cx = (viewportX: number) => viewportX - gridRect.left + scrollLeft - clientLeft;
	const cy = (viewportY: number) => viewportY - gridRect.top + scrollTop - clientTop;

	const lightShell = grid.closest('.bracket-shell') !== null;
	const strokeMuted = lightShell ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255,255,255,0.6)';
	const strokeWinner = lightShell ? 'rgba(22, 163, 74, 0.45)' : 'rgba(74,222,128,0.7)';
	const lineW = lightShell ? '1.5' : '2';
	const svgNS = 'http://www.w3.org/2000/svg';

	const svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
	svg.classList.add('bracket-svg-connectors');
	svg.setAttribute('aria-hidden', 'true');
	// Size the SVG to cover the entire scrollable content area
	svg.setAttribute('width', String(grid.scrollWidth));
	svg.setAttribute('height', String(grid.scrollHeight));

	// ── Connectors between consecutive bracket rounds ──
	for (let rIdx = 0; rIdx < rounds.length - 1; rIdx++) {
		const currRound = rounds[rIdx]!;
		const nextRound = rounds[rIdx + 1]!;

		const currMatches = Array.from(
			currRound.querySelectorAll<HTMLElement>('.bracket-match'),
		);
		const nextMatches = Array.from(
			nextRound.querySelectorAll<HTMLElement>('.bracket-match'),
		);
		if (currMatches.length === 0 || nextMatches.length === 0) continue;

		// Skip connector drawing for non-standard transitions where the current
		// round has fewer matches than the next (preliminary → seeded round).
		if (currMatches.length <= nextMatches.length) continue;

		for (let mIdx = 0; mIdx < nextMatches.length; mIdx++) {
			const f1 = currMatches[mIdx * 2];
			const f2 = currMatches[mIdx * 2 + 1];
			const target = nextMatches[mIdx];
			if (!f1 || !target) continue;

			const r1 = f1.getBoundingClientRect();
			const r2 = f2?.getBoundingClientRect();
			const rT = target.getBoundingClientRect();

			const y1 = cy(r1.top + r1.height / 2);
			const y2 = r2 ? cy(r2.top + r2.height / 2) : y1;
			const yT = cy(rT.top + rT.height / 2);
			const yJunction = (y1 + y2) / 2;

			// Use the round's bounding box for consistent X anchors so lines
			// don't appear inside the match cards themselves.
			const xRight = cx(r1.right);
			const xLeft = cx(rT.left);
			// Junction X is midway through the gap between the two rounds
			const xJunction = xRight + (xLeft - xRight) / 2;

			const hasW1 = f1.querySelector('.bracket-winner') !== null;
			const hasW2 = f2 ? f2.querySelector('.bracket-winner') !== null : false;
			const col1 = hasW1 ? strokeWinner : strokeMuted;
			const col2 = hasW2 ? strokeWinner : strokeMuted;
			const colJ = hasW1 || hasW2 ? strokeWinner : strokeMuted;

			// Feeder 1: horizontal arm from match right edge to junction X
			svgLine(svg, xRight, y1, xJunction, y1, col1, lineW);

			if (f2 && r2) {
				// Feeder 2: horizontal arm
				svgLine(svg, cx(r2.right), y2, xJunction, y2, col2, lineW);
				// Vertical bar between the two arms
				svgLine(svg, xJunction, y1, xJunction, y2, colJ, lineW);
			}

			// Outgoing horizontal from junction to next match left edge.
			// yJunction should equal yT after the layout step above.
			svgLine(svg, xJunction, yJunction, xLeft, yT, colJ, lineW);
		}
	}

	// ── Connector from Final match to Champion card (horizontal) ──
	const champEl = grid.querySelector<HTMLElement>('.bracket-champion');
	const lastRound = rounds[rounds.length - 1];
	if (champEl && lastRound) {
		const finalMatch = lastRound.querySelector<HTMLElement>('.bracket-match');
		if (finalMatch) {
			const rF = finalMatch.getBoundingClientRect();
			const rC = champEl.getBoundingClientRect();
			const y = cy(rF.top + rF.height / 2);
			const xFRight = cx(rF.right);
			const xCLeft = cx(rC.left);
			const hasWinner = finalMatch.querySelector('.bracket-winner') !== null;
			const colChamp = hasWinner ? strokeWinner : strokeMuted;
			svgLine(svg, xFRight, y, xCLeft, y, colChamp, lineW);
		}
	}

	grid.insertBefore(svg, grid.firstChild);
}

function svgLine(
	svg: SVGSVGElement,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	stroke: string,
	strokeWidth = '2',
) {
	const svgNS = 'http://www.w3.org/2000/svg';
	const line = document.createElementNS(svgNS, 'line') as SVGLineElement;
	line.setAttribute('x1', x1.toFixed(1));
	line.setAttribute('y1', y1.toFixed(1));
	line.setAttribute('x2', x2.toFixed(1));
	line.setAttribute('y2', y2.toFixed(1));
	line.setAttribute('stroke', stroke);
	line.setAttribute('stroke-width', strokeWidth);
	line.setAttribute('stroke-linecap', 'round');
	svg.appendChild(line);
}

function initBracketTabs() {
	const isMobile = window.matchMedia('(max-width: 640px)').matches;

	document.querySelectorAll<HTMLElement>('.bracket-tab-nav').forEach((nav) => {
		const container = nav.closest<HTMLElement>('.bracket-block, .bracket-shell');
		if (!container) return;
		const grid = container.querySelector<HTMLElement>('.bracket-grid');
		if (!grid) return;

		const btns = Array.from(nav.querySelectorAll<HTMLButtonElement>('.bracket-tab-btn'));
		// Handle both wrapped (mobile) and unwrapped (desktop) structures
		const track = grid.querySelector<HTMLElement>('.bracket-track');
		const rounds = track
			? Array.from(track.querySelectorAll<HTMLElement>('.bracket-round'))
			: Array.from(grid.querySelectorAll<HTMLElement>(':scope > .bracket-round'));
		let activeRound = 0;

		function setActiveTab(idx: number) {
			btns.forEach((b, i) => b.classList.toggle('active', i === idx));
			btns[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
		}

		if (isMobile && rounds.length > 0) {
			// ── ESPN-style slider: wrap rounds + champion in a track div ──
			const track = document.createElement('div');
			track.className = 'bracket-track';
			rounds.forEach((r) => track.appendChild(r));
			const champ = grid.querySelector<HTMLElement>('.bracket-champion');
			if (champ) track.appendChild(champ);
			grid.appendChild(track);

			const columns = champ ? [...rounds, champ] : [...rounds];
			const maxIdx = columns.length - 1;

			function slideTo(idx: number) {
				const col = columns[idx];
				if (!col) return;
				// Slide formula: -(column.offsetLeft - 12) for 12px left inset
				// so active column doesn't flush against edge, creating peek effect
				const newLeft = -(col.offsetLeft - 12);
				track.style.left = `${newLeft}px`;
				activeRound = idx;
				setActiveTab(idx);
			}

			btns.forEach((btn, idx) => {
				btn.addEventListener('click', () => slideTo(idx));
			});

			// ── Touch swipe support ──
			let touchStartX = 0;
			grid.addEventListener('touchstart', (e) => {
				touchStartX = e.touches[0]!.clientX;
			}, { passive: true });

			grid.addEventListener('touchend', (e) => {
				const dx = touchStartX - e.changedTouches[0]!.clientX;
				if (Math.abs(dx) > 50) {
					const next = dx > 0
						? Math.min(activeRound + 1, maxIdx)
						: Math.max(activeRound - 1, 0);
					slideTo(next);
				}
			}, { passive: true });

			// Set initial position
			slideTo(0);
			return;
		}

		// ── Desktop: unwrap track if exists (from mobile resize), then normal scroll ──
		if (track) {
			// Unwrap: move rounds and champion back to grid, remove track
			const champ = track.querySelector<HTMLElement>('.bracket-champion');
			rounds.forEach((r) => grid.appendChild(r));
			if (champ) grid.appendChild(champ);
			track.remove();
		}

		btns.forEach((btn, idx) => {
			btn.addEventListener('click', () => {
				const target = rounds[idx];
				if (target) {
					grid.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
				}
				setActiveTab(idx);
			});
		});

		let scrollTimer: ReturnType<typeof setTimeout>;
		grid.addEventListener('scroll', () => {
			clearTimeout(scrollTimer);
			scrollTimer = setTimeout(() => {
				const scrollPos = grid.scrollLeft;
				let closest = 0;
				let minDist = Infinity;
				for (let i = 0; i < rounds.length; i++) {
					const dist = Math.abs(rounds[i]!.offsetLeft - scrollPos);
					if (dist < minDist) {
						minDist = dist;
						closest = i;
					}
				}
				if (closest !== activeRound) {
					activeRound = closest;
					setActiveTab(closest);
				}
			}, 120);
		});
	});
}

function initHeroVideo() {
	const v = document.getElementById('hero-video') as HTMLVideoElement | null;
	if (!v) return;
	const reveal = () => {
		v.style.opacity = '1';
	};
	if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
		reveal();
	} else {
		v.addEventListener('canplay', reveal, { once: true });
	}
	void v.play().catch(() => {
		/* autoplay may be blocked; still show first frame when data loads */
	});
}

// ── LIVE ACTIVITY FEED ─────────────────────────────────────────────────────

const LIVE_ACTIVITY_URL = '/data/live-activity.json';
const LIVE_ACTIVITY_SEEN_KEY = 'gp:liveActivitySeenAt';
const LIVE_ACTIVITY_POLL_MS = 60_000;

type LiveActivityEvent = {
	id: string;
	at: string;
	type: string;
	divisionId: string;
	divisionLabel: string;
	matchId: string;
	headline: string;
	detail?: string;
	bracketHref: string;
};

type LiveActivityFeed = {
	lastUpdated: string | null;
	eventSlug: string;
	events: LiveActivityEvent[];
};

function formatRelativeTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const sec = Math.floor((Date.now() - d.getTime()) / 1000);
	if (sec < 60) return 'Just now';
	if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
	if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
	return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatSyncedAt(iso: string | null): string {
	if (!iso) return 'Not yet synced';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return 'Not yet synced';
	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
	});
}

function readLiveActivitySeenAt(): string | null {
	try {
		return localStorage.getItem(LIVE_ACTIVITY_SEEN_KEY);
	} catch {
		return null;
	}
}

function writeLiveActivitySeenAt(at: string) {
	try {
		localStorage.setItem(LIVE_ACTIVITY_SEEN_KEY, at);
	} catch {
		/* ignore */
	}
}

function latestEventAt(feed: LiveActivityFeed): string | null {
	const first = feed.events[0];
	return first?.at ?? feed.lastUpdated ?? null;
}

function hasUnreadLiveActivity(feed: LiveActivityFeed): boolean {
	const latest = latestEventAt(feed);
	if (!latest) return false;
	const seen = readLiveActivitySeenAt();
	if (!seen) return feed.events.length > 0;
	return latest > seen;
}

async function fetchLiveActivity(): Promise<LiveActivityFeed | null> {
	try {
		const res = await fetch(`${LIVE_ACTIVITY_URL}?t=${Date.now()}`, { cache: 'no-store' });
		if (!res.ok) return null;
		return (await res.json()) as LiveActivityFeed;
	} catch {
		return null;
	}
}

function renderLiveFeedCard(item: LiveActivityEvent, fresh: boolean): string {
	const detail = item.detail
		? `<p class="live-feed-detail">${esc(item.detail)}</p>`
		: '';
	return `<article class="live-feed-card${fresh ? ' live-feed-card--fresh' : ''}" data-at="${escAttr(item.at)}" data-id="${escAttr(item.id)}">
		<time class="live-feed-time" datetime="${escAttr(item.at)}">${esc(formatRelativeTime(item.at))}</time>
		<p class="live-feed-division">${esc(item.divisionLabel)}</p>
		<h3 class="live-feed-headline">${esc(item.headline)}</h3>
		${detail}
		<a class="live-feed-link" href="${escAttr(item.bracketHref)}">View bracket →</a>
	</article>`;
}

function renderLiveFeedList(feed: LiveActivityFeed, prevLastUpdated: string | null) {
	const list = document.getElementById('live-feed-list');
	if (!list) return;

	if (!feed.events.length) {
		list.innerHTML =
			'<p class="live-feed-empty" id="live-feed-empty">Waiting for bracket updates… Check back during match play.</p>';
		return;
	}

	const isNewSync = prevLastUpdated != null && feed.lastUpdated !== prevLastUpdated;
	list.innerHTML = feed.events
		.map((item, i) => renderLiveFeedCard(item, isNewSync && i === 0))
		.join('');
}

function updateLiveSyncLabel(feed: LiveActivityFeed) {
	const el = document.getElementById('live-sync-time');
	if (el) el.textContent = formatSyncedAt(feed.lastUpdated);
	const page = document.getElementById('live-updates-page');
	if (page && feed.lastUpdated) page.setAttribute('data-last-updated', feed.lastUpdated);
}

function updateBottomNavUnread(feed: LiveActivityFeed) {
	const tab = document.getElementById('gp-bottom-nav-live');
	if (!tab) return;
	tab.classList.toggle('gp-bottom-nav-item--unread', hasUnreadLiveActivity(feed));
}

function markLiveActivityRead(feed: LiveActivityFeed) {
	const at = latestEventAt(feed);
	if (at) writeLiveActivitySeenAt(at);
	updateBottomNavUnread(feed);
}

let liveActivityPollTimer: ReturnType<typeof setInterval> | null = null;
let livePageLastKnown: string | null = null;

function hydrateLiveFeedTimes() {
	document.querySelectorAll<HTMLElement>('[data-live-time]').forEach((el) => {
		const iso = el.getAttribute('data-live-time');
		if (iso) el.textContent = formatRelativeTime(iso);
	});
}

function onLiveActivityFeed(feed: LiveActivityFeed) {
	updateBottomNavUnread(feed);
	const page = document.getElementById('live-updates-page');
	if (!page) return;
	const prev = livePageLastKnown ?? page.getAttribute('data-last-updated');
	if (feed.lastUpdated !== prev) {
		renderLiveFeedList(feed, prev);
		updateLiveSyncLabel(feed);
		livePageLastKnown = feed.lastUpdated;
		page.setAttribute('data-last-updated', feed.lastUpdated ?? '');
	}
}

function startLiveActivityPolling() {
	const poll = async () => {
		if (document.visibilityState !== 'visible') return;
		const feed = await fetchLiveActivity();
		if (feed) onLiveActivityFeed(feed);
	};
	void poll();
	if (liveActivityPollTimer) clearInterval(liveActivityPollTimer);
	liveActivityPollTimer = setInterval(poll, LIVE_ACTIVITY_POLL_MS);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void poll();
	});
}

function initLiveActivity() {
	const tab = document.getElementById('gp-bottom-nav-live');
	const page = document.getElementById('live-updates-page');
	if (!tab && !page) return;

	if (page) {
		livePageLastKnown = page.getAttribute('data-last-updated');
		hydrateLiveFeedTimes();
		void fetchLiveActivity().then((feed) => {
			if (feed) markLiveActivityRead(feed);
		});
	}

	startLiveActivityPolling();
}

initNavDrawer();
initLiveWeekendPromo();
initLeaderboardPage();
initHeroVideo();
initBracketTabs();
initBracketLayout();
initSeasonStrip();
initLiveActivity();

type Win = Window &
	typeof globalThis & {
		setLbTab: typeof setLbTab;
		renderLb: typeof renderLb;
		onLbDivisionChange: typeof onLbDivisionChange;
		goToStandings: typeof goToStandings;
	};

const w = window as Win;
w.setLbTab = setLbTab;
w.renderLb = renderLb;
w.onLbDivisionChange = onLbDivisionChange;
w.goToStandings = goToStandings;
