import type { GalleryAlbum, GalleryClientConfig, GalleryPhoto } from '../lib/gallery/types';
import { enablePush, getPushState, pushSupported } from './push-client';
import { lockScroll, unlockScroll } from './scroll-lock';

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
	const feed = $('#gallery-feed');
	const feedScroll = $('#gallery-feed-scroll');
	const feedClose = $('#gallery-feed-close');
	const feedTitle = $('#gallery-feed-title');
	const feedCount = $('#gallery-feed-count');

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
					paintFeedViews(photo);
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
	let feedOpen = false;
	let feedObserver: IntersectionObserver | null = null;
	let feedLastTap = { id: '', at: 0 };
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
				paintFeedLike(photo);
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
		paintFeedLike(photo);
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


	// ── People panel: who is in the photo, who liked it, tagging ─────────────
	type PhotoPerson = { slug: string; name: string; displayName: string | null };
	type PhotoLiker = { name: string; slug: string | null };
	type PeoplePayload = {
		tags: PhotoPerson[];
		likers: PhotoLiker[];
		viewer: { signedIn: boolean; playerSlug: string | null; isAdmin: boolean; tagged: boolean };
	};
	const peopleEl = $('#gallery-lb-people');
	let peopleFor: string | null = null;
	const viewer = config.viewer ?? { signedIn: Boolean(config.signedIn), playerSlug: null, displayName: null, isAdmin: false };

	function avatarChip(slug: string | null, label: string, cls: string): string {
		const initials = label.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
		const inner = `<span class="gallery-chip-avatar" aria-hidden="true">${escapeHtml(initials)}</span><span>${escapeHtml(label)}</span>`;
		return slug
			? `<a class="${cls}" href="/players/${encodeURIComponent(slug)}">${inner}</a>`
			: `<span class="${cls} ${cls}--plain">${inner}</span>`;
	}

	function renderPeople(photo: GalleryPhoto, data: PeoplePayload): void {
		if (!peopleEl) return;
		const parts: string[] = [];
		const tagChips = data.tags.map((t) => avatarChip(t.slug, t.name, 'gallery-chip')).join('');
		let action = '';
		if (viewer.signedIn && data.viewer.playerSlug) {
			action = data.viewer.tagged
				? `<button type="button" class="gallery-people-btn" data-people="untag">Remove my tag</button>`
				: `<button type="button" class="gallery-people-btn gallery-people-btn--primary" data-people="tag">I'm in this photo</button>`;
		} else if (viewer.signedIn) {
			action = `<a class="gallery-people-hint" href="/account">Claim your player profile to tag yourself</a>`;
		} else {
			action = `<a class="gallery-people-hint" href="/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}">Sign in to tag yourself</a>`;
		}
		let adminTag = '';
		if (data.viewer.isAdmin && config.players?.length) {
			adminTag = `<form class="gallery-people-admin" data-people="admin-form">
				<input class="gallery-people-input" list="gallery-player-list" name="player" placeholder="Tag a player…" autocomplete="off" />
				<datalist id="gallery-player-list">${config.players.map((pl) => `<option value="${escapeHtml(pl.name)}" data-slug="${escapeHtml(pl.slug)}"></option>`).join('')}</datalist>
				<button type="submit" class="gallery-people-btn">Add</button>
			</form>`;
		}
		const removeAll = data.viewer.isAdmin && data.tags.length
			? `<div class="gallery-people-remove">${data.tags.map((t) => `<button type="button" class="gallery-people-x" data-people="remove" data-slug="${escapeHtml(t.slug)}" title="Remove ${escapeHtml(t.name)}">× ${escapeHtml(t.name)}</button>`).join('')}</div>`
			: '';
		parts.push(`<div class="gallery-people-row">
			<span class="gallery-people-label">In this photo</span>
			<div class="gallery-people-chips">${tagChips || '<span class="gallery-people-empty">No one tagged yet</span>'}</div>
			<div class="gallery-people-actions">${action}${adminTag}</div>
			${removeAll}
		</div>`);
		const shown = data.likers.slice(0, 8);
		const extra = data.likers.length - shown.length;
		const likersHtml = shown.length
			? `<span class="gallery-people-label">Liked by</span><div class="gallery-people-chips">${shown.map((l) => avatarChip(l.slug, l.name, 'gallery-chip gallery-chip--liker')).join('')}${extra > 0 ? `<span class="gallery-people-more">+${extra} more</span>` : ''}</div>`
			: '';
		const likersEl = $('#gallery-lb-likers');
		if (likersEl) likersEl.innerHTML = likersHtml;
		else parts.push(`<div class="gallery-people-row">${likersHtml}</div>`);
		peopleEl.innerHTML = parts.join('');
		peopleEl.hidden = false;
		peopleEl.dataset.photo = photo.id;
	}

	/** After someone tags themselves, offer browser notifications once. */
	async function offerPush(): Promise<void> {
		if (!peopleEl || !pushSupported()) return;
		let seen = false;
		try {
			seen = localStorage.getItem('gp:pushOffer') === '1';
		} catch {
			/* ignore */
		}
		if (seen) return;
		const state = await getPushState();
		if (state !== 'off') return;
		const cfg = (await fetch('/api/push/config', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { enabled?: boolean } | null;
		if (!cfg?.enabled) return;
		try {
			localStorage.setItem('gp:pushOffer', '1');
		} catch {
			/* ignore */
		}
		peopleEl.insertAdjacentHTML(
			'beforeend',
			`<div class="gallery-push-offer">
				<span class="gallery-people-label">Want a heads-up when this photo gets likes or comments?</span>
				<button type="button" class="gallery-people-btn gallery-people-btn--primary" data-people="push-on">Turn on notifications</button>
				<button type="button" class="gallery-people-btn" data-people="push-no">No thanks</button>
			</div>`,
		);
	}

	async function loadPeople(photo: GalleryPhoto): Promise<void> {
		if (!peopleEl) return;
		peopleFor = photo.id;
		try {
			const res = await fetch(`/api/photos/people?id=${encodeURIComponent(photo.id)}`, { cache: 'no-store' });
			if (!res.ok) throw new Error('people failed');
			const data = (await res.json()) as PeoplePayload;
			if (peopleFor !== photo.id) return;
			renderPeople(photo, data);
		} catch {
			peopleEl.hidden = true;
		}
	}

	async function changeTag(photo: GalleryPhoto, action: 'add' | 'remove', playerSlug?: string): Promise<string | null> {
		const res = await fetch('/api/photos/tag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ photoId: photo.id, action, ...(playerSlug ? { playerSlug } : {}) }),
		});
		if (res.status === 401) {
			window.location.href = `/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
			return null;
		}
		const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
		if (!res.ok) return data.message ?? data.error ?? 'Could not update the tag.';
		await loadPeople(photo);
		return null;
	}

	peopleEl?.addEventListener('click', async (e) => {
		const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-people]');
		if (!btn || btn.tagName === 'FORM') return;
		const photo = visible[lbIndex];
		if (!photo) return;
		const kind = btn.dataset.people;
		if (kind === 'tag' || kind === 'untag') {
			btn.setAttribute('disabled', '');
			const err = await changeTag(photo, kind === 'tag' ? 'add' : 'remove');
			if (err) window.alert(err);
			else if (kind === 'tag') void offerPush();
		} else if (kind === 'push-on') {
			btn.setAttribute('disabled', '');
			const r = await enablePush();
			const host = btn.closest<HTMLElement>('.gallery-push-offer');
			if (host) host.innerHTML = r.state === 'on' ? '<span class="gallery-people-hint">Notifications on. You will hear when this photo gets likes or comments.</span>' : `<span class="gallery-people-hint">${escapeHtml(r.error ?? 'Could not turn notifications on.')}</span>`;
		} else if (kind === 'push-no') {
			btn.closest<HTMLElement>('.gallery-push-offer')?.remove();
		} else if (kind === 'remove' && btn.dataset.slug) {
			const err = await changeTag(photo, 'remove', btn.dataset.slug);
			if (err) window.alert(err);
		}
	});
	peopleEl?.addEventListener('submit', async (e) => {
		const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-people="admin-form"]');
		if (!form) return;
		e.preventDefault();
		const photo = visible[lbIndex];
		const input = form.querySelector<HTMLInputElement>('input[name=player]');
		if (!photo || !input) return;
		const typed = input.value.trim().toLowerCase();
		const match = config.players?.find((pl) => pl.name.toLowerCase() === typed);
		if (!match) {
			window.alert('Pick a player name from the list.');
			return;
		}
		const err = await changeTag(photo, 'add', match.slug);
		if (err) window.alert(err);
	});


	// ── Comments ─────────────────────────────────────────────────────────────
	type CommentView = {
		id: string;
		body: string;
		createdAt: string;
		status: 'visible' | 'pending' | 'hidden';
		mine: boolean;
		author: { name: string; slug: string | null; verified: boolean };
	};
	type CommentsPayload = {
		comments: CommentView[];
		moderation: { isJunior: boolean; commentsOff: boolean };
		viewer: { signedIn: boolean; canComment: boolean; isAdmin: boolean };
	};
	const commentsEl = $('#gallery-lb-comments');
	const composeEl = $('#gallery-lb-compose') as HTMLFormElement | null;
	const composeInput = $('#gallery-lb-input') as HTMLInputElement | null;
	const composeNote = $('#gallery-lb-compose-note');
	const adminEl = $('#gallery-lb-admin');
	let commentsFor: string | null = null;

	function timeAgo(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const sec = Math.floor((Date.now() - d.getTime()) / 1000);
		if (sec < 60) return 'now';
		if (sec < 3600) return `${Math.floor(sec / 60)}m`;
		if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
		if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function commentHtml(c: CommentView, isAdmin: boolean): string {
		const who = c.author.slug
			? `<a class="glb-c-name" href="/players/${encodeURIComponent(c.author.slug)}">${escapeHtml(c.author.name)}${c.author.verified ? '<span class="glb-c-verified" title="Verified player">✓</span>' : ''}</a>`
			: `<span class="glb-c-name">${escapeHtml(c.author.name)}</span>`;
		const pending = c.status === 'pending' ? `<span class="glb-c-pending">Waiting for review</span>` : '';
		const actions = c.mine || isAdmin
			? `<button type="button" class="glb-c-act" data-comment="delete" data-id="${c.id}">Delete</button>`
			: `<button type="button" class="glb-c-act" data-comment="report" data-id="${c.id}">Report</button>`;
		return `<div class="glb-c${c.status === 'pending' ? ' glb-c--pending' : ''}" data-id="${c.id}">
			<span class="gallery-chip-avatar glb-c-avatar" aria-hidden="true">${escapeHtml(initials(c.author.name))}</span>
			<div class="glb-c-main">
				<p class="glb-c-text">${who} ${escapeHtml(c.body)}</p>
				<p class="glb-c-meta"><time datetime="${escapeHtml(c.createdAt)}">${escapeHtml(timeAgo(c.createdAt))}</time>${pending}${actions}</p>
			</div>
		</div>`;
	}

	function renderComments(data: CommentsPayload): void {
		if (!commentsEl) return;
		commentsEl.innerHTML = data.comments.length
			? data.comments.map((c) => commentHtml(c, data.viewer.isAdmin)).join('')
			: `<p class="glb-c-empty">No comments yet. ${data.viewer.canComment ? 'Start the conversation.' : ''}</p>`;
		if (composeEl && composeInput) {
			if (data.moderation.commentsOff) {
				composeInput.disabled = true;
				composeInput.placeholder = 'Comments are off for this photo';
			} else if (!data.viewer.signedIn) {
				composeInput.disabled = true;
				composeInput.placeholder = 'Sign in to comment';
			} else {
				composeInput.disabled = false;
				composeInput.placeholder = data.moderation.isJunior ? 'Add a comment (reviewed before it shows)…' : 'Add a comment…';
			}
		}
		if (adminEl) {
			if (data.viewer.isAdmin) {
				adminEl.hidden = false;
				adminEl.innerHTML = `<label class="glb-admin-toggle"><input type="checkbox" data-flag="junior" ${data.moderation.isJunior ? 'checked' : ''}/> Junior photo</label>
					<label class="glb-admin-toggle"><input type="checkbox" data-flag="off" ${data.moderation.commentsOff ? 'checked' : ''}/> Comments off</label>`;
			} else {
				adminEl.hidden = true;
				adminEl.innerHTML = '';
			}
		}
		const body = $('#gallery-lb-body');
		if (body) body.scrollTop = body.scrollHeight;
	}

	async function loadComments(photo: GalleryPhoto): Promise<void> {
		if (!commentsEl) return;
		commentsFor = photo.id;
		commentsEl.innerHTML = '<p class="glb-c-empty">Loading…</p>';
		try {
			const res = await fetch(`/api/photos/comments?id=${encodeURIComponent(photo.id)}`, { cache: 'no-store' });
			if (!res.ok) throw new Error('comments failed');
			const data = (await res.json()) as CommentsPayload;
			if (commentsFor !== photo.id) return;
			renderComments(data);
		} catch {
			commentsEl.innerHTML = '<p class="glb-c-empty">Comments are unavailable right now.</p>';
		}
	}

	function showComposeNote(text: string, ok = false): void {
		if (!composeNote) return;
		composeNote.textContent = text;
		composeNote.classList.toggle('is-ok', ok);
		composeNote.hidden = !text;
	}

	composeEl?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const photo = visible[lbIndex];
		if (!photo || !composeInput) return;
		if (!viewer.signedIn) {
			window.location.href = `/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
			return;
		}
		const text = composeInput.value.trim();
		if (!text) return;
		const btn = composeEl.querySelector('button') as HTMLButtonElement | null;
		if (btn) btn.disabled = true;
		showComposeNote('');
		try {
			const res = await fetch('/api/photos/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ photoId: photo.id, body: text }),
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; held?: boolean; error?: string };
			if (res.status === 401) {
				window.location.href = `/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
				return;
			}
			if (!res.ok) {
				showComposeNote(data.error ?? 'Could not post.');
				return;
			}
			composeInput.value = '';
			if (data.held) showComposeNote('Posted. It will show once Kyle approves it.', true);
			await loadComments(photo);
		} finally {
			if (btn) btn.disabled = false;
		}
	});

	commentsEl?.addEventListener('click', async (e) => {
		const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-comment]');
		if (!btn) return;
		const photo = visible[lbIndex];
		const id = btn.dataset.id;
		if (!photo || !id) return;
		const action = btn.dataset.comment === 'delete' ? 'delete' : 'report';
		if (action === 'delete' && !window.confirm('Delete this comment?')) return;
		if (action === 'report' && !window.confirm('Report this comment? It will be hidden until Kyle reviews it.')) return;
		btn.setAttribute('disabled', '');
		const res = await fetch('/api/photos/comment-action', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ commentId: id, action }),
		});
		if (res.status === 401) {
			window.location.href = `/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
			return;
		}
		await loadComments(photo);
	});

	adminEl?.addEventListener('change', async (e) => {
		const box = e.target as HTMLInputElement;
		const photo = visible[lbIndex];
		if (!photo || !box.dataset.flag) return;
		const payload = box.dataset.flag === 'junior' ? { isJunior: box.checked } : { commentsOff: box.checked };
		await fetch('/api/admin/photo-flag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ photoId: photo.id, ...payload }),
		});
		await loadComments(photo);
	});

	$('#gallery-lb-comment-btn')?.addEventListener('click', () => {
		composeInput?.focus();
	});

	function showLb(): void {
		const photo = visible[lbIndex];
		if (!photo) return;
		const opening = lightbox.hidden;
		lbImg.src = photo.url;
		lbImg.alt = altText(photo);
		if (lbCaption) lbCaption.textContent = photo.caption?.trim() ?? '';
		const albumEl = $('#gallery-lb-album');
		if (albumEl) albumEl.textContent = albumOf(photo.album)?.label ?? 'Racquetball Grand Prix';
		const dateEl = $('#gallery-lb-date');
		if (dateEl) {
			const d = new Date(photo.createdAt);
			dateEl.textContent = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
		recordView(photo);
		syncLbLike(photo);
		void loadPeople(photo);
		void loadComments(photo);
		lightbox.hidden = false;
		lightbox.setAttribute('aria-hidden', 'false');
		document.body.classList.add('gallery-lb-open');
		lockScroll('gallery');
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
		if (peopleEl) {
			peopleEl.hidden = true;
			peopleEl.innerHTML = '';
		}
		peopleFor = null;
		commentsFor = null;
		const commentsHost = $('#gallery-lb-comments');
		if (commentsHost) commentsHost.innerHTML = '';
		if (lightbox.hidden) return;
		lightbox.hidden = true;
		lightbox.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('gallery-lb-open');
		unlockScroll('gallery');
		if (shareMenu) shareMenu.hidden = true;
		if (feedOpen) {
			// The detail view was opened from the feed: drop back to the feed, not the wall.
			document.body.classList.add('gallery-lb-open');
			lockScroll('gallery');
		lockScroll('gallery');
			const current = visible[lbIndex];
			if (isBrowse && current) {
				history.replaceState({ galleryEvent: slugFor(albumId), photo: current.id }, '', pageUrl(slugFor(albumId), current.id));
			}
			lastFocus?.focus();
			lastFocus = null;
			return;
		}
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
		if (useFeed() && lightbox.hidden) {
			openFeed(idx);
			return;
		}
		lbIndex = idx;
		if (lightbox.hidden) {
			lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		}
		showLb();
	}

	function step(delta: number): void {
		if (visible.length < 2) return;
		lbIndex = (lbIndex + delta + visible.length) % visible.length;
		if (feedOpen && lightbox.hidden) {
			scrollFeedTo(lbIndex, 'smooth');
			return;
		}
		showLb();
	}

	// ───── Vertical feed (phones): scroll through posts like a social feed ─────
	function useFeed(): boolean {
		return Boolean(feed && feedScroll && visible.length > 1 && window.matchMedia('(max-width: 900px)').matches);
	}

	const FEED_ICONS = {
		heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c1.9 0 3.3 1 4.1 2.3L12 9l1.5-1.7C14.3 6 15.7 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
		comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 3 6.5 3 10.8c0 2.3 1.1 4.3 2.9 5.7L5 21l4.6-2.2c.8.2 1.6.3 2.4.3 5.1 0 9-3.5 9-7.8S17.1 3 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
		share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3L3 10.5l8 2.5 2.5 8L21 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 13l10-10" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
		download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	};

	function feedDate(photo: GalleryPhoto): string {
		const d = new Date(photo.createdAt);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function likesText(photo: GalleryPhoto): string {
		const n = countFor(photo);
		if (n === 0) return 'Be the first to like this';
		return `${n.toLocaleString('en-US')} ${n === 1 ? 'like' : 'likes'}`;
	}

	function commentsText(photo: GalleryPhoto): string {
		const n = config.stats?.[photo.id]?.comments ?? 0;
		return n > 0 ? `View all ${n} ${n === 1 ? 'comment' : 'comments'}` : 'Add a comment…';
	}

	function viewsText(photo: GalleryPhoto): string {
		const n = viewCounts[photo.id] ?? 0;
		return n > 0 ? `${n.toLocaleString('en-US')} ${n === 1 ? 'view' : 'views'}` : '';
	}

	/** Phone-sized webp through the site's image endpoint instead of the multi-MB original. */
	function feedImageSrc(photo: GalleryPhoto): string {
		return `/_image?href=${encodeURIComponent(photo.url)}&w=1200&f=webp&q=78`;
	}

	function feedCardHtml(photo: GalleryPhoto, idx: number): string {
		const album = albumOf(photo.album)?.label ?? 'Racquetball Grand Prix';
		const sized = Boolean(photo.width && photo.height);
		const ratio = sized ? `${photo.width} / ${photo.height}` : '4 / 3';
		const liked = isLiked(photo.id);
		const caption = photo.caption?.trim() ?? '';
		return `<article class="gfeed-post" data-id="${escapeHtml(photo.id)}" data-index="${idx}">
			<header class="gfeed-head">
				<img class="gfeed-brand" src="/images/series-logo.webp" alt="" width="32" height="40" />
				<div class="gfeed-head-text">
					<span class="gfeed-album">${escapeHtml(album)}</span>
					<span class="gfeed-date">${feedDate(photo)}</span>
				</div>
			</header>
			<div class="gfeed-media" style="aspect-ratio:${ratio}" data-sized="${sized ? '1' : '0'}">
				<img src="${feedImageSrc(photo)}" alt="${escapeHtml(altText(photo))}" loading="lazy" decoding="async" />
				<img class="gallery-watermark gallery-watermark--gp" src="/images/website-logo.webp" alt="" />
				<img class="gallery-watermark gallery-watermark--credit" src="/images/daniel-bray-photography.png" alt="" />
				<span class="gfeed-burst" aria-hidden="true">${FEED_ICONS.heart}</span>
			</div>
			<div class="gfeed-actions">
				<button type="button" class="gfeed-act gfeed-act--like${liked ? ' is-liked' : ''}" data-act="like" aria-pressed="${liked ? 'true' : 'false'}" aria-label="${liked ? 'Unlike' : 'Like'}">${FEED_ICONS.heart}</button>
				<button type="button" class="gfeed-act" data-act="comment" aria-label="Comments">${FEED_ICONS.comment}</button>
				<button type="button" class="gfeed-act" data-act="share" aria-label="Share">${FEED_ICONS.share}</button>
				<button type="button" class="gfeed-act gfeed-act--end" data-act="download" aria-label="Download">${FEED_ICONS.download}</button>
			</div>
			<p class="gfeed-likes">${likesText(photo)}</p>
			${caption ? `<p class="gfeed-caption"><strong>${escapeHtml(album)}</strong> ${escapeHtml(caption)}</p>` : ''}
			<button type="button" class="gfeed-comments" data-act="comment">${commentsText(photo)}</button>
			<p class="gfeed-views">${viewsText(photo)}</p>
		</article>`;
	}

	function feedCard(id: string): HTMLElement | null {
		return feedScroll?.querySelector<HTMLElement>(`.gfeed-post[data-id="${CSS.escape(id)}"]`) ?? null;
	}

	function paintFeedLike(photo: GalleryPhoto): void {
		const card = feedCard(photo.id);
		if (!card) return;
		const liked = isLiked(photo.id);
		const btn = card.querySelector<HTMLElement>('.gfeed-act--like');
		if (btn) {
			btn.classList.toggle('is-liked', liked);
			btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
			btn.setAttribute('aria-label', liked ? 'Unlike' : 'Like');
		}
		const likes = card.querySelector('.gfeed-likes');
		if (likes) likes.textContent = likesText(photo);
	}

	function paintFeedViews(photo: GalleryPhoto): void {
		const el = feedCard(photo.id)?.querySelector('.gfeed-views');
		if (el) el.textContent = viewsText(photo);
	}

	function scrollFeedTo(idx: number, behavior: ScrollBehavior): void {
		const photo = visible[idx];
		const card = photo ? feedCard(photo.id) : null;
		card?.scrollIntoView({ block: 'start', behavior });
	}

	function setFeedCurrent(idx: number): void {
		const photo = visible[idx];
		if (!photo) return;
		lbIndex = idx;
		if (feedCount) feedCount.textContent = `${idx + 1} of ${visible.length}`;
		recordView(photo);
		if (isBrowse) {
			history.replaceState({ galleryEvent: slugFor(albumId), photo: photo.id }, '', pageUrl(slugFor(albumId), photo.id));
		}
	}

	function openFeed(idx: number): void {
		if (!feed || !feedScroll) return;
		lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		feedOpen = true;
		lbIndex = idx;
		if (feedTitle) feedTitle.textContent = albumId === 'all' || !isBrowse ? 'Racquetball Grand Prix' : albumName(albumId);
		feedScroll.innerHTML = visible.map((photo, i) => feedCardHtml(photo, i)).join('');
		feed.hidden = false;
		feed.setAttribute('aria-hidden', 'false');
		document.body.classList.add('gallery-lb-open');
		lockScroll('gallery');
		scrollFeedTo(idx, 'auto');
		setFeedCurrent(idx);
		feedObserver?.disconnect();
		feedObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const i = Number((entry.target as HTMLElement).dataset.index);
					if (Number.isFinite(i) && i !== lbIndex) setFeedCurrent(i);
				}
			},
			// A card is "current" while it crosses the middle band of the viewport.
			{ root: feedScroll, rootMargin: '-45% 0px -45% 0px', threshold: 0 },
		);
		feedScroll.querySelectorAll<HTMLElement>('.gfeed-post').forEach((card) => feedObserver?.observe(card));
		feedClose?.focus();
	}

	function closeFeed(opts?: { history?: boolean }): void {
		if (!feed || !feedScroll || !feedOpen) return;
		feedOpen = false;
		if (!lightbox.hidden) closeLb({ history: false });
		feedObserver?.disconnect();
		feedObserver = null;
		feed.hidden = true;
		feed.setAttribute('aria-hidden', 'true');
		feedScroll.innerHTML = '';
		document.body.classList.remove('gallery-lb-open');
		unlockScroll('gallery');
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

	/** Open the full post (comments, tags) on top of the feed. */
	function openDetail(idx: number, focusCompose: boolean): void {
		lbIndex = idx;
		lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		showLb();
		if (focusCompose) window.setTimeout(() => ($('#gallery-lb-input') as HTMLInputElement | null)?.focus(), 50);
	}

	function burstHeart(card: HTMLElement): void {
		const burst = card.querySelector<HTMLElement>('.gfeed-burst');
		if (!burst) return;
		burst.classList.remove('is-on');
		void burst.offsetWidth;
		burst.classList.add('is-on');
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
	feedClose?.addEventListener('click', () => closeFeed());
	feedScroll?.addEventListener('click', (e) => {
		const target = e.target as HTMLElement | null;
		const actEl = target?.closest<HTMLElement>('[data-act]');
		const card = target?.closest<HTMLElement>('.gfeed-post');
		if (!actEl || !card) return;
		const idx = Number(card.dataset.index);
		const photo = visible[idx];
		if (!photo) return;
		switch (actEl.dataset.act) {
			case 'like':
				applyLike(photo);
				break;
			case 'comment':
				openDetail(idx, true);
				break;
			case 'share':
				void shareLink(absoluteUrl(`/gallery/p/${photo.id}`), photo.caption || 'Racquetball Grand Prix');
				break;
			case 'download':
				void downloadPhoto(photo);
				break;
		}
	});
	// Double-tap a photo to like it (never unlikes, like the apps people know).
	feedScroll?.addEventListener(
		'touchend',
		(e) => {
			const media = (e.target as HTMLElement | null)?.closest<HTMLElement>('.gfeed-media');
			const card = media?.closest<HTMLElement>('.gfeed-post');
			if (!media || !card) return;
			const id = card.dataset.id ?? '';
			const now = Date.now();
			const isDouble = feedLastTap.id === id && now - feedLastTap.at < 320;
			feedLastTap = { id, at: now };
			if (!isDouble) return;
			e.preventDefault();
			if (!config.signedIn) return;
			const photo = visible[Number(card.dataset.index)];
			if (!photo) return;
			burstHeart(card);
			if (!isLiked(photo.id)) applyLike(photo);
		},
		{ passive: false },
	);
	// Photos without stored dimensions start in a 4:3 frame; switch to the real shape once loaded.
	feedScroll?.addEventListener(
		'load',
		(e) => {
			const img = e.target;
			if (!(img instanceof HTMLImageElement) || img.classList.contains('gallery-watermark')) return;
			const media = img.closest<HTMLElement>('.gfeed-media');
			if (media && media.dataset.sized === '0' && img.naturalWidth && img.naturalHeight && feedScroll) {
				const before = media.getBoundingClientRect();
				media.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
				media.dataset.sized = '1';
				// A card above the viewport changed height: keep what the reader is looking at in place.
				const after = media.getBoundingClientRect();
				if (after.bottom <= feedScroll.getBoundingClientRect().top + 1) feedScroll.scrollTop += after.height - before.height;
			}
		},
		true,
	);
	document.addEventListener('keydown', (e) => {
		if (!feedOpen || !lightbox.hidden) return;
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (e.key === 'Escape') {
			if (shareMenu && !shareMenu.hidden) {
				shareMenu.hidden = true;
				return;
			}
			closeFeed();
		}
	});
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

	const swipeArea = $('#gallery-lb-media') ?? lightbox;
	swipeArea.addEventListener(
		'touchstart',
		(e) => {
			touchX = e.changedTouches[0]?.screenX ?? 0;
		},
		{ passive: true },
	);
	swipeArea.addEventListener(
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
		if (!photoId && feedOpen) closeFeed({ history: false });
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
