// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';
import playerAliases from './src/data/player-aliases.json' with { type: 'json' };
import { EVENTS } from './src/data/events.ts';
import { getAllPlayers } from './src/data/players.ts';

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
const site = env.PUBLIC_SITE_URL || 'https://www.racquetballgp.com';

// https://astro.build/config
/** Old profile links for alternate spellings keep working. */
const aliasRedirects = Object.fromEntries(
	Object.entries(playerAliases)
		.filter(([, v]) => typeof v === 'object')
		.map(([alias, v]) => [`/players/${alias}`, `/players/${v.slug}`]),
);

export default defineConfig({
	site,
	adapter: vercel({
		// Bracket sync fetches every R2 division in one invocation.
		maxDuration: 60,
	}),
	redirects: aliasRedirects,
	image: {
		remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
	},
	integrations: [
		sitemap({
			filter: (page) => !page.includes('/gallery/admin') && !page.includes('/api/'),
			// Event + live pages are on-demand (so they can merge Blob results)
			// and would otherwise drop out of the sitemap.
			customPages: [
				...EVENTS.flatMap((event) => {
					const base = `${site.replace(/\/$/, '')}/events/${event.slug}`;
					return [
						`${base}/`,
						`${base}/divisions/`,
						`${base}/participants/`,
						...(event.divisionDetails ?? []).map((d) => `${base}/divisions/${d.id}/`),
					];
				}),
				// Player profiles render on request too (live results), so list them here.
				...getAllPlayers().map((p) => `${site.replace(/\/$/, '')}/players/${p.slug}/`),
			],
		}),
	],
});
