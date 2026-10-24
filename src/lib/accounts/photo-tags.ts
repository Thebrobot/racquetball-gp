export type PhotoTagActor = {
	signedIn: boolean;
	userId: string | null;
	isAdmin: boolean;
	playerSlug: string | null;
};

export type PhotoTagRow = {
	slug: string;
	taggedBy: string | null;
};

/** Any signed-in account can add a tag. Duplicates are rejected by (photo_id, player_slug). */
export function canAddPhotoTag(actor: Pick<PhotoTagActor, 'signedIn'>): boolean {
	return actor.signedIn;
}

/** Tagger, the tagged player's account owner, or an admin may remove a tag. */
export function canRemovePhotoTag(actor: PhotoTagActor, tag: PhotoTagRow): boolean {
	if (!actor.signedIn || !actor.userId) return false;
	if (actor.isAdmin) return true;
	if (tag.taggedBy && tag.taggedBy === actor.userId) return true;
	if (actor.playerSlug && tag.slug === actor.playerSlug) return true;
	return false;
}
