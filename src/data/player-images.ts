/**
 * Player headshots: R2 source URLs + locally cached WebP variants (see sync-player-photos.mjs).
 * Prefer cached images — they are sharpened and sized for each display context.
 */
import playerPhotos from './player-photos.json';

export const PLAYER_IMAGES_R2: Record<string, string> = {
	'Michael Ammen':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/21349_large.jpg',
	'Brendan Anthony':         'https://www.r2sports.com/tourney/imageGallery/gallery/player/506818_bcf9_sm.png',
	'Kyle Artman':             'https://www.r2sports.com/tourney/imageGallery/gallery/player/497001_85e20c36f3_sm.jpg',
	'Chad Beacher':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/281288_648f065f38_sm.jpg',
	'Laura Brandt':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/9155_ca66e7f493_sm.jpg',
	'Daniel Bray':             'https://www.r2sports.com/tourney/imageGallery/gallery/player/79649_760f42c6b2_sm.jpg',
	'Matthew Brice':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/615893_ecbfc78fb8_sm.jpg',
	'Mike Caldwell':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/641792_ba6f31de1f_sm.png',
	'Charles Cole':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/12924_f9d302f00a_sm.jpg',
	'Jordan Deeney':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/161654_96ffb09ab6_sm.jpg',
	'Jonathan Estepan':        'https://www.r2sports.com/tourney/imageGallery/gallery/player/635542_6575a01d5d_sm.png',
	'Alexis Fajardo':          'https://www.r2sports.com/tourney/imageGallery/gallery/player/611588_c1b1da20ea_sm.jpg',
	'Philip Gaerlan':          'https://www.r2sports.com/tourney/imageGallery/gallery/player/17965_large.jpg',
	'Trace Gunsch':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/619991_3b38d92c21_sm.jpg',
	'Scott Haacke':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/621714_446eceb8b6_sm.jpg',
	'Felix Hernandez':         'https://www.r2sports.com/tourney/imageGallery/gallery/player/42578_997c31ed4b_sm.jpg',
	'Alejandro Herrera':       'https://www.r2sports.com/tourney/imageGallery/gallery/player/29542_25d823c745_sm.jpg',
	'John Johnston':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/20910_large.jpg',
	'Gordon Kelly':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/31436_b78f_sm.png',
	'Matt Kern':               'https://www.r2sports.com/tourney/imageGallery/gallery/player/589800_5981f55b41_sm.jpg',
	'Steven Lewis':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/92627_large.jpg',
	'Frank Lopez':             'https://www.r2sports.com/tourney/imageGallery/gallery/player/0_116076db16_sm.png',
	'Mark Manzano':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/271047_e9c92ce348_sm.jpg',
	'Edgar Martinez':          'https://www.r2sports.com/tourney/imageGallery/gallery/player/594572_dc533458b0_sm.jpg',
	'Jorge Moreno':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/99798_a9c0f8345c_sm.jpg',
	'Mauricio Muriel':         'https://www.r2sports.com/tourney/imageGallery/gallery/player/54218_315c01963e_sm.jpg',
	'Charles Nolan':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/507854_75bc6ebdba_sm.jpg',
	'Kleber Oliveira':         'https://www.r2sports.com/tourney/imageGallery/gallery/player/278088_1f2326f396_sm.jpg',
	"Russell O'Neal":          'https://www.r2sports.com/tourney/imageGallery/gallery/player/620873_627eb9ed8f_sm.png',
	'Dylan Pruitt':            'https://www.r2sports.com/tourney/imageGallery/gallery/player/155203_a1b79150ed_sm.jpg',
	'Andres Ramirez':          'https://www.r2sports.com/tourney/imageGallery/gallery/player/20741_large.jpg',
	'Yelandi Rivero':          'https://www.r2sports.com/tourney/imageGallery/gallery/player/93412_large.jpg',
	'Jim Russell':             'https://www.r2sports.com/tourney/imageGallery/gallery/player/34862_large.jpg',
	'Timothy Schnellenberger': 'https://www.r2sports.com/tourney/imageGallery/gallery/player/243897_e7fc_sm.png',
	'Paul Sotolongo':          'https://www.r2sports.com/tourney/imageGallery/gallery/player/632924_bcb6980e01_sm.jpg',
	'Chris Steinheiser':       'https://www.r2sports.com/tourney/imageGallery/gallery/player/131153_56c067f08c_sm.jpg',
	'Wade Stubanas':           'https://www.r2sports.com/tourney/imageGallery/gallery/player/160212_bac9bfb2af_sm.jpg',
};

/** @deprecated Prefer resolvePlayerImage / getPlayerImageForDisplay */
export const PLAYER_IMAGES: Record<string, string> = PLAYER_IMAGES_R2;

export interface PlayerPhotoEntry {
	slug: string;
	sourceUrl: string;
	sourceWidth: number;
	sourceHeight: number;
	sizes: Record<string, string>;
	default: string;
}

function normalizeNameForMatch(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function findManifestEntry(name: string): PlayerPhotoEntry | undefined {
	const map = playerPhotos.players as Record<string, PlayerPhotoEntry>;
	if (map[name]) return map[name];

	const norm = normalizeNameForMatch(name);
	for (const [key, entry] of Object.entries(map)) {
		if (normalizeNameForMatch(key) === norm) return entry;
	}

	const parts = norm.split(' ').filter(Boolean);
	if (parts.length >= 2) {
		const first = parts[0];
		const last = parts[parts.length - 1];
		for (const [key, entry] of Object.entries(map)) {
			const kp = normalizeNameForMatch(key).split(' ').filter(Boolean);
			if (kp.length >= 2 && kp[0] === first && kp[kp.length - 1] === last) return entry;
		}
	}

	return undefined;
}

function resolveR2Image(name: string): string | undefined {
	if (PLAYER_IMAGES_R2[name]) return PLAYER_IMAGES_R2[name];

	const norm = normalizeNameForMatch(name);
	for (const [key, url] of Object.entries(PLAYER_IMAGES_R2)) {
		if (normalizeNameForMatch(key) === norm) return url;
	}

	const parts = norm.split(' ').filter(Boolean);
	if (parts.length >= 2) {
		const first = parts[0];
		const last = parts[parts.length - 1];
		for (const [key, url] of Object.entries(PLAYER_IMAGES_R2)) {
			const kp = normalizeNameForMatch(key).split(' ').filter(Boolean);
			if (kp.length >= 2 && kp[0] === first && kp[kp.length - 1] === last) return url;
		}
	}

	return undefined;
}

/** Best image URL for a CSS display size (px). Uses cached WebP when available. */
export function getPlayerImageForDisplay(name: string, cssPx: number): string | undefined {
	const entry = findManifestEntry(name);
	if (entry) {
		const need = Math.ceil(cssPx * 2);
		const tiers: { w: number; src: string }[] = [64, 128, 256]
			.filter((w) => entry.sizes[String(w)])
			.map((w) => ({ w, src: entry.sizes[String(w)] }));
		if (entry.sizes.full) {
			tiers.push({ w: entry.sourceWidth, src: entry.sizes.full });
		}
		tiers.sort((a, b) => a.w - b.w);
		const pick = tiers.find((t) => t.w >= need) ?? tiers[tiers.length - 1];
		return pick?.src;
	}
	return resolveR2Image(name);
}

/** Default image (128px tier when cached). */
export function resolvePlayerImage(name: string): string | undefined {
	return getPlayerImageForDisplay(name, 64);
}

/** src + srcset for responsive player photos. */
export function getPlayerImageSrcSet(name: string, cssPx: number): { src: string; srcSet?: string } | undefined {
	const entry = findManifestEntry(name);
	if (!entry) {
		const r2 = resolveR2Image(name);
		return r2 ? { src: r2 } : undefined;
	}

	const tiers: { w: number; src: string }[] = [64, 128, 256]
		.filter((w) => entry.sizes[String(w)])
		.map((w) => ({ w, src: entry.sizes[String(w)] }));
	if (entry.sizes.full) {
		tiers.push({ w: entry.sourceWidth, src: entry.sizes.full });
	}
	tiers.sort((a, b) => a.w - b.w);
	if (!tiers.length) return undefined;

	const srcSet = tiers.map((t) => `${t.src} ${t.w}w`).join(', ');
	const src = getPlayerImageForDisplay(name, cssPx) ?? entry.default;
	return src ? { src, srcSet } : undefined;
}
