// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
const site = env.PUBLIC_SITE_URL || 'https://www.racquetballgp.com';

// https://astro.build/config
export default defineConfig({
	site,
	adapter: vercel(),
	integrations: [sitemap()],
});
