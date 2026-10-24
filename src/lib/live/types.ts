import type { MatchMap } from './parse-r2';

export type LiveResultsFile = {
	lastUpdated: string | null;
	divisions: Record<string, MatchMap>;
	/** Override keys (`divId:matchId`) that a later real R2 fetch superseded. */
	supersededOverrides?: string[];
};

export type LiveActivityEvent = {
	id: string;
	at: string;
	type: string;
	divisionId: string;
	divisionLabel: string;
	matchId: string;
	headline: string;
	detail?: string;
	bracketHref: string;
	correction?: boolean;
};

export type LiveActivityFeed = {
	lastUpdated: string | null;
	eventSlug: string;
	events: LiveActivityEvent[];
};

export type QuarantinedMatch = {
	matchId: string;
	divisionId?: string;
	reason: string;
};

export type EventSyncStatus = {
	eventKey: string;
	slug: string;
	lastSuccessAt: string | null;
	lastError: string | null;
	lastUpdated: string | null;
	divisionsScraped: number;
	matchesWithResults: number;
	quarantined?: QuarantinedMatch[];
	r2Blocked?: boolean;
	r2BlockedCount?: number;
};

export type SyncStatus = {
	ok: boolean;
	lastRunAt: string | null;
	lastSuccessAt: string | null;
	lastError: string | null;
	inWindow: boolean;
	skipped?: string;
	quarantined?: QuarantinedMatch[];
	r2Blocked?: boolean;
	r2BlockedCount?: number;
	/** Remaining cron runs to skip after an R2 IP block. */
	r2SkipRunsRemaining?: number;
	events: Record<string, EventSyncStatus>;
};
