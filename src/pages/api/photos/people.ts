import type { APIRoute } from 'astro';
import { createAdminClient, getSession, json } from '../../../lib/accounts/supabase';
import { isValidPhotoId } from '../../../lib/accounts/visitor';
import { getAllPlayers } from '../../../data/players';
import { canRemovePhotoTag } from '../../../lib/accounts/photo-tags';

export const prerender = false;

export type PhotoPerson = { slug: string; name: string; displayName: string | null; canRemove: boolean };
export type PhotoLiker = { name: string; slug: string | null };

/** Who is tagged in a photo and who liked it, plus what the viewer may do. */
export const GET: APIRoute = async ({ request, cookies, url }) => {
	const id = url.searchParams.get('id') ?? '';
	if (!isValidPhotoId(id)) return json({ error: 'Bad photo id.' }, 400);
	const admin = createAdminClient();
	if (!admin) return json({ tags: [], likers: [], viewer: { signedIn: false } });

	const [tagsRes, likersRes, session] = await Promise.all([
		admin.from('photo_tags').select('player_slug, tagged_by').eq('photo_id', id),
		admin.from('photo_likers').select('display_name, player_slug, created_at').eq('photo_id', id).order('created_at', { ascending: false }),
		getSession(request, cookies),
	]);

	const actor = {
		signedIn: Boolean(session),
		userId: session?.user.id ?? null,
		isAdmin: Boolean(session?.isAdmin),
		playerSlug: session?.profile?.player_slug ?? null,
	};
	const players = new Map(getAllPlayers().map((p) => [p.slug, p.name]));
	const tags: PhotoPerson[] = ((tagsRes.data ?? []) as { player_slug: string; tagged_by: string | null }[])
		.filter((t) => players.has(t.player_slug))
		.map((t) => ({
			slug: t.player_slug,
			name: players.get(t.player_slug)!,
			displayName: null,
			canRemove: canRemovePhotoTag(actor, { slug: t.player_slug, taggedBy: t.tagged_by }),
		}));
	const likers: PhotoLiker[] = ((likersRes.data ?? []) as { display_name: string | null; player_slug: string | null }[]).map((l) => ({
		name: l.display_name || 'A fan',
		slug: l.player_slug,
	}));

	const mySlug = session?.profile?.player_slug ?? null;
	return json(
		{
			tags,
			likers,
			viewer: {
				signedIn: Boolean(session),
				playerSlug: mySlug,
				isAdmin: Boolean(session?.isAdmin),
				tagged: Boolean(mySlug && tags.some((t) => t.slug === mySlug)),
			},
		},
		200,
		{ 'Cache-Control': 'no-store' },
	);
};
