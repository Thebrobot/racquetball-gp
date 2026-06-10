/** Videographer credit for homepage and DLR hero background videos. */
export interface HeroVideoCredit {
	name: string;
	/** Instagram handle without the @ */
	instagram: string;
}

export const heroVideoCredit: HeroVideoCredit = {
	name: 'the fittest photographer',
	instagram: 'thefittestphotographer',
};

export function heroVideoCreditInstagramUrl(credit: HeroVideoCredit): string {
	const handle = credit.instagram.replace(/^@/, '').trim();
	return `https://www.instagram.com/${handle}/`;
}

export function hasHeroVideoCredit(credit: HeroVideoCredit): boolean {
	return Boolean(credit.name.trim() && credit.instagram.trim());
}
