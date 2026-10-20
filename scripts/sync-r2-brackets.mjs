/**
 * Retired. The Playwright draw-page scraper has been replaced by
 * scripts/sync-brackets.ts (match-page fetch + validation + Vercel Blob).
 *
 * This stub keeps old docs/scripts from silently writing bad JSON.
 */
console.error(`sync-r2-brackets.mjs is retired.
Use:  npx tsx scripts/sync-brackets.ts [--event sarasota-open]
Scheduled sync is the Vercel Cron at /api/cron/sync-brackets.`);
process.exit(1);
