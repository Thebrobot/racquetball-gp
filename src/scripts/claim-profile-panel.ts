import { matchClaimPlayers, playerIdentifyLine, type ClaimPlayerOption } from '../lib/accounts/player-search';

type ClaimOk = { ok?: boolean; next?: string; error?: string; player?: { name: string; slug: string } | null };

let roster: ClaimPlayerOption[] | null = null;
let rosterPromise: Promise<ClaimPlayerOption[]> | null = null;

export async function loadClaimPlayers(): Promise<ClaimPlayerOption[]> {
	if (roster) return roster;
	if (!rosterPromise) {
		rosterPromise = fetch('/api/players/claim-options', { cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : { players: [] }))
			.then((d: { players?: ClaimPlayerOption[] }) => {
				roster = d.players ?? [];
				return roster;
			})
			.catch(() => {
				rosterPromise = null;
				return [] as ClaimPlayerOption[];
			});
	}
	return rosterPromise;
}

function el<T extends HTMLElement>(root: HTMLElement, key: string): T | null {
	return root.querySelector<T>(`[data-claim="${key}"]`);
}

export function wireClaimPanel(root: HTMLElement, onLinked?: (next: string) => void): void {
	const search = el<HTMLInputElement>(root, 'search');
	const listbox = el<HTMLElement>(root, 'listbox');
	const emptyEl = el<HTMLElement>(root, 'empty');
	const pickEl = el<HTMLElement>(root, 'pick');
	const pickName = el<HTMLElement>(root, 'pick-name');
	const pickMeta = el<HTMLElement>(root, 'pick-meta');
	const pickTaken = el<HTMLElement>(root, 'taken');
	const confirmBtn = el<HTMLButtonElement>(root, 'confirm');
	const notMe = el<HTMLElement>(root, 'not-me');
	const okEl = el<HTMLElement>(root, 'ok');
	const errEl = el<HTMLElement>(root, 'error');
	const noteEl = el<HTMLInputElement>(root, 'note');
	if (!search || !listbox || !emptyEl || !pickEl || !confirmBtn) return;

	let players: ClaimPlayerOption[] = [];
	let matches: ClaimPlayerOption[] = [];
	let active = -1;
	let open = false;
	let preview: ClaimPlayerOption | null = null;

	const setOpen = (next: boolean) => {
		open = next;
		listbox.hidden = !next;
		search.setAttribute('aria-expanded', next ? 'true' : 'false');
		if (!next) {
			search.removeAttribute('aria-activedescendant');
			active = -1;
		}
	};

	const paintList = () => {
		listbox.innerHTML = matches
			.map((p, i) => {
				const meta = playerIdentifyLine(p);
				const taken = p.claimed ? ' · already claimed' : '';
				return `<li role="none"><button type="button" class="su-claim-opt${p.claimed ? ' is-claimed' : ''}" role="option" id="${root.id || 'claim'}-opt-${i}" data-slug="${p.slug}" aria-selected="${i === active ? 'true' : 'false'}">${p.name.replace(/</g, '&lt;')}${meta ? `<span class="su-opt-meta">${meta.replace(/</g, '&lt;')}${taken}</span>` : taken ? `<span class="su-opt-meta">Already claimed</span>` : ''}</button></li>`;
			})
			.join('');
	};

	const setActive = (index: number) => {
		active = matches.length ? ((index % matches.length) + matches.length) % matches.length : -1;
		[...listbox.querySelectorAll<HTMLElement>('.su-claim-opt')].forEach((opt, i) => {
			opt.setAttribute('aria-selected', i === active ? 'true' : 'false');
			if (i === active) {
				search.setAttribute('aria-activedescendant', opt.id);
				opt.scrollIntoView({ block: 'nearest' });
			}
		});
	};

	const syncList = (query: string) => {
		const typed = query.trim();
		if (!typed) {
			matches = [];
			emptyEl.hidden = true;
			setOpen(false);
			paintList();
			return;
		}
		matches = matchClaimPlayers(players, query);
		emptyEl.hidden = matches.length > 0;
		if (!matches.length) {
			setOpen(false);
			paintList();
			return;
		}
		active = 0;
		setOpen(true);
		paintList();
		setActive(0);
	};

	const showPreview = (player: ClaimPlayerOption) => {
		preview = player;
		setOpen(false);
		search.value = player.name;
		if (pickName) pickName.textContent = player.name;
		if (pickMeta) pickMeta.textContent = playerIdentifyLine(player) || 'Grand Prix player';
		if (pickTaken) pickTaken.hidden = !player.claimed;
		confirmBtn.disabled = player.claimed;
		pickEl.hidden = false;
		if (okEl) okEl.hidden = true;
		if (errEl) errEl.hidden = true;
	};

	const clearPick = () => {
		preview = null;
		pickEl.hidden = true;
		confirmBtn.disabled = false;
		if (okEl) okEl.hidden = true;
	};

	void loadClaimPlayers().then((list) => {
		players = list;
		if (search.value.trim()) syncList(search.value);
	});

	search.addEventListener('input', () => {
		clearPick();
		syncList(search.value);
		if (search.value.trim()) search.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});
	search.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open && search.value.trim()) syncList(search.value);
			else if (open) setActive(active + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (open) setActive(active - 1);
		} else if (e.key === 'Enter' && open) {
			e.preventDefault();
			const hit = matches[active];
			if (hit) showPreview(hit);
		} else if (e.key === 'Escape' && open) {
			e.preventDefault();
			setOpen(false);
		}
	});
	listbox.addEventListener('mousedown', (e) => e.preventDefault());
	listbox.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.su-claim-opt');
		if (!btn?.dataset.slug) return;
		const hit = matches.find((p) => p.slug === btn.dataset.slug);
		if (hit) showPreview(hit);
	});
	notMe?.addEventListener('click', () => {
		clearPick();
		search.focus();
		syncList(search.value);
	});
	confirmBtn.addEventListener('click', async () => {
		if (!preview || preview.claimed) return;
		confirmBtn.disabled = true;
		if (errEl) errEl.hidden = true;
		const res = await fetch('/api/claims', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ player_slug: preview.slug, note: noteEl?.value.trim() ?? '' }),
		});
		const data = (await res.json().catch(() => ({}))) as ClaimOk;
		if (res.ok && data.ok) {
			if (okEl) {
				okEl.textContent = data.player?.name
					? `Your account is linked to ${data.player.name}.`
					: 'Your account is linked.';
				okEl.hidden = false;
			}
			pickEl.hidden = true;
			onLinked?.(data.next ?? '/account');
			return;
		}
		if (errEl) {
			errEl.textContent = data.error ?? 'Could not link the profile.';
			errEl.hidden = false;
		}
		confirmBtn.disabled = false;
	});
}
