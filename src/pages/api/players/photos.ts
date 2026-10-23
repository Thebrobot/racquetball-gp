import type { APIRoute } from 'astro';
import { createAdminClient, json } from '../../../lib/accounts/supabase';
import { readGalleryIndex } from '../../../lib/gallery/store';
import { albumById, albumBySlug, albumLabel } from '../../../lib/gallery/albums';

export const prerender = false;

/** Photos a player is tagged in, newest first. Used by the prerendered profile page. */
export const GET: APIRoute = async ({ url }) => {
	const slug = (url.searchParams.get('slug') ?? '').trim();
	if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ photos: [] }, 400);
	const admin = createAdminClient();
	if (!admin) return json({ photos: [] });

	const { data } = await admin.from('photo_tags').select('photo_id, created_at').eq('player_slug', slug).order('created_at', { ascending: false }).limit(60);
	const ids = ((data ?? []) as { photo_id: string }[]).map((t) => t.photo_id);
	if (!ids.length) return json({ photos: [] }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });

	const index = await readGalleryIndex();
	const byId = new Map(index.photos.map((p) => [p.id, p]));
	const photos = ids
		.map((id) => byId.get(id))
		.filter((p): p is NonNullable<typeof p> => Boolean(p))
		.map((p) => {
			const album = albumById(p.album) ?? albumBySlug(p.album);
			return {
				id: p.id,
				url: p.url,
				album: p.album,
				albumLabel: albumLabel(p.album),
				href: album ? `/gallery?event=${album.slug}&photo=${p.id}` : `/gallery?photo=${p.id}`,
				caption: p.caption ?? null,
				width: p.width ?? null,
				height: p.height ?? null,
				createdAt: p.createdAt,
			};
		});
	return json({ photos }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
};
