export interface GuestClinic {
	title: string;
	when: string;
	price: string;
	featured?: boolean;
}

export interface GuestPrivateLesson {
	when: string;
	slots: string;
	price: string;
}

export interface GuestPartner {
	name: string;
	url: string;
}

export interface GuestAppearances {
	autographs: string;
}

export interface GuestSocialLinks {
	instagram?: string;
	x?: string;
}

export interface GuestStatCard {
	value: string;
	label: string;
}

export interface GuestLearnTopic {
	icon: string;
	title: string;
	description: string;
}

export interface GuestScheduleSession {
	day: string;
	title: string;
	description: string;
	price: string;
	featured?: boolean;
}

export interface GuestSpotlight {
	slug: string;
	name: string;
	nickname: string;
	eventName: string;
	eventDates: string;
	venue: string;
	registerUrl: string;
	pageHref: string;
	/** ISO 8601 dates for structured data */
	eventStartDate: string;
	eventEndDate: string;
	eventCity: string;
	eventRegion: string;
	/** 1200×630 social share image */
	ogImage: string;
	heroImage: string;
	heroImageAlt: string;
	heroVideo?: string;
	heroVideoPoster?: string;
	heroEyebrow: string;
	heroHeadline: string;
	heroCopy: string;
	presentedBy: string;
	intro: string;
	quickStats: string[];
	statCards: GuestStatCard[];
	aboutHeadline: string;
	aboutParagraphs: string[];
	aboutHighlights: string[];
	learnTopics: GuestLearnTopic[];
	careerHighlights: string[];
	clinics: GuestClinic[];
	privateLessons: GuestPrivateLesson[];
	scheduleSessions: GuestScheduleSession[];
	partner: GuestPartner;
	appearances: GuestAppearances;
	finalCtaHeadline: string;
	finalCtaCopy: string;
	quote?: string;
	gear?: string;
	videoUrl?: string;
	socialLinks?: GuestSocialLinks;
}

export const dlrSpotlight: GuestSpotlight = {
	slug: 'daniel-de-la-rosa',
	name: 'Daniel De La Rosa',
	nickname: 'DLR',
	eventName: 'Sarasota Open',
	eventDates: 'July 10–12, 2026',
	venue: 'Sarasota YMCA',
	registerUrl: 'https://www.r2sports.com/tourney/home.asp?TID=54249',
	pageHref: '/spotlight/daniel-de-la-rosa',
	eventStartDate: '2026-07-10',
	eventEndDate: '2026-07-12',
	eventCity: 'Sarasota',
	eventRegion: 'FL',
	ogImage: '/images/spotlight/dlr-og.webp',
	heroImage: '/images/spotlight/dlr-action.webp',
	heroImageAlt: 'Daniel De La Rosa celebrating during a professional racquetball match',
	heroVideo: '/videos/dlr-hero.mp4',
	heroVideoPoster: '/images/spotlight/dlr-action.webp',
	heroEyebrow: 'Sarasota Open Special Appearance',
	heroHeadline: 'Train With World Champion Daniel De La Rosa',
	heroCopy:
		'A rare opportunity to learn from one of the most accomplished players in modern racquetball during a full weekend of competition, instruction, clinics, and private lessons.',
	presentedBy: 'Grand Prix Racquetball',
	intro:
		'Grand Prix Racquetball and ProKennex are super excited to bring Daniel De La Rosa to Sarasota, FL for a full weekend of competition and instructional clinics.',
	quickStats: ['World Champion', '3× IRT #1', '12 Pro Titles'],
	statCards: [
		{ value: '2024', label: 'IRF World Singles Champion' },
		{ value: '3×', label: 'IRT Year-End No. 1' },
		{ value: '12', label: 'IRT Pro Singles Titles' },
		{ value: '2021', label: 'US Open Singles Champion' },
	],
	aboutHeadline: "One of the sport's most electric competitors.",
	aboutParagraphs: [
		'Daniel De La Rosa brings championship-level experience, explosive athleticism, and a modern attacking style that players of every level can learn from.',
		'He has reached the top of professional racquetball, winning the 2024 IRF World Singles title, the 2021 US Open Singles Championship, and finishing as the IRT\'s year-end No. 1 for three straight seasons.',
	],
	aboutHighlights: [
		'US Open Singles Champion and multiple-time US Open Doubles Champion',
		'Known for elite court movement, shot-making, and competitive intensity',
		'Clinic instruction designed for real improvement, not just demonstration',
	],
	learnTopics: [
		{
			icon: '🎯',
			title: 'Shot Selection',
			description:
				'Understand when to attack, reset, pinch, pass, and create better scoring opportunities.',
		},
		{
			icon: '⚡',
			title: 'Serve & Return',
			description: 'Learn how elite players use serves and returns to control the opening of a rally.',
		},
		{
			icon: '🏃',
			title: 'Court Movement',
			description: 'Improve positioning, recovery, spacing, and efficiency inside the court.',
		},
		{
			icon: '🧠',
			title: 'Mental Game',
			description: 'Develop the mindset and match awareness needed to compete under pressure.',
		},
		{
			icon: '🏆',
			title: 'Tournament Prep',
			description: 'Get a behind-the-scenes look at how pros prepare for high-level competition.',
		},
		{
			icon: '👥',
			title: 'Live Coaching',
			description: 'See demonstrations, ask questions, and receive insight you can immediately use.',
		},
	],
	careerHighlights: [
		'IRF World Singles Champion (2024)',
		'US Open Singles (2021)',
		'US Open Doubles (2018, 2021, 2022)',
		'3× IRT Year-End #1 (2021, 2022, 2023)',
		'12 IRT Pro Singles Titles',
	],
	clinics: [
		{ title: 'Racquetball Clinic', when: 'Friday, July 10 · 3–5pm', price: '$60' },
		{ title: 'Juniors Clinic', when: 'Sunday, July 12 · 10am', price: 'FREE', featured: true },
	],
	privateLessons: [
		{ when: 'Thursday, July 9', slots: '6pm & 7pm', price: '$120' },
		{ when: 'Friday, July 10', slots: '11am & 1pm', price: '$120' },
	],
	scheduleSessions: [
		{
			day: 'Thursday, July 9',
			title: 'Private Lessons',
			description: '1-hour lessons available at 6:00 PM and 7:00 PM.',
			price: '$120',
		},
		{
			day: 'Friday, July 10',
			title: 'Private Lessons',
			description: '1-hour lessons available at 11:00 AM and 1:00 PM.',
			price: '$120',
		},
		{
			day: 'Friday, July 10',
			title: 'Racquetball Clinic',
			description: 'Group clinic from 3:00 PM to 5:00 PM.',
			price: '$60',
		},
		{
			day: 'Sunday, July 12',
			title: 'Juniors Clinic',
			description: 'Junior players clinic at 10:00 AM.',
			price: 'FREE',
			featured: true,
		},
	],
	partner: {
		name: 'ProKennex',
		url: 'https://prokennex-racquetball.com/',
	},
	appearances: {
		autographs: 'Details coming soon — check back before the event.',
	},
	finalCtaHeadline: 'Reserve Your Spot With Daniel',
	finalCtaCopy:
		"Whether you're chasing your next tournament win or simply want to learn from one of the best to ever step on the court, this is a rare chance to train with a world champion in Sarasota.",
};
