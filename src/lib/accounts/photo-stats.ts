/**
 * Social data for gallery pages: per-photo like/view/share counts (public) and
 * which photos the current visitor has liked. Degrades to empty when accounts
 * are not configured, so the gallery always renders.
 */
import type { AstroCookies } from 'astro';
import { createAdminClient, createSessionClient, getSession } from './supabase';
import { getAllPlayers } from '../../data/players';

export type PhotoStat = { likes: number; views: number; shares: number };
export type GalleryViewer = {
	signedIn: boolean;
	playerSlug: string | null;
	displayName: string | null;
	isAdmin: boolean;
};
export type GallerySocial = {
	stats: Record<string, PhotoStat>;
	likedIds: string[];
	signedIn: boolean;
	viewer: GalleryViewer;
	/** Player list for the admin "tag a player" picker (admins only). */
	players?: { name: string; slug: string }[];
};

export async function getGallerySocial(request: Request, cookies: AstroCookies): Promise<GallerySocial> {
	const empty: GallerySocial = { stats: {}, likedIds: [], signedIn: false, viewer: { signedIn: false, playerSlug: null, displayName: null, isAdmin: false } };
	const admin = createAdminClient();
	if (!admin) return empty;

	const [statsRes, session] = await Promise.all([
		admin.from('photo_stats').select('photo_id, likes, views, shares'),
		getSession(request, cookies),
	]);

	const stats: Record<string, PhotoStat> = {};
	for (const row of (statsRes.data ?? []) as { photo_id: string; likes: number; views: number; shares: number }[]) {
		stats[row.photo_id] = { likes: Number(row.likes) || 0, views: Number(row.views) || 0, shares: Number(row.shares) || 0 };
	}

	let likedIds: string[] = [];
	if (session) {
		const client = createSessionClient(request, cookies)!;
		const { data } = await client.from('photo_likes').select('photo_id').eq('user_id', session.user.id);
		likedIds = ((data ?? []) as { photo_id: string }[]).map((r) => r.photo_id);
	}
	const viewer: GalleryViewer = {
		signedIn: Boolean(session),
		playerSlug: session?.profile?.player_slug ?? null,
		displayName: session?.profile?.display_name ?? null,
		isAdmin: Boolean(session?.isAdmin),
	};
	return {
		stats,
		likedIds,
		signedIn: Boolean(session),
		viewer,
		...(viewer.isAdmin ? { players: getAllPlayers().map((p) => ({ name: p.name, slug: p.slug })) } : {}),
	};
}
