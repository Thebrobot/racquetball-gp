// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';
import playerAliases from './src/data/player-aliases.json' with { type: 'json' };

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
	adapter: vercel(),
	redirects: aliasRedirects,
	image: {
		remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
	},
	integrations: [
		sitemap({
			filter: (page) => !page.includes('/gallery/admin') && !page.includes('/api/'),
		}),
	],
});
