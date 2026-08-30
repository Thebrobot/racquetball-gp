import type { GalleryClientConfig, GalleryPhoto } from '../lib/gallery/types';

export type { GalleryClientConfig };

function albumLabel(albums: { id: string; label: string }[], albumId: string): string {
	return albums.find((a) => a.id === albumId)?.label ?? albumId;
}

declare global {
	interface Window {
		__GP_GALLERY__?: GalleryClientConfig;
	}
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

export function initGalleryClient(config: GalleryClientConfig): void {
	const grid = $('#gallery-grid');
	const empty = $('#gallery-empty');
	const filterBar = $('#gallery-filters');
	const selectToggle = $('#gallery-select-toggle');
	const selectBar = $('#gallery-select-bar');
	const selectCount = $('#gallery-select-count');
	const shareSelectedBtn = $('#gallery-share-selected');
	const cancelSelectBtn = $('#gallery-cancel-select');
	const lightbox = $('#gallery-lightbox');
	const lbImg = $('#gallery-lb-img') as HTMLImageElement | null;
	const lbCaption = $('#gallery-lb-caption');
	const lbClose = $('#gallery-lb-close');
	const lbPrev = $('#gallery-lb-prev');
	const lbNext = $('#gallery-lb-next');
	const lbShare = $('#gallery-lb-share');
	const shareMenu = $('#gallery-share-menu');

	if (!grid || !lightbox || !lbImg) return;

	let album = config.initialAlbum || 'all';
	let selectMode = false;
	const selected = new Set<string>();
	let visible: GalleryPhoto[] = [];
	let lbIndex = 0;
	let touchX = 0;

	function filtered(): GalleryPhoto[] {
		if (config.mode === 'collection') return config.photos;
		if (album === 'all') return config.photos;
		return config.photos.filter((p) => p.album === album);
	}

	function photoUrl(id: string): string {
		return `${config.siteOrigin}/gallery/p/${id}`;
	}

	function collectionUrl(ids: string[]): string {
		return `${config.siteOrigin}/gallery/s/${ids.join(',')}`;
	}

	function renderFilters(): void {
		if (!filterBar || config.mode === 'collection') return;
		const counts = new Map<string, number>();
		for (const p of config.photos) {
			counts.set(p.album, (counts.get(p.album) ?? 0) + 1);
		}
		// Always list every event so visitors can filter by stop
		const chips = [{ id: 'all', label: 'All events' }, ...config.albums];
		filterBar.innerHTML = chips
			.map((c) => {
				const count = c.id === 'all' ? config.photos.length : (counts.get(c.id) ?? 0);
				const label = c.id === 'all' ? c.label : `${c.label}${count ? ` (${count})` : ''}`;
				return `<button type="button" class="gallery-filter${c.id === album ? ' is-active' : ''}" data-album="${escapeHtml(c.id)}">${escapeHtml(label)}</button>`;
			})
			.join('');
	}

	function renderGrid(): void {
		visible = filtered();
		if (empty) empty.hidden = visible.length > 0;
		grid.innerHTML = visible
			.map((p) => {
				const isSel = selected.has(p.id);
				const label = p.caption || albumLabel(config.albums, p.album);
				return `<button type="button" class="gallery-tile${isSel ? ' is-selected' : ''}" data-id="${escapeHtml(p.id)}" aria-label="${escapeHtml(label)}">
					<img src="${escapeHtml(p.url)}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" />
					${selectMode ? `<span class="gallery-tile-check" aria-hidden="true">${isSel ? '✓' : ''}</span>` : ''}
				</button>`;
			})
			.join('');
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

	function openLightbox(id: string): void {
		const idx = visible.findIndex((p) => p.id === id);
		if (idx < 0) return;
		lbIndex = idx;
		showLb();
	}

	function showLb(): void {
		const photo = visible[lbIndex];
		if (!photo) return;
		lbImg.src = photo.url;
		lbImg.alt = photo.caption || albumLabel(config.albums, photo.album);
		if (lbCaption) {
			lbCaption.textContent = photo.caption || albumLabel(config.albums, photo.album);
		}
		lightbox.hidden = false;
		lightbox.setAttribute('aria-hidden', 'false');
		document.body.classList.add('gallery-lb-open');
		if (lbPrev) lbPrev.hidden = visible.length < 2;
		if (lbNext) lbNext.hidden = visible.length < 2;
		history.replaceState(null, '', `#photo-${photo.id}`);
	}

	function closeLb(): void {
		lightbox.hidden = true;
		lightbox.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('gallery-lb-open');
		if (shareMenu) shareMenu.hidden = true;
		if (location.hash.startsWith('#photo-')) {
			history.replaceState(null, '', location.pathname + location.search);
		}
	}

	function step(delta: number): void {
		if (visible.length < 2) return;
		lbIndex = (lbIndex + delta + visible.length) % visible.length;
		showLb();
	}

	function isAbort(err: unknown): boolean {
		return (
			(err instanceof DOMException && err.name === 'AbortError') ||
			(err instanceof Error && err.name === 'AbortError')
		);
	}

	/** Open our share menu so Facebook can use Facebook's own share (opens the app when possible). */
	function shareLink(url: string, title: string, _photos: GalleryPhoto[] = []): void {
		if (shareMenu) {
			shareMenu.hidden = false;
			shareMenu.dataset.url = url;
			shareMenu.dataset.title = title;
			return;
		}
		void (async () => {
			if (typeof navigator.share === 'function') {
				try {
					await navigator.share({ url });
					return;
				} catch (err) {
					if (isAbort(err)) return;
				}
			}
			try {
				await navigator.clipboard.writeText(url);
				alert('Link copied.');
			} catch {
				alert(url);
			}
		})();
	}

	function openFacebookShare(url: string): void {
		// Facebook's share URL — on iPhone this usually opens the Facebook app,
		// not the limited iOS share-sheet extension.
		const sharer = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
		window.location.href = sharer;
	}

	function wireShareMenu(): void {
		if (!shareMenu) return;
		shareMenu.addEventListener('click', async (e) => {
			const t = (e.target as HTMLElement).closest('[data-share]') as HTMLElement | null;
			if (!t) return;
			const url = shareMenu.dataset.url || '';
			const title = shareMenu.dataset.title || 'Florida Racquetball Grand Prix';
			const kind = t.dataset.share;
			if (kind === 'close') {
				shareMenu.hidden = true;
				return;
			}
			if (kind === 'copy') {
				await navigator.clipboard.writeText(url);
				t.textContent = 'Copied!';
				setTimeout(() => {
					t.textContent = 'Copy link';
					shareMenu.hidden = true;
				}, 900);
				return;
			}
			if (kind === 'system') {
				shareMenu.hidden = true;
				if (typeof navigator.share === 'function') {
					try {
						await navigator.share({ url });
					} catch (err) {
						if (!isAbort(err)) {
							try {
								await navigator.clipboard.writeText(url);
								alert('Link copied.');
							} catch {
								alert(url);
							}
						}
					}
				} else {
					try {
						await navigator.clipboard.writeText(url);
						alert('Link copied.');
					} catch {
						alert(url);
					}
				}
				return;
			}
			if (kind === 'facebook') {
				shareMenu.hidden = true;
				openFacebookShare(url);
				return;
			}
			if (kind === 'x') {
				shareMenu.hidden = true;
				window.open(
					`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
					'_blank',
					'noopener,noreferrer',
				);
			}
		});
	}

	filterBar?.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest('[data-album]') as HTMLElement | null;
		if (!btn?.dataset.album) return;
		album = btn.dataset.album;
		selected.clear();
		renderFilters();
		renderGrid();
		updateSelectBar();
	});

	grid.addEventListener('click', (e) => {
		const tile = (e.target as HTMLElement).closest('.gallery-tile') as HTMLElement | null;
		if (!tile?.dataset.id) return;
		const id = tile.dataset.id;
		if (selectMode) {
			if (selected.has(id)) selected.delete(id);
			else selected.add(id);
			renderGrid();
			updateSelectBar();
			return;
		}
		openLightbox(id);
	});

	selectToggle?.addEventListener('click', () => {
		selectMode = !selectMode;
		if (!selectMode) selected.clear();
		renderGrid();
		updateSelectBar();
	});

	cancelSelectBtn?.addEventListener('click', () => {
		selectMode = false;
		selected.clear();
		renderGrid();
		updateSelectBar();
	});

	shareSelectedBtn?.addEventListener('click', () => {
		const ids = Array.from(selected);
		if (!ids.length) return;
		const photos = ids
			.map((id) => config.photos.find((p) => p.id === id))
			.filter((p): p is GalleryPhoto => Boolean(p));
		const url = collectionUrl(ids);
		const title = `${ids.length} photos from the Florida Racquetball Grand Prix`;
		void shareLink(url, title, photos);
	});

	lbClose?.addEventListener('click', closeLb);
	lbPrev?.addEventListener('click', () => step(-1));
	lbNext?.addEventListener('click', () => step(1));
	lightbox.addEventListener('click', (e) => {
		if (e.target === lightbox) closeLb();
	});

	lbShare?.addEventListener('click', () => {
		const photo = visible[lbIndex];
		if (!photo) return;
		void shareLink(
			photoUrl(photo.id),
			photo.caption || 'Florida Racquetball Grand Prix',
			[photo],
		);
	});

	document.addEventListener('keydown', (e) => {
		if (lightbox.hidden) return;
		if (e.key === 'Escape') closeLb();
		if (e.key === 'ArrowLeft') step(-1);
		if (e.key === 'ArrowRight') step(1);
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

	wireShareMenu();
	renderFilters();
	renderGrid();
	updateSelectBar();

	// Refresh from API so we don't show a stale SSR snapshot after uploads
	if (config.mode !== 'collection') {
		const refresh = () =>
			fetch(`/api/gallery/list?cb=${Date.now()}`, { cache: 'no-store' })
				.then((r) => r.json())
				.then((data: { photos?: GalleryPhoto[] }) => {
					if (!Array.isArray(data?.photos)) return;
					config.photos = data.photos;
					renderFilters();
					renderGrid();
					updateSelectBar();
				})
				.catch(() => {
					/* keep SSR photos */
				});

		void refresh().then(() => {
			// One delayed refresh catches Blob list lag right after an upload
			window.setTimeout(() => {
				void refresh();
			}, 1500);
		});
	}

	const openId =
		config.initialOpenId ||
		(location.hash.startsWith('#photo-') ? location.hash.slice('#photo-'.length) : undefined);
	if (openId) openLightbox(openId);
}

if (typeof window !== 'undefined' && window.__GP_GALLERY__) {
	initGalleryClient(window.__GP_GALLERY__);
}
