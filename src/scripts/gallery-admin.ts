import { upload } from '@vercel/blob/client';

/** Re-encode to JPEG so iPhone HEIC/empty-type photos work everywhere. */
async function fileToJpeg(file: File): Promise<File> {
	const type = (file.type || '').toLowerCase();
	const name = file.name.toLowerCase();
	const alreadyJpeg = type === 'image/jpeg' || type === 'image/jpg' || /\.jpe?g$/.test(name);
	if (alreadyJpeg && file.size < 4 * 1024 * 1024) {
		return file;
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error(
			'Could not read this photo. On iPhone, try Settings → Camera → Formats → Most Compatible, or export as JPEG.',
		);
	}

	const maxEdge = 2400;
	const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		throw new Error('Could not process this photo on this device.');
	}
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Could not convert photo to JPEG.'))),
			'image/jpeg',
			0.88,
		);
	});

	const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
	return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

type RegisteredPhoto = {
	id: string;
	url: string;
	pathname: string;
	album: string;
	caption?: string;
	albumLabel: string;
};

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function prependAdminItem(list: HTMLElement, photo: RegisteredPhoto): void {
	const existing = list.querySelector(`[data-id="${CSS.escape(photo.id)}"]`);
	if (existing) return;

	const li = document.createElement('li');
	li.className = 'gallery-admin-item';
	li.dataset.id = photo.id;
	li.innerHTML = `
		<img src="${escapeHtml(photo.url)}" alt="" loading="lazy" decoding="async" />
		<div class="gallery-admin-item-meta">
			<span>${escapeHtml(photo.albumLabel || photo.album)}</span>
			${photo.caption ? `<span class="gallery-admin-item-cap">${escapeHtml(photo.caption)}</span>` : ''}
		</div>
		<button type="button" class="gallery-admin-delete" data-delete="${escapeHtml(photo.id)}">Delete</button>
	`;
	list.prepend(li);
}

function updateListTitle(count: number): void {
	const title = document.getElementById('gallery-admin-list-title');
	if (title) title.textContent = `Uploaded (${count})`;
}

function initGalleryAdmin(): void {
	const form = document.getElementById('gallery-upload-form') as HTMLFormElement | null;
	const status = document.getElementById('gallery-upload-status');
	const btn = document.getElementById('gallery-upload-btn') as HTMLButtonElement | null;
	const logout = document.getElementById('gallery-logout');
	const list = document.getElementById('gallery-admin-list');

	form?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const albumEl = document.getElementById('gallery-album') as HTMLSelectElement | null;
		const captionEl = document.getElementById('gallery-caption') as HTMLInputElement | null;
		const filesInput = document.getElementById('gallery-files') as HTMLInputElement | null;
		const files = filesInput?.files;
		if (!files?.length || !albumEl || !btn || !status) return;

		btn.disabled = true;
		let ok = 0;
		let fail = 0;
		let lastCount = 0;
		const album = albumEl.value;
		const caption = captionEl?.value.trim() || undefined;
		if (!album) {
			status.textContent = 'Select an event before uploading.';
			btn.disabled = false;
			return;
		}

		const fileList = Array.from(files);

		for (let i = 0; i < fileList.length; i++) {
			const original = fileList[i];
			status.textContent = `Preparing ${i + 1} of ${fileList.length}…`;
			const id = crypto.randomUUID();

			try {
				const jpeg = await fileToJpeg(original);
				const pathname = `gallery/${album}/${id}.jpg`;
				status.textContent = `Uploading ${i + 1} of ${fileList.length}… 0%`;

				const blob = await upload(pathname, jpeg, {
					access: 'public',
					handleUploadUrl: '/api/gallery/blob-upload',
					clientPayload: JSON.stringify({ album, caption, id }),
					contentType: 'image/jpeg',
					onUploadProgress: ({ percentage }) => {
						status.textContent = `Uploading ${i + 1} of ${fileList.length}… ${Math.round(percentage)}%`;
					},
				});

				status.textContent = `Saving ${i + 1} of ${fileList.length} to gallery…`;
				const reg = await fetch('/api/gallery/register', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id,
						url: blob.url,
						pathname: blob.pathname,
						album,
						caption,
					}),
				});

				const data = (await reg.json().catch(() => ({}))) as {
					error?: string;
					photoCount?: number;
					photo?: RegisteredPhoto;
				};

				if (!reg.ok) {
					fail++;
					status.textContent = data.error || 'Uploaded file but failed to add it to the gallery list.';
				} else {
					ok++;
					if (typeof data.photoCount === 'number') lastCount = data.photoCount;
					if (data.photo && list) {
						prependAdminItem(list, data.photo);
						updateListTitle(lastCount || list.children.length);
					}
				}
			} catch (err) {
				fail++;
				const message = err instanceof Error ? err.message : 'Upload failed.';
				status.textContent = message;
				console.error('Gallery upload error', err);
			}
		}

		if (filesInput) filesInput.value = '';
		btn.disabled = false;

		if (fail === 0) {
			status.innerHTML = `Uploaded ${ok} photo${ok === 1 ? '' : 's'}. <a href="/gallery?fresh=${Date.now()}">View gallery →</a>`;
		} else if (ok > 0) {
			status.textContent = `Uploaded ${ok}, failed ${fail}. Check the list above — successful ones should appear there.`;
		}
	});

	logout?.addEventListener('click', async () => {
		await fetch('/api/gallery/logout', { method: 'POST' });
		location.reload();
	});

	list?.addEventListener('click', async (e) => {
		const t = (e.target as HTMLElement).closest('[data-delete]') as HTMLElement | null;
		if (!t) return;
		const id = t.getAttribute('data-delete');
		if (!id || !confirm('Delete this photo?')) return;
		const res = await fetch('/api/gallery/delete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id }),
		});
		if (res.ok) {
			t.closest('.gallery-admin-item')?.remove();
			if (list) updateListTitle(list.children.length);
		} else {
			alert('Could not delete photo.');
		}
	});
}

initGalleryAdmin();
