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
} from '../data/leaderboard';

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

function initNavDrawer() {
	const btn = document.getElementById('gp-nav-menu-btn') as HTMLButtonElement | null;
	const backdrop = document.querySelector<HTMLElement>('.nav-drawer-backdrop');
	const navPanel = document.getElementById('gp-primary-nav');
	const register = document.querySelector<HTMLAnchorElement>('.nav-pill .nav-register');
	if (!btn || !backdrop || !navPanel) return;

	const mq = window.matchMedia('(max-width: 640px)');

	function isMobile() {
		return mq.matches;
	}

	function applyPanelState() {
		const mobile = isMobile();
		btn.setAttribute('aria-hidden', mobile ? 'false' : 'true');
		btn.tabIndex = mobile ? 0 : -1;
		if (!mobile) {
			document.documentElement.classList.remove('nav-drawer-open');
			btn.setAttribute('aria-expanded', 'false');
			navPanel.removeAttribute('inert');
			navPanel.removeAttribute('aria-hidden');
			backdrop.setAttribute('aria-hidden', 'true');
			const label = btn.querySelector('.visually-hidden');
			if (label) label.textContent = 'Open menu';
			return;
		}
		const open = document.documentElement.classList.contains('nav-drawer-open');
		navPanel.toggleAttribute('inert', !open);
		navPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
		backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
		btn.setAttribute('aria-expanded', open ? 'true' : 'false');
		const label = btn.querySelector('.visually-hidden');
		if (label) label.textContent = open ? 'Close menu' : 'Open menu';
	}

	function setOpen(open: boolean) {
		if (!isMobile()) return;
		document.documentElement.classList.toggle('nav-drawer-open', open);
		applyPanelState();
	}

	btn.addEventListener('click', () => {
		if (!isMobile()) return;
		setOpen(!document.documentElement.classList.contains('nav-drawer-open'));
	});
	backdrop.addEventListener('click', () => setOpen(false));
	navPanel.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) =>
		a.addEventListener('click', () => setOpen(false)),
	);
	register?.addEventListener('click', () => setOpen(false));
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
		const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lb-event][data-lb-division]');
		if (!btn) return;
		const cat = btn.dataset.lbEvent;
		const division = btn.dataset.lbDivision;
		if (cat && division && isValidLbCategory(cat) && isDivisionInCategory(cat, division)) {
			goToStandings(cat, division, true);
		}
	});
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
			return `<tr>
      <td class="lb-rank-cell">${rankDisp}</td>
      <td>
        <span class="lb-player-name">${esc(r.name)}</span>
        <span class="lb-player-city">${esc(r.city)}</span>
        ${noteHtml}
        <div class="lb-progress-bar"><div class="lb-progress-fill" style="width:${pctFill}%"></div></div>
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
			const mediaInner = r.image
				? `<img class="lb-spot-media-img" src="${esc(r.image)}" alt="" width="320" height="400" loading="lazy" decoding="async" />`
				: `<span class="lb-spot-media-initials" aria-hidden="true">${esc(formatPlayerInitials(r.name))}</span>`;
			const mediaClass = r.image ? 'lb-spot-media' : 'lb-spot-media lb-spot-media--fallback';
			const taglineHtml = r.tagline ? `<p class="lb-spot-tagline">${esc(r.tagline)}</p>` : '';
			const noteHtml = r.note ? `<p class="lb-spot-note">${esc(r.note)}</p>` : '';
			return `<article class="lb-spot-card">
        <div class="${mediaClass}">
          <span class="lb-spot-rank-badge">${medal}</span>
          ${mediaInner}
        </div>
        <div class="lb-spot-card-body">
          <h3 class="lb-spot-name">${esc(r.name)}</h3>
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
		const SPEED_PX_PER_S = 60; // pixels per second — comfortable reading pace
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
//      pixel positions — guaranteed to line up no matter the content size.

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
	const rounds = Array.from(
		grid.querySelectorAll<HTMLElement>(':scope > .bracket-round'),
	);
	if (rounds.length < 2) return;

	// ── 1. Reset any previously applied margins ──
	grid
		.querySelectorAll<HTMLElement>('.bracket-match')
		.forEach((m) => (m.style.marginTop = ''));

	// ── 2. Position each round's matches relative to their feeders ──
	for (let rIdx = 1; rIdx < rounds.length; rIdx++) {
		// Wait for the browser to reflow before measuring (applies to each round
		// in turn so the next round's measurements see already-adjusted previous rounds).
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

		// Non-standard bracket: previous round has fewer matches than current
		// (e.g. a preliminary round leading into a round with BYE players already
		// placed). Attempting to centre with the 2-feeder algorithm produces large
		// negative margins that stack matches on top of each other, so skip it.
		if (prevMatches.length <= currMatches.length) continue;

		const gridTop = grid.getBoundingClientRect().top;

		// Snapshot current match centres (before any adjustments for this round)
		const prevCenters = prevMatches.map((m) => {
			const r = m.getBoundingClientRect();
			return r.top + r.height / 2 - gridTop;
		});
		const currCenters = currMatches.map((m) => {
			const r = m.getBoundingClientRect();
			return r.top + r.height / 2 - gridTop;
		});

		// Each currMatch[k] receives from prevMatch[2k] and prevMatch[2k+1].
		// We need its centre to land at the midpoint of those two feeders.
		// Because matches are in flex-column flow, adjusting match k shifts all
		// subsequent matches by the same amount — track the cumulative shift.
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

			const y1 = r1.top + r1.height / 2 - gridRect.top;
			const y2 = r2 ? r2.top + r2.height / 2 - gridRect.top : y1;
			const yT = rT.top + rT.height / 2 - gridRect.top;
			const yJunction = (y1 + y2) / 2;

			// Use the round's bounding box for consistent X anchors so lines
			// don't appear inside the match cards themselves.
			const xRight = r1.right - gridRect.left;
			const xLeft = rT.left - gridRect.left;
			// Junction X is midway through the gap between the two rounds
			const xJunction = xRight + (xLeft - xRight) / 2;

			const hasW1 = f1.querySelector('.bracket-winner') !== null;
			const hasW2 = f2 ? f2.querySelector('.bracket-winner') !== null : false;
			const col1 = hasW1
				? 'rgba(74,222,128,0.7)'
				: 'rgba(255,255,255,0.6)';
			const col2 = hasW2
				? 'rgba(74,222,128,0.7)'
				: 'rgba(255,255,255,0.6)';
			const colJ =
				hasW1 || hasW2
					? 'rgba(74,222,128,0.7)'
					: 'rgba(255,255,255,0.6)';

			// Feeder 1: horizontal arm from match right edge to junction X
			svgLine(svg, xRight, y1, xJunction, y1, col1);

			if (f2 && r2) {
				// Feeder 2: horizontal arm
				svgLine(svg, r2.right - gridRect.left, y2, xJunction, y2, col2);
				// Vertical bar between the two arms
				svgLine(svg, xJunction, y1, xJunction, y2, colJ);
			}

			// Outgoing horizontal from junction to next match left edge.
			// yJunction should equal yT after the layout step above.
			svgLine(svg, xJunction, yJunction, xLeft, yT, colJ);
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
			const y = rF.top + rF.height / 2 - gridRect.top;
			const xFRight = rF.right - gridRect.left;
			const xCLeft = rC.left - gridRect.left;
			const hasWinner = finalMatch.querySelector('.bracket-winner') !== null;
			const colChamp = hasWinner
				? 'rgba(74,222,128,0.7)'
				: 'rgba(255,255,255,0.6)';
			svgLine(svg, xFRight, y, xCLeft, y, colChamp);
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
) {
	const svgNS = 'http://www.w3.org/2000/svg';
	const line = document.createElementNS(svgNS, 'line') as SVGLineElement;
	line.setAttribute('x1', x1.toFixed(1));
	line.setAttribute('y1', y1.toFixed(1));
	line.setAttribute('x2', x2.toFixed(1));
	line.setAttribute('y2', y2.toFixed(1));
	line.setAttribute('stroke', stroke);
	line.setAttribute('stroke-width', '2');
	line.setAttribute('stroke-linecap', 'round');
	svg.appendChild(line);
}

function initBracketTabs() {
	// Only wire up on mobile; on desktop the full bracket is always visible
	if (!window.matchMedia('(max-width: 640px)').matches) return;

	document.querySelectorAll<HTMLElement>('.bracket-tab-nav').forEach((nav) => {
		const container = nav.closest<HTMLElement>('.bracket-block, .bracket-shell');
		if (!container) return;
		const grid = container.querySelector<HTMLElement>('.bracket-grid');
		if (!grid) return;

		const btns = Array.from(nav.querySelectorAll<HTMLButtonElement>('.bracket-tab-btn'));

		function setActiveTab(idx: number) {
			btns.forEach((b, i) => b.classList.toggle('active', i === idx));
			// Scroll the pill strip so the active tab is centred
			btns[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
		}

		// Tab pill click → snap-scroll to that round
		btns.forEach((btn, idx) => {
			btn.addEventListener('click', () => {
				grid.scrollTo({ left: grid.clientWidth * idx, behavior: 'smooth' });
				setActiveTab(idx);
			});
		});

		// Grid scroll (fires after snap settles) → sync active tab pill
		let scrollTimer: ReturnType<typeof setTimeout>;
		grid.addEventListener('scroll', () => {
			clearTimeout(scrollTimer);
			scrollTimer = setTimeout(() => {
				const idx = Math.round(grid.scrollLeft / Math.max(grid.clientWidth, 1));
				setActiveTab(idx);
			}, 80);
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

initNavDrawer();
initLeaderboardPage();
initHeroVideo();
initBracketTabs();
initBracketLayout();
initSeasonStrip();

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
