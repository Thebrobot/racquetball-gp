export type GalleryPhoto = {
	id: string;
	url: string;
	pathname: string;
	album: string;
	caption?: string;
	createdAt: string;
	/** Pixel size, stored so the masonry wall can reserve space before the file loads. */
	width?: number;
	height?: number;
	photographer?: string;
	division?: string;
	/** Optional base like count. The public page keeps its own likes in localStorage. */
	likes?: number;
};

export type GalleryIndex = {
	version: 1;
	photos: GalleryPhoto[];
};

export type GalleryAlbum = {
	id: string;
	slug: string;
	/** Event name. `label` matches it so existing admin markup can keep using `label`. */
	label: string;
	name: string;
	date: string;
	location: string;
	coverImage: string;
	description?: string;
	year: number;
};

export type GalleryClientConfig = {
	photos: GalleryPhoto[];
	albums: GalleryAlbum[];
	initialAlbum?: string;
	initialOpenId?: string;
	siteOrigin: string;
	mode?: 'browse' | 'collection';
	/** Central like/view/share counts keyed by photo id (from Supabase). */
	stats?: Record<string, { likes: number; views: number; shares: number }>;
	/** Photos the signed-in visitor has liked. */
	likedIds?: string[];
	signedIn?: boolean;
	viewer?: { signedIn: boolean; playerSlug: string | null; displayName: string | null; isAdmin: boolean };
	players?: { name: string; slug: string }[];
};
