import type { GalleryAlbum, GalleryClientConfig, GalleryPhoto } from '../lib/gallery/types';

export type { GalleryClientConfig };

declare global {
	interface Window {
		__GP_GALLERY__?: GalleryClientConfig;
	}
}

const ROW = 8;
const GAP = 4;

type SortKey = 'newest' | 'oldest' | 'liked';
type LikeStore = { counts: Record<string, number>; liked: string[] };

function pageSize(): number {
	return Math.max(9, columnCount() * 3);
}

function $(sel: string, root: ParentNode = document): HTMLElement | null {
	return root.querySelector(sel);
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function columnCount(): number {
	const w = window.innerWidth;
	if (w >= 1440) return 6;
	if (w >= 1100) return 5;
	if (w >= 768) return 4;
	return 3;
}

function heartSvg(): string {
	return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 20.2s-6.8-4.3-6.8-8.7A3.9 3.9 0 0 1 12 8.6a3.9 3.9 0 0 1 6.8 2.9c0 4.4-6.8 8.7-6.8 8.7z"></path></svg>';
}

function initials(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
}

export function initGalleryClient(config: GalleryClientConfig): void {
	const grid = $('#gallery-grid');
	const covers = $('#gallery-covers');
	const empty = $('#gallery-empty');
	const tabs = $('#gallery-tabs');
	const moreWrap = $('#gallery-more-wrap');
	const moreBtn = $('#gallery-load-more');
	const selectToggle = $('#gallery-select-toggle');
	const selectBar = $('#gallery-select-bar');
	const selectCount = $('#gallery-select-count');
	const shareSelectedBtn = $('#gallery-share-selected');
	const cancelSelectBtn = $('#gallery-cancel-select');
	const shareProfile = $('#gallery-share-profile');
	const yearSelect = $('#gallery-filter-year') as HTMLSelectElement | null;
	const divisionSelect = $('#gallery-filter-division') as HTMLSelectElement | null;
	const photographerSelect = $('#gallery-filter-photographer') as HTMLSelectElement | null;
	const divisionLabel = $('#gallery-filter-division-label');
	const photographerLabel = $('#gallery-filter-photographer-label');
	const sortSelect = $('#gallery-sort') as HTMLSelectElement | null;
	const lightbox = $('#gallery-lightbox');
	const lbImg = $('#gallery-lb-img') as HTMLImageElement | null;
	const lbCaption = $('#gallery-lb-caption');
	const lbClose = $('#gallery-lb-close') as HTMLButtonElement | null;
	const lbPrev = $('#gallery-lb-prev');
	const lbNext = $('#gallery-lb-next');
	const lbShare = $('#gallery-lb-share');
	const lbDownload = $('#gallery-lb-download');
	const lbLike = $('#gallery-lb-like');
	const shareMenu = $('#gallery-share-menu');
	const photoStat = $('#gallery-stat-photos');

	if (!grid || !lightbox || !lbImg) return;

	const isBrowse = config.mode !== 'collection';
	const likeStore: LikeStore = {
		counts: Object.fromEntries(Object.entries(config.stats ?? {}).map(([id, st]) => [id, st.likes])),
		liked: [...(config.likedIds ?? [])],
	};
	const viewCounts: Record<string, number> = Object.fromEntries(
		Object.entries(config.stats ?? {}).map(([id, st]) => [id, st.views]),
	);
	const viewedThisSession = new Set<string>();

	function recordView(photo: GalleryPhoto): void {
		if (viewedThisSession.has(photo.id)) return;
		viewedThisSession.add(photo.id);
		void fetch('/api/photos/view', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ photoId: photo.id }),
			keepalive: true,
		})
			.then(async (res) => {
				const data = res.ok ? ((await res.json()) as { counted?: boolean }) : null;
				if (data?.counted) {
					viewCounts[photo.id] = (viewCounts[photo.id] ?? 0) + 1;
					if (visible[lbIndex]?.id === photo.id) syncLbLike(photo);
				}
			})
			.catch(() => undefined);
	}

	function photoIdFromUrl(url: string): string | null {
		try {
			const u = new URL(url, config.siteOrigin);
			const fromQuery = u.searchParams.get('photo');
			if (fromQuery) return fromQuery;
			const m = u.pathname.match(/\/gallery\/p\/([A-Za-z0-9_-]+)/);
			return m?.[1] ?? null;
		} catch {
			return null;
		}
	}

	function recordShare(urlOrId: string, channel: string): void {
		const photoId = /^[A-Za-z0-9_-]{4,80}$/.test(urlOrId) && !urlOrId.includes('/') ? urlOrId : photoIdFromUrl(urlOrId);
		if (!photoId) return;
		void fetch('/api/photos/share', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ photoId, channel }),
			keepalive: true,
		}).catch(() => undefined);
	}

	let albumId = albumIdFromUrl();
	let sort: SortKey = 'newest';
	const filters = { year: '', division: '', photographer: '' };
	let shown = pageSize();
	let wallStamp = '';
	let selectMode = false;
	const selected = new Set<string>();
	let visible: GalleryPhoto[] = [];
	let lbIndex = 0;
	let indexSettled = config.photos.length > 0 || !isBrowse;
	let lastFocus: HTMLElement | null = null;
	let reorderOnClose = false;
	let touchX = 0;
	let io: IntersectionObserver | null = null;

	function albumOf(id: string): GalleryAlbum | undefined {
		return config.albums.find((album) => album.id === id);
	}

	function albumName(id: string): string {
		return albumOf(id)?.name ?? id;
	}

	function slugFor(id: string): string | null {
		if (id === 'all') return null;
		return albumOf(id)?.slug ?? null;
	}

	function albumIdFromUrl(): string {
		if (!isBrowse) return config.initialAlbum && config.initialAlbum !== 'all' ? config.initialAlbum : 'all';
		const param = new URL(location.href).searchParams.get('event');
		if (!param) return 'all';
		return config.albums.find((album) => album.slug === param || album.id === param)?.id ?? 'all';
	}

	function pageUrl(slug: string | null, photoId: string | null): string {
		const url = new URL(location.href);
		if (slug) url.searchParams.set('event', slug);
		else url.searchParams.delete('event');
		if (photoId) url.searchParams.set('photo', photoId);
		else url.searchParams.delete('photo');
		url.hash = '';
		return `${url.pathname}${url.search}`;
	}

	function absoluteUrl(pathAndSearch: string): string {
		return `${config.siteOrigin}${pathAndSearch}`;
	}

	function countFor(photo: GalleryPhoto): number {
		if (Object.prototype.hasOwnProperty.call(likeStore.counts, photo.id)) return likeStore.counts[photo.id] ?? 0;
		return photo.likes ?? 0;
	}

	function isLiked(id: string): boolean {
		return likeStore.liked.includes(id);
	}

	function toggleLike(photo: GalleryPhoto): void {
		if (!config.signedIn) {
			const next = `${window.location.pathname}${window.location.search}`;
			window.location.href = `/account?next=${encodeURIComponent(next)}`;
			return;
		}
		const liked = new Set(likeStore.liked);
		const current = countFor(photo);
		const wasLiked = liked.has(photo.id);
		if (wasLiked) {
			liked.delete(photo.id);
			likeStore.counts[photo.id] = Math.max(0, current - 1);
		} else {
			liked.add(photo.id);
			likeStore.counts[photo.id] = current + 1;
		}
		likeStore.liked = [...liked];
		void fetch('/api/photos/like', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ photoId: photo.id }),
		})
			.then(async (res) => {
				if (res.status === 401) {
					window.location.href = `/account?next=${encodeURIComponent(window.location.pathname)}`;
					return;
				}
				if (!res.ok) throw new Error('like failed');
				const data = (await res.json()) as { liked: boolean; likes: number };
				likeStore.counts[photo.id] = data.likes;
				const set = new Set(likeStore.liked);
				if (data.liked) set.add(photo.id);
				else set.delete(photo.id);
				likeStore.liked = [...set];
			})
			.catch(() => {
				// Roll back the optimistic change.
				const set = new Set(likeStore.liked);
				if (wasLiked) set.add(photo.id);
				else set.delete(photo.id);
				likeStore.liked = [...set];
				likeStore.counts[photo.id] = current;
			})
			.finally(() => {
				syncLbLike(photo);
				const tileBtn = grid.querySelector<HTMLElement>(
					`.gallery-tile[data-id="${CSS.escape(photo.id)}"] [data-act="like"]`,
				);
				if (tileBtn) paintLike(tileBtn, photo);
			});
	}

	function yearOf(photo: GalleryPhoto): number {
		const album = albumOf(photo.album);
		if (album) return album.year;
		const parsed = Number(photo.createdAt.slice(0, 4));
		return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
	}

	function comparePhotos(a: GalleryPhoto, b: GalleryPhoto): number {
		if (sort === 'liked') {
			const diff = countFor(b) - countFor(a);
			if (diff !== 0) return diff;
		}
		if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
		return b.createdAt.localeCompare(a.createdAt);
	}

	function photoFiltersActive(): boolean {
		return Boolean(filters.year || filters.division || filters.photographer);
	}

	function wallPhotos(): GalleryPhoto[] {
		if (!isBrowse) return config.photos.slice();
		let list = config.photos.slice();
		if (albumId !== 'all') list = list.filter((photo) => photo.album === albumId);
		if (filters.year) list = list.filter((photo) => String(yearOf(photo)) === filters.year);
		if (filters.division) list = list.filter((photo) => photo.division === filters.division);
		if (filters.photographer) list = list.filter((photo) => photo.photographer === filters.photographer);
		list.sort(comparePhotos);
		return list;
	}

	function altText(photo: GalleryPhoto): string {
		if (photo.caption) return photo.caption;
		return `${albumName(photo.album)} photo`;
	}

	function captionText(photo: GalleryPhoto): string {
		const parts = [photo.caption, photo.photographer, photo.division].filter((part): part is string => Boolean(part));
		return parts.length ? parts.join(' · ') : albumName(photo.album);
	}

	function fileName(photo: GalleryPhoto): string {
		const base = photo.pathname.split('/').pop();
		if (base && /\.[a-z0-9]+$/i.test(base)) return base;
		return `${photo.id}.jpg`;
	}

	function updateStats(): void {
		if (photoStat) photoStat.textContent = config.photos.length.toLocaleString('en-US');
	}

	function updateDocumentTitle(): void {
		if (!isBrowse) return;
		const name = albumId === 'all' ? '' : albumName(albumId);
		document.title = name
			? `${name} | Gallery | Racquetball Grand Prix 2026`
			: 'Gallery | Racquetball Grand Prix 2026';
	}

	function setEmpty(kind: 'hidden' | 'event' | 'filters'): void {
		if (!empty) return;
		empty.replaceChildren();
		if (kind === 'hidden') {
			empty.hidden = true;
			return;
		}
		empty.hidden = false;
		if (kind === 'event') {
			const strong = document.createElement('strong');
			strong.textContent = 'No photos yet';
			const detail =
				albumId === 'all'
					? ' Photos from every tour stop will show up here.'
					: ` Photos from the ${albumName(albumId)} will show up here.`;
			empty.append(strong, document.createTextNode(detail));
			return;
		}
		empty.textContent = 'No photos match these filters.';
	}

	function fillSelect(select: HTMLSelectElement, values: string[], allLabel: string, current: string): string {
		const html = [
			`<option value="">${escapeHtml(allLabel)}</option>`,
			...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
		].join('');
		if (select.dataset.built !== html) {
			select.innerHTML = html;
			select.dataset.built = html;
		}
		const next = values.includes(current) ? current : '';
		select.value = next;
		return next;
	}

	function syncDynamicFilters(): void {
		const scope =
			!isBrowse || albumId === 'all' ? config.photos : config.photos.filter((photo) => photo.album === albumId);
		const divisions = [...new Set(scope.map((photo) => photo.division).filter((value): value is string => Boolean(value)))].sort();
		const photographers = [
			...new Set(scope.map((photo) => photo.photographer).filter((value): value is string => Boolean(value))),
		].sort();
		if (divisionSelect) {
			filters.division = fillSelect(divisionSelect, divisions, 'All divisions', filters.division);
			if (divisionLabel) divisionLabel.hidden = divisions.length === 0;
		}
		if (photographerSelect) {
			filters.photographer = fillSelect(photographerSelect, photographers, 'All photographers', filters.photographer);
			if (photographerLabel) photographerLabel.hidden = photographers.length === 0;
		}
	}

	function initYearFilter(): void {
		if (!yearSelect || yearSelect.options.length > 1) return;
		const years = [...new Set(config.albums.map((album) => album.year))].sort((a, b) => b - a);
		for (const year of years) {
			const option = document.createElement('option');
			option.value = String(year);
			option.textContent = String(year);
			yearSelect.append(option);
		}
	}

	function storyArt(id: string): { src: string; logo: boolean } {
		if (id === 'all') return { src: '/images/series-logo.webp', logo: true };
		const cover = config.albums.find((album) => album.id === id)?.coverImage;
		return cover ? { src: cover, logo: false } : { src: '/images/series-logo.webp', logo: true };
	}

	function renderTabs(): void {
		if (!tabs) return;
		const items = [{ id: 'all', label: 'All Events' }, ...config.albums.map((album) => ({ id: album.id, label: album.name }))];
		tabs.innerHTML = items
			.map((item) => {
				const selectedTab = item.id === albumId;
				const art = storyArt(item.id);
				return `<button type="button" class="gallery-tab${selectedTab ? ' is-active' : ''}" role="tab" data-album="${escapeHtml(item.id)}" aria-selected="${selectedTab ? 'true' : 'false'}" aria-label="${escapeHtml(item.label)}" tabindex="${selectedTab ? '0' : '-1'}"><span class="gallery-story-ring"><img class="gallery-story-img${art.logo ? ' gallery-story-img--logo' : ''}" src="${escapeHtml(art.src)}" alt="" /></span><span class="gallery-story-label">${escapeHtml(item.label)}</span></button>`;
			})
			.join('');
		const active = tabs.querySelector<HTMLElement>('.is-active');
		if (active) {
			const tabBox = active.getBoundingClientRect();
			const rowBox = tabs.getBoundingClientRect();
			const clipped = tabBox.left < rowBox.left - 1 || tabBox.right > rowBox.right + 1;
			if (clipped) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
		}
	}

	function skeletonTiles(count: number): string {
		return Array.from({ length: count }, () => {
			return '<div class="gallery-tile gallery-tile--skeleton" aria-hidden="true"><div class="gallery-tile-body"><div class="gallery-tile-media"></div></div></div>';
		}).join('');
	}

	function captionHtml(photo: GalleryPhoto): string {
		if (!photo.caption && !photo.photographer && !photo.division) return '';
		const credit = photo.photographer || photo.caption || photo.division || '';
		const metaParts: string[] = [];
		if (photo.photographer && photo.division) metaParts.push(photo.division);
		if ((photo.photographer || photo.division) && photo.caption) metaParts.push(photo.caption);
		const avatar = photo.photographer
			? `<span class="gallery-tile-avatar" aria-hidden="true">${escapeHtml(initials(photo.photographer))}</span>`
			: '';
		const meta = metaParts.length
			? `<span class="gallery-tile-meta">${escapeHtml(metaParts.join(' · '))}</span>`
			: '';
		return `<div class="gallery-tile-caption">${avatar}<span class="gallery-tile-caption-text"><span class="gallery-tile-credit">${escapeHtml(credit)}</span>${meta}</span></div>`;
	}

	function tileHtml(photo: GalleryPhoto): string {
		const alt = altText(photo);
		const liked = isLiked(photo.id);
		const likes = countFor(photo);
		const isSel = selected.has(photo.id);
		const actions = selectMode
			? ''
			: `<div class="gallery-tile-hover">
					<button type="button" class="gallery-tile-download" data-act="download">Download</button>
					<button type="button" class="gallery-tile-like${liked ? ' is-liked' : ''}" data-act="like" aria-pressed="${liked ? 'true' : 'false'}" aria-label="${liked ? 'Unlike' : 'Like'}, ${likes} likes">${heartSvg()}<span class="gallery-like-count">${likes}</span></button>
				</div>`;
		return `<article class="gallery-tile gallery-tile--pending${isSel ? ' is-selected' : ''}" data-id="${escapeHtml(photo.id)}">
			<div class="gallery-tile-body">
			<div class="gallery-tile-media">
				<button type="button" class="gallery-tile-open" aria-label="${escapeHtml(alt)}" aria-pressed="${isSel ? 'true' : 'false'}">
					<img data-src="${escapeHtml(photo.url)}" alt="${escapeHtml(alt)}" decoding="async" />
					<img class="gallery-watermark gallery-watermark--gp" src="/images/website-logo.webp" alt="" />
					<img class="gallery-watermark gallery-watermark--credit" src="/images/daniel-bray-photography.png" alt="" />
					${selectMode ? `<span class="gallery-tile-check" aria-hidden="true">${isSel ? '✓' : ''}</span>` : ''}
				</button>
				${actions}
			</div>
			${captionHtml(photo)}
			</div>
		</article>`;
	}

	function applySpans(): void {
		if (grid.hidden) return;
		const cols = String(columnCount());
		if (grid.style.getPropertyValue('--gallery-cols') !== cols) {
			grid.style.setProperty('--gallery-cols', cols);
		}
		grid.querySelectorAll<HTMLElement>('.gallery-tile').forEach((tile) => {
			const height = tile.querySelector<HTMLElement>('.gallery-tile-body')?.offsetHeight ?? 0;
			if (!height) return;
			const span = String(Math.max(1, Math.ceil((height + GAP + 1) / (ROW + GAP))));
			if (tile.style.getPropertyValue('--span') !== span) tile.style.setProperty('--span', span);
		});
	}

	let tileObserver: IntersectionObserver | null = null;

	function revealTile(tile: HTMLElement, img: HTMLImageElement): void {
		img.classList.add('is-in');
		tile.classList.remove('gallery-tile--pending');
	}

	function startTile(tile: HTMLElement): void {
		const img = tile.querySelector<HTMLImageElement>('img[data-src]');
		if (!img || img.dataset.started === '1') return;
		img.dataset.started = '1';
		const done = () => revealTile(tile, img);
		img.addEventListener('load', done, { once: true });
		img.addEventListener('error', () => tile.classList.remove('gallery-tile--pending'), { once: true });
		img.src = img.dataset.src || '';
		if (img.complete && img.naturalWidth > 0) done();
	}

	function ensureTileObserver(): IntersectionObserver {
		if (!tileObserver) {
			tileObserver = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						startTile(entry.target as HTMLElement);
						tileObserver?.unobserve(entry.target);
					}
				},
				{ rootMargin: '800px 0px' },
			);
		}
		return tileObserver;
	}

	function activateTiles(): void {
		const observer = ensureTileObserver();
		grid.querySelectorAll<HTMLElement>('.gallery-tile--pending').forEach((tile) => {
			if (tile.dataset.watching === '1') return;
			tile.dataset.watching = '1';
			observer.observe(tile);
		});
	}

	function currentStamp(): string {
		return [albumId, sort, filters.year, filters.division, filters.photographer, selectMode ? '1' : '0'].join('|');
	}

	function appendTiles(photos: GalleryPhoto[]): void {
		if (!photos.length) return;
		const fragment = document.createElement('template');
		fragment.innerHTML = photos.map(tileHtml).join('');
		grid.append(fragment.content);
	}

	function sentinelNear(): boolean {
		if (!moreBtn || !moreWrap || moreWrap.hidden) return false;
		return moreBtn.getBoundingClientRect().top < window.innerHeight + 1100;
	}

	function watchMore(): void {
		io?.disconnect();
		if (!moreBtn || !moreWrap || moreWrap.hidden) return;
		io = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				if (shown >= wallPhotos().length) return;
				shown += pageSize();
				renderWall();
			},
			{ rootMargin: '1100px 0px' },
		);
		io.observe(moreBtn);
	}

	function renderWall(): void {
		io?.disconnect();
		const photos = wallPhotos();
		visible = photos;
		if (covers) covers.hidden = true;

		if (!photos.length) {
			wallStamp = currentStamp();
			grid.replaceChildren();
			if (moreWrap) moreWrap.hidden = true;
			if (!indexSettled) {
				grid.hidden = false;
				setEmpty('hidden');
				grid.innerHTML = skeletonTiles(pageSize());
				grid.setAttribute('aria-busy', 'true');
				applySpans();
				return;
			}
			grid.hidden = true;
			grid.removeAttribute('aria-busy');
			setEmpty(photoFiltersActive() ? 'filters' : 'event');
			return;
		}

		const stamp = currentStamp();
		if (stamp !== wallStamp) {
			wallStamp = stamp;
			grid.replaceChildren();
		}

		grid.hidden = false;
		grid.removeAttribute('aria-busy');
		setEmpty('hidden');

		let guard = 0;
		while (guard < 6) {
			guard += 1;
			const existing = grid.querySelectorAll<HTMLElement>(':scope > .gallery-tile[data-id]');
			const target = Math.min(shown, photos.length);
			const samePrefix =
				existing.length <= target &&
				[...existing].every((tile, index) => tile.dataset.id === photos[index]?.id);
			if (!samePrefix) grid.replaceChildren();
			const start = samePrefix ? existing.length : 0;
			appendTiles(photos.slice(start, target));
			if (moreWrap) moreWrap.hidden = target >= photos.length;
			if (!sentinelNear() || shown >= photos.length) break;
			shown += pageSize();
		}

		activateTiles();
		applySpans();
		watchMore();
	}

	function render(): void {
		io?.disconnect();
		updateStats();
		updateDocumentTitle();
		updateSelectBar();
		if (covers) {
			covers.hidden = true;
			covers.innerHTML = '';
		}
		if (isBrowse) {
			renderTabs();
			syncDynamicFilters();
		}
		void renderWall();
	}

	function updateSelectBar(): void {
		if (!selectBar || !selectCount || !shareSelectedBtn) return;
		selectBar.hidden = !selectMode;
		selectCount.textContent = `${selected.size} selected`;
		shareSelectedBtn.toggleAttribute('disabled', selected.size === 0);
		if (selectToggle) {
			selectToggle.textContent = selectMode ? 'Done' : 'Select';
			selectToggle.setAttribute('aria-pressed', selectMode ? 'true' : 'false');
		}
	}

	function scrollToWall(): void {
		const target = grid;
		if (!target || target.hidden) return;
		const navPad = 100;
		const y = target.getBoundingClientRect().top;
		if (y >= navPad) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.scrollTo({
			top: y + window.scrollY - navPad,
			behavior: reduce ? 'auto' : 'smooth',
		});
	}

	function setAlbum(id: string, opts: { push: boolean; scroll: boolean }): void {
		const next = id === 'all' || config.albums.some((album) => album.id === id) ? id : 'all';
		if (next === albumId) {
			if (opts.scroll) scrollToWall();
			return;
		}
		albumId = next;
		shown = pageSize();
		selected.clear();
		if (isBrowse) {
			const slug = slugFor(albumId);
			const url = pageUrl(slug, null);
			const state = { galleryEvent: slug };
			if (opts.push) history.pushState(state, '', url);
			else history.replaceState(state, '', url);
		}
		render();
		if (opts.scroll) scrollToWall();
	}

	function paintLike(btn: HTMLElement, photo: GalleryPhoto): void {
		const likes = countFor(photo);
		const liked = isLiked(photo.id);
		btn.classList.toggle('is-liked', liked);
		btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
		btn.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'}, ${likes} likes`);
		const count = btn.querySelector('.gallery-like-count');
		if (count) count.textContent = String(likes);
	}

	function syncLbLike(photo: GalleryPhoto): void {
		if (!lbLike) return;
		const likes = countFor(photo);
		const liked = isLiked(photo.id);
		lbLike.classList.toggle('is-liked', liked);
		lbLike.setAttribute('aria-pressed', liked ? 'true' : 'false');
		lbLike.textContent = liked ? `Liked ${likes}` : `Like ${likes}`;
		const viewsEl = document.getElementById('gallery-lb-views');
		if (viewsEl) {
			const views = viewCounts[photo.id] ?? 0;
			viewsEl.textContent = views > 0 ? `${views.toLocaleString('en-US')} ${views === 1 ? 'view' : 'views'}` : '';
		}
	}

	function applyLike(photo: GalleryPhoto): void {
		toggleLike(photo);
		syncLbLike(photo);
		const tileBtn = grid.querySelector<HTMLElement>(
			`.gallery-tile[data-id="${CSS.escape(photo.id)}"] [data-act="like"]`,
		);
		if (tileBtn) paintLike(tileBtn, photo);
		if (sort === 'liked') reorderOnClose = true;
	}

	const GP_MARK_SRC = '/images/website-logo.webp';
	const CREDIT_MARK_SRC = '/images/daniel-bray-photography.png';
	const watermarkImages = new Map<string, Promise<HTMLImageElement>>();

	function loadHtmlImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('image'));
			img.src = src;
		});
	}

	function loadMark(src: string): Promise<HTMLImageElement> {
		let pending = watermarkImages.get(src);
		if (!pending) {
			pending = loadHtmlImage(src).catch((err) => {
				watermarkImages.delete(src);
				throw err;
			});
			watermarkImages.set(src, pending);
		}
		return pending;
	}

	async function loadPhotoImage(url: string): Promise<{ img: HTMLImageElement; revoke: () => void }> {
		const res = await fetch(url);
		if (!res.ok) throw new Error('download failed');
		const blob = await res.blob();
		const objectUrl = URL.createObjectURL(blob);
		try {
			const img = await loadHtmlImage(objectUrl);
			return { img, revoke: () => URL.revokeObjectURL(objectUrl) };
		} catch (err) {
			URL.revokeObjectURL(objectUrl);
			throw err;
		}
	}

	function paintMark(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		mark: HTMLImageElement,
		scale: number,
		side: 'left' | 'right',
	): void {
		const markW = Math.max(1, Math.round(width * scale));
		const markH = Math.max(1, Math.round(markW * (mark.naturalHeight / mark.naturalWidth)));
		const pad = Math.max(8, Math.round(Math.min(width, height) * 0.028));
		const x = side === 'left' ? pad : width - markW - pad;
		const y = height - markH - pad;
		ctx.save();
		if (side === 'left') {
			ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
			ctx.shadowBlur = Math.max(2, Math.round(width * 0.004));
			ctx.shadowOffsetY = Math.max(1, Math.round(width * 0.0015));
		}
		ctx.drawImage(mark, x, y, markW, markH);
		ctx.restore();
	}

	async function downloadPhoto(photo: GalleryPhoto): Promise<void> {
		recordShare(photo.id, 'download');
		let revoke = () => {};
		try {
			const [photoImage, gpMark, creditMark] = await Promise.all([
				loadPhotoImage(photo.url),
				loadMark(GP_MARK_SRC),
				loadMark(CREDIT_MARK_SRC),
			]);
			revoke = photoImage.revoke;
			const { img } = photoImage;
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('canvas');
			ctx.drawImage(img, 0, 0);
			paintMark(ctx, canvas.width, canvas.height, gpMark, 0.26, 'left');
			paintMark(ctx, canvas.width, canvas.height, creditMark, 0.32, 'right');
			const file = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', 0.92);
			});
			const objectUrl = URL.createObjectURL(file);
			const link = document.createElement('a');
			link.href = objectUrl;
			link.download = fileName(photo).replace(/\.[a-z0-9]+$/i, '') + '.jpg';
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
		} catch {
			window.open(photo.url, '_blank', 'noopener,noreferrer');
		} finally {
			revoke();
		}
	}

	function showLb(): void {
		const photo = visible[lbIndex];
		if (!photo) return;
		const opening = lightbox.hidden;
		lbImg.src = photo.url;
		lbImg.alt = altText(photo);
		if (lbCaption) lbCaption.textContent = captionText(photo);
		recordView(photo);
		syncLbLike(photo);
		lightbox.hidden = false;
		lightbox.setAttribute('aria-hidden', 'false');
		document.body.classList.add('gallery-lb-open');
		if (lbPrev) lbPrev.hidden = visible.length < 2;
		if (lbNext) lbNext.hidden = visible.length < 2;
		if (isBrowse) {
			history.replaceState(
				{ galleryEvent: slugFor(albumId), photo: photo.id },
				'',
				pageUrl(slugFor(albumId), photo.id),
			);
		}
		if (opening) lbClose?.focus();
	}

	function closeLb(opts?: { history?: boolean }): void {
		if (lightbox.hidden) return;
		lightbox.hidden = true;
		lightbox.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('gallery-lb-open');
		if (shareMenu) shareMenu.hidden = true;
		if (opts?.history !== false && isBrowse) {
			history.replaceState({ galleryEvent: slugFor(albumId) }, '', pageUrl(slugFor(albumId), null));
		}
		lastFocus?.focus();
		lastFocus = null;
		if (reorderOnClose) {
			reorderOnClose = false;
			render();
		}
	}

	function openLightbox(id: string): void {
		visible = wallPhotos();
		const idx = visible.findIndex((photo) => photo.id === id);
		if (idx < 0) return;
		lbIndex = idx;
		if (lightbox.hidden) {
			lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		}
		showLb();
	}

	function step(delta: number): void {
		if (visible.length < 2) return;
		lbIndex = (lbIndex + delta + visible.length) % visible.length;
		showLb();
	}

	function revealPhoto(id: string): void {
		const photo = config.photos.find((item) => item.id === id);
		if (!photo) return;
		if (isBrowse && albumId !== photo.album) {
			albumId = config.albums.some((album) => album.id === photo.album) ? photo.album : albumId;
			shown = pageSize();
			history.replaceState(
				{ galleryEvent: slugFor(albumId), photo: id },
				'',
				pageUrl(slugFor(albumId), id),
			);
			render();
		}
		openLightbox(id);
	}

	function isAbort(err: unknown): boolean {
		return (
			(err instanceof DOMException && err.name === 'AbortError') ||
			(err instanceof Error && err.name === 'AbortError')
		);
	}

	async function shareLink(url: string, title: string): Promise<void> {
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ url });
				recordShare(url, 'native');
				return;
			} catch (err) {
				if (isAbort(err)) return;
			}
		}
		if (shareMenu) {
			shareMenu.hidden = false;
			shareMenu.dataset.url = url;
			shareMenu.dataset.title = title;
			shareMenu.querySelector('button')?.focus();
		} else {
			try {
				await navigator.clipboard.writeText(url);
			} catch {
				window.prompt('Copy this link', url);
			}
		}
	}

	function trapTab(e: KeyboardEvent): void {
		if (shareMenu && !shareMenu.hidden) return;
		const nodes = [
			...lightbox.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]'),
		];
		if (!nodes.length) return;
		const first = nodes[0];
		const last = nodes[nodes.length - 1];
		if (!first || !last) return;
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function wireShareMenu(): void {
		if (!shareMenu) return;
		shareMenu.addEventListener('click', async (e) => {
			const target = (e.target as HTMLElement).closest('[data-share]') as HTMLElement | null;
			if (!target) return;
			const url = shareMenu.dataset.url || '';
			const title = shareMenu.dataset.title || 'Racquetball Grand Prix';
			const kind = target.dataset.share;
			if (kind === 'close') {
				shareMenu.hidden = true;
				return;
			}
			if (kind === 'copy') {
				recordShare(url, 'copy');
				await navigator.clipboard.writeText(url);
				target.textContent = 'Copied!';
				window.setTimeout(() => {
					target.textContent = 'Copy link';
					shareMenu.hidden = true;
				}, 900);
				return;
			}
			if (kind === 'facebook') {
				recordShare(url, 'facebook');
				window.open(
					`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
					'_blank',
					'noopener,noreferrer',
				);
			}
			if (kind === 'x') {
				recordShare(url, 'x');
				window.open(
					`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
					'_blank',
					'noopener,noreferrer',
				);
			}
		});
	}

	tabs?.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest('[data-album]') as HTMLElement | null;
		if (!btn?.dataset.album) return;
		setAlbum(btn.dataset.album, { push: true, scroll: true });
	});

	tabs?.addEventListener('keydown', (e) => {
		if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
		const buttons = [...tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
		const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (index < 0) return;
		e.preventDefault();
		const next = buttons[(index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
		next?.focus();
		next?.click();
	});

	grid.addEventListener('click', (e) => {
		const act = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
		const tile = (e.target as HTMLElement).closest('.gallery-tile') as HTMLElement | null;
		if (!tile?.dataset.id) return;
		const id = tile.dataset.id;
		const photo = config.photos.find((item) => item.id === id);
		if (act?.dataset.act === 'download') {
			e.preventDefault();
			if (photo) void downloadPhoto(photo);
			return;
		}
		if (act?.dataset.act === 'like') {
			e.preventDefault();
			if (photo) applyLike(photo);
			return;
		}
		if (selectMode) {
			if (selected.has(id)) selected.delete(id);
			else selected.add(id);
			tile.classList.toggle('is-selected', selected.has(id));
			const open = tile.querySelector<HTMLElement>('.gallery-tile-open');
			open?.setAttribute('aria-pressed', selected.has(id) ? 'true' : 'false');
			const check = tile.querySelector('.gallery-tile-check');
			if (check) check.textContent = selected.has(id) ? '✓' : '';
			updateSelectBar();
			return;
		}
		openLightbox(id);
	});

	grid.addEventListener(
		'load',
		(e) => {
			const img = e.target;
			if (img instanceof HTMLImageElement && !img.classList.contains('gallery-watermark')) {
				img.classList.add('is-in');
				img.closest('.gallery-tile')?.classList.remove('gallery-tile--pending');
			}
		},
		true,
	);

	selectToggle?.addEventListener('click', () => {
		selectMode = !selectMode;
		if (!selectMode) selected.clear();
		render();
	});

	cancelSelectBtn?.addEventListener('click', () => {
		selectMode = false;
		selected.clear();
		render();
	});

	shareSelectedBtn?.addEventListener('click', () => {
		const ids = Array.from(selected);
		if (!ids.length) return;
		void shareLink(
			`${config.siteOrigin}/gallery/s/${ids.join(',')}`,
			`${ids.length} photos from the Racquetball Grand Prix`,
		);
	});

	shareProfile?.addEventListener('click', () => {
		const name = albumId === 'all' ? 'Racquetball Grand Prix' : albumName(albumId);
		void shareLink(absoluteUrl(pageUrl(slugFor(albumId), null)), name);
	});

	yearSelect?.addEventListener('change', () => {
		filters.year = yearSelect.value;
		shown = pageSize();
		render();
	});
	divisionSelect?.addEventListener('change', () => {
		filters.division = divisionSelect.value;
		shown = pageSize();
		render();
	});
	photographerSelect?.addEventListener('change', () => {
		filters.photographer = photographerSelect.value;
		shown = pageSize();
		render();
	});
	sortSelect?.addEventListener('change', () => {
		const value = sortSelect.value;
		sort = value === 'oldest' || value === 'liked' ? value : 'newest';
		shown = pageSize();
		render();
	});

	moreBtn?.addEventListener('click', () => {
		io?.disconnect();
		shown += pageSize();
		renderWall();
	});

	lbClose?.addEventListener('click', () => closeLb());
	lbPrev?.addEventListener('click', () => step(-1));
	lbNext?.addEventListener('click', () => step(1));
	lbDownload?.addEventListener('click', () => {
		const photo = visible[lbIndex];
		if (photo) void downloadPhoto(photo);
	});
	lbLike?.addEventListener('click', () => {
		const photo = visible[lbIndex];
		if (photo) applyLike(photo);
	});
	lightbox.addEventListener('click', (e) => {
		if (e.target === lightbox) closeLb();
	});
	lbShare?.addEventListener('click', () => {
		const photo = visible[lbIndex];
		if (!photo) return;
		void shareLink(absoluteUrl(`/gallery/p/${photo.id}`), photo.caption || 'Racquetball Grand Prix');
	});

	document.addEventListener('keydown', (e) => {
		if (lightbox.hidden) return;
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (e.key === 'Escape') {
			if (shareMenu && !shareMenu.hidden) {
				shareMenu.hidden = true;
				lbClose?.focus();
				return;
			}
			closeLb();
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			step(-1);
		}
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			step(1);
		}
		if (e.key === 'Tab') trapTab(e);
	});

	lightbox.addEventListener(
		'touchstart',
		(e) => {
			touchX = e.changedTouches[0]?.screenX ?? 0;
		},
		{ passive: true },
	);
	lightbox.addEventListener(
		'touchend',
		(e) => {
			const x = e.changedTouches[0]?.screenX ?? 0;
			const dx = x - touchX;
			if (Math.abs(dx) < 50) return;
			if (dx > 0) step(-1);
			else step(1);
		},
		{ passive: true },
	);

	window.addEventListener('popstate', () => {
		if (!isBrowse) return;
		albumId = albumIdFromUrl();
		shown = pageSize();
		selected.clear();
		const photoId = new URL(location.href).searchParams.get('photo');
		if (!photoId && !lightbox.hidden) closeLb({ history: false });
		render();
		scrollToWall();
		if (photoId) openLightbox(photoId);
	});

	if (typeof ResizeObserver !== 'undefined') {
		const observer = new ResizeObserver(() => applySpans());
		observer.observe(grid);
	}

	wireShareMenu();
	initYearFilter();

	const eventParam = isBrowse ? new URL(location.href).searchParams.get('event') : null;
	if (eventParam && !config.albums.some((album) => album.slug === eventParam || album.id === eventParam)) {
		history.replaceState({ galleryEvent: null }, '', pageUrl(null, null));
	}

	render();

	const openId =
		config.initialOpenId ||
		new URL(location.href).searchParams.get('photo') ||
		(location.hash.startsWith('#photo-') ? location.hash.slice('#photo-'.length) : '');
	if (openId) revealPhoto(openId);

	if (isBrowse) {
		const refresh = () =>
			fetch(`/api/gallery/list?cb=${Date.now()}`, { cache: 'no-store' })
				.then((res) => res.json())
				.then((data: { photos?: GalleryPhoto[] }) => {
					if (!Array.isArray(data?.photos)) return;
					config.photos = data.photos;
				});
		void refresh()
			.then(() => {
				indexSettled = true;
				render();
				window.setTimeout(() => {
					void refresh().then(() => render());
				}, 1500);
			})
			.catch(() => {
				indexSettled = true;
				render();
			});
	}
}

if (typeof window !== 'undefined' && window.__GP_GALLERY__) {
	initGalleryClient(window.__GP_GALLERY__);
}
