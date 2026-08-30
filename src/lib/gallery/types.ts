export type GalleryPhoto = {
	id: string;
	url: string;
	pathname: string;
	album: string;
	caption?: string;
	createdAt: string;
};

export type GalleryIndex = {
	version: 1;
	photos: GalleryPhoto[];
};

export type GalleryAlbum = {
	id: string;
	label: string;
};

export type GalleryClientConfig = {
	photos: GalleryPhoto[];
	albums: GalleryAlbum[];
	initialAlbum?: string;
	initialOpenId?: string;
	siteOrigin: string;
	mode?: 'browse' | 'collection';
};
