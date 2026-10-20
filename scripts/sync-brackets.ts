/**
 * Manual / CLI entry for the R2 results sync.
 *
 *   npx tsx scripts/sync-brackets.ts
 *   npx tsx scripts/sync-brackets.ts --scheduled   # honor event windows
 *   npx tsx scripts/sync-brackets.ts --event sarasota-open
 */
import { R2_SYNC_EVENTS } from '../src/lib/results/config.ts';
import { syncBrackets } from '../src/lib/results/sync.ts';

const args = process.argv.slice(2);
const scheduled = args.includes('--scheduled');
const eventIdx = args.indexOf('--event');
const slug = eventIdx >= 0 ? args[eventIdx + 1] : undefined;
const events = slug ? R2_SYNC_EVENTS.filter((e) => e.slug === slug) : R2_SYNC_EVENTS;

if (slug && !events.length) {
	console.error(`Unknown event "${slug}". Valid: ${R2_SYNC_EVENTS.map((e) => e.slug).join(', ')}`);
	process.exit(1);
}

const result = await syncBrackets({
	events,
	force: !scheduled,
	trigger: scheduled ? 'cron' : 'cli',
});

if (result.skipped) {
	console.log(`Skipped: ${result.reason}`);
} else {
	console.log(`Done. status ok=${result.health.ok} stale=${result.health.staleCount} quarantine=${result.health.quarantineCount}`);
}

if (result.health.events.some((e) => e.status === 'failed')) process.exit(2);
