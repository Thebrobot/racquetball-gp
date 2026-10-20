import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventSnapshot, MatchOverridePatch, OverrideApplication, OverrideFile } from './types';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OVERRIDES_PATH = resolve(here, '../../../scripts/match-result-overrides.json');

export function loadOverrides(path = DEFAULT_OVERRIDES_PATH): OverrideFile {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as OverrideFile;
	} catch {
		return {};
	}
}

/** Explicit, logged manual corrections. Applied after scrape validation, never silently. */
export function applyOverrides(snapshot: EventSnapshot, overrides: OverrideFile, at = new Date().toISOString()): EventSnapshot {
	const eventOverrides = overrides[snapshot.slug] ?? {};
	const applied: OverrideApplication[] = [...snapshot.overridesApplied];
	const divisions = { ...snapshot.divisions };

	for (const [divisionId, matches] of Object.entries(eventOverrides)) {
		const div = divisions[divisionId];
		if (!div || !matches || typeof matches !== 'object') continue;
		const nextMatches = { ...div.matches };
		for (const [matchId, patch] of Object.entries(matches)) {
			if (!patch || typeof patch !== 'object') continue;
			const clean: MatchOverridePatch = {};
			if ('winner' in patch) clean.winner = patch.winner;
			if ('score' in patch) clean.score = patch.score;
			if ('player1' in patch) clean.player1 = patch.player1;
			if ('player2' in patch) clean.player2 = patch.player2;
			const existing = nextMatches[matchId] ?? {
				r2MatchId: '',
				matchId,
				player1: null,
				player2: null,
				winner: null,
				score: null,
				status: 'unknown' as const,
				winMethod: 'manual-override',
				roundLabel: null,
				court: null,
				scheduled: null,
				confirmed: true,
				isDoubles: false,
			};
			nextMatches[matchId] = {
				...existing,
				...clean,
				confirmed: true,
				winMethod: existing.winMethod ?? 'manual-override',
			};
			applied.push({
				at,
				eventSlug: snapshot.slug,
				divisionId,
				matchId,
				patch: { ...clean, ...(patch.note ? { note: patch.note } : {}) },
			});
		}
		divisions[divisionId] = {
			...div,
			matches: nextMatches,
			matchCount: Object.keys(nextMatches).length,
			confirmedCount: Object.values(nextMatches).filter((m) => m.confirmed).length,
		};
	}

	return { ...snapshot, divisions, overridesApplied: applied };
}
