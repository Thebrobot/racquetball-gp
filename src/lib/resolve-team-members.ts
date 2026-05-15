import { EVENTS } from '../data/events';

export type TeamResolveCtx = { eventName: string; division: string; time?: string };

export type TeamMemberPlayer = { name: string; slug: string };

function profileMatchesScheduleTicket(
	p: { name: string },
	eventName: string,
	division: string,
	time: string | undefined,
	requireTime: boolean,
): boolean {
	const event = EVENTS.find((e) => e.name === eventName);
	if (!event?.profiles) return false;
	return event.profiles.some(
		(ep) =>
			ep.name === p.name &&
			ep.division === division &&
			(!requireTime || !time || ep.time === time),
	);
}

function pickPlayerForToken(candidates: TeamMemberPlayer[], ctx?: TeamResolveCtx): TeamMemberPlayer | undefined {
	if (candidates.length === 0) return undefined;
	if (candidates.length === 1) return candidates[0];
	if (!ctx?.eventName || !ctx?.division) return candidates[0];

	const withTime = candidates.filter((p) =>
		profileMatchesScheduleTicket(p, ctx.eventName, ctx.division, ctx.time, true),
	);
	if (withTime.length === 1) return withTime[0];

	const divOnly = candidates.filter((p) =>
		profileMatchesScheduleTicket(p, ctx.eventName, ctx.division, ctx.time, false),
	);
	if (divOnly.length === 1) return divOnly[0];

	return candidates[0];
}

/**
 * Map bracket last-name tokens ("Artman / Jennings") to roster names + profile slugs.
 * When several players share a suffix (e.g. two Jennings), use the event participant list
 * (same division + optional call time) to pick the correct player.
 */
export function resolveTeamMembers(
	teamStr: string,
	allPlayers: TeamMemberPlayer[],
	ctx?: TeamResolveCtx,
): { name: string; slug?: string }[] {
	return teamStr.split(/\s*\/\s*/).map((part) => {
		part = part.trim();
		const partLower = part.toLowerCase();
		const initMatch = part.match(/^([A-Za-z])\.\s+(.+)$/);
		if (initMatch) {
			const [, init, lastName] = initMatch;
			const lnLower = lastName.toLowerCase();
			const pool = allPlayers.filter(
				(p) =>
					p.name.toLowerCase().endsWith(lnLower) &&
					p.name[0].toLowerCase() === init.toLowerCase(),
			);
			const found = pickPlayerForToken(pool, ctx);
			if (found) return { name: found.name, slug: found.slug };
		}
		const pool = allPlayers.filter((p) => p.name.toLowerCase().endsWith(partLower));
		const found = pickPlayerForToken(pool, ctx);
		if (found) return { name: found.name, slug: found.slug };
		return { name: part };
	});
}
