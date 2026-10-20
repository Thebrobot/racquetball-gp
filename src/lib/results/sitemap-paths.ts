import { EVENT_SKELETONS } from '../../data/events';
import { LB_DIVISIONS_BY_CATEGORY } from '../../data/leaderboard';
import { getAllPlayers } from '../../data/players';

/** SSR score/profile routes the sitemap plugin would otherwise miss. */
export function resultsSitemapPaths(): string[] {
	const paths = ['/live', '/sync-status', '/leaderboard'];
	for (const list of Object.values(LB_DIVISIONS_BY_CATEGORY)) {
		for (const div of list) paths.push(`/leaderboard/${div.id}`);
	}
	for (const event of EVENT_SKELETONS) {
		paths.push(`/events/${event.slug}`, `/events/${event.slug}/divisions`, `/events/${event.slug}/participants`);
		for (const div of event.divisionDetails) {
			paths.push(`/events/${event.slug}/divisions/${div.id}`);
		}
	}
	for (const player of getAllPlayers()) {
		paths.push(`/players/${player.slug}`);
	}
	return paths;
}
