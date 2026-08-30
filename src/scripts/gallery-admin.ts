import { upload } from '@vercel/blob/client';

function extFor(file: File): string {
	const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
	if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
	if (file.type === 'image/png') return 'png';
	if (file.type === 'image/webp') return 'webp';
	if (file.type === 'image/gif') return 'gif';
	if (file.type === 'image/heic' || file.type === 'image/heif') return 'heic';
	return 'jpg';
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
		const album = albumEl.value;
		const caption = captionEl?.value.trim() || undefined;
		if (!album) {
			status.textContent = 'Select an event before uploading.';
			btn.disabled = false;
			return;
		}

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			status.textContent = `Uploading ${i + 1} of ${files.length}…`;
			const id = crypto.randomUUID();
			const pathname = `gallery/${album}/${id}.${extFor(file)}`;

			try {
				const blob = await upload(pathname, file, {
					access: 'public',
					handleUploadUrl: '/api/gallery/blob-upload',
					clientPayload: JSON.stringify({ album, caption, id }),
				});

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

				if (!reg.ok) {
					fail++;
					const data = (await reg.json().catch(() => ({}))) as { error?: string };
					status.textContent = data.error || 'Saved upload but failed to list photo.';
				} else {
					ok++;
				}
			} catch (err) {
				fail++;
				const message = err instanceof Error ? err.message : 'Upload failed.';
				status.textContent = message;
			}
		}

		status.textContent =
			fail === 0
				? `Uploaded ${ok} photo${ok === 1 ? '' : 's'}. Reloading…`
				: `Uploaded ${ok}, failed ${fail}. Reloading…`;
		setTimeout(() => location.reload(), 800);
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
		} else {
			alert('Could not delete photo.');
		}
	});
}

initGalleryAdmin();
