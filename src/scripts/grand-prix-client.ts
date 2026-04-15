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
      <td class="lb-stops right hide-mobile">${r.s1 || '—'}</td>
      <td class="lb-stops right hide-mobile">${r.s2 || '—'}</td>
      <td class="lb-pts-cell ${i === 0 ? 'leader' : ''}">${total}</td>
      <td class="lb-stops right hide-mobile">${(r.s1 > 0 ? 1 : 0) + (r.s2 > 0 ? 1 : 0)}/4</td>
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

initNavDrawer();
initLeaderboardPage();

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
