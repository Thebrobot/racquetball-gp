/**
 * Social data for gallery pages: per-photo like/view/share counts (public) and
 * which photos the current visitor has liked. Degrades to empty when accounts
 * are not configured, so the gallery always renders.
 */
import type { AstroCookies } from 'astro';
import { createAdminClient, createSessionClient, getSession } from './supabase';

export type PhotoStat = { likes: number; views: number; shares: number };
export type GallerySocial = {
	stats: Record<string, PhotoStat>;
	likedIds: string[];
	signedIn: boolean;
};

export async function getGallerySocial(request: Request, cookies: AstroCookies): Promise<GallerySocial> {
	const empty: GallerySocial = { stats: {}, likedIds: [], signedIn: false };
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
	return { stats, likedIds, signedIn: Boolean(session) };
}
