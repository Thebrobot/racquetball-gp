/** Shared types for the R2 Sports results pipeline. */

export type DrawFormat = 'elimination' | 'roundrobin' | 'olympic' | 'pool' | 'playoff' | 'unknown';

export type MatchStatus = 'unplayed' | 'in_progress' | 'played' | 'forfeit' | 'bye' | 'unknown';

export type ScoreRuleSet = 'usar-adult' | 'flexible';

export interface R2EventConfig {
	/** Site event slug, e.g. "sarasota-open". */
	slug: string;
	/** R2 Sports tournament ID. */
	tid: string;
	name: string;
	/**
	 * Inclusive local dates (YYYY-MM-DD) in `timezone`.
	 * Tournaments run Friday–Sunday; the scheduled job uses these plus a morning/Monday buffer.
	 */
	startDate: string;
	endDate: string;
	/** IANA zone. Default America/New_York. */
	timezone?: string;
	/**
	 * Local hour (0–23) on startDate when the scheduled window opens.
	 * Default 6 (Friday morning).
	 */
	windowStartHour?: number;
	/**
	 * Local hour (0–23) on the calendar day after endDate when the window closes.
	 * Default 8 (early Monday after a Sunday finish).
	 */
	windowEndHour?: number;
	/** Adult GP events use 15/11 game rules; other events accept common junior/open formats. */
	scoreRules?: ScoreRuleSet;
}

export interface DiscoveredDivision {
	divID: number;
	combinedID: number;
	code: string;
	label: string;
	format: DrawFormat;
	/** Site division id when this draw maps to events.ts; otherwise a slug from the R2 code. */
	siteId: string;
}

export interface DrawMatchRef {
	r2MatchId: string;
	matchId: string;
}

export interface ParsedDraw {
	divID: number;
	combinedID: number;
	finalUrl: string;
	format: DrawFormat;
	title: string;
	code: string | null;
	label: string | null;
	matches: DrawMatchRef[];
	/** Extra draws linked from this page (consolation / Olympic colors). */
	relatedDraws: Array<{ divID: number; combinedID: number }>;
}

export interface ParsedMatch {
	r2MatchId: string;
	matchId: string | null;
	player1: string | null;
	player2: string | null;
	winner: 1 | 2 | null;
	score: string | null;
	status: MatchStatus;
	winMethod: string | null;
	roundLabel: string | null;
	court: string | null;
	scheduled: string | null;
	divisionCode: string | null;
	divisionLabel: string | null;
	isDoubles: boolean;
}

export interface PublishedMatch {
	r2MatchId: string;
	matchId: string;
	player1: string | null;
	player2: string | null;
	winner: 1 | 2 | null;
	score: string | null;
	status: MatchStatus;
	winMethod: string | null;
	roundLabel: string | null;
	court: string | null;
	scheduled: string | null;
	confirmed: boolean;
	isDoubles: boolean;
}

export interface DivisionSnapshot {
	id: string;
	code: string;
	label: string;
	format: DrawFormat;
	divID: number;
	combinedID: number;
	stale: boolean;
	lastSuccessAt: string | null;
	lastError: string | null;
	matchCount: number;
	confirmedCount: number;
	matches: Record<string, PublishedMatch>;
}

export interface QuarantineItem {
	at: string;
	eventSlug: string;
	divisionId: string;
	matchId: string;
	field: 'winner' | 'score' | 'status' | 'players';
	previous: unknown;
	incoming: unknown;
	reason: string;
}

export interface OverrideApplication {
	at: string;
	eventSlug: string;
	divisionId: string;
	matchId: string;
	patch: Record<string, unknown>;
}

export interface EventSnapshot {
	version: 1;
	slug: string;
	tid: string;
	name: string;
	syncedAt: string;
	status: 'ok' | 'partial' | 'failed' | 'idle';
	divisions: Record<string, DivisionSnapshot>;
	quarantine: QuarantineItem[];
	overridesApplied: OverrideApplication[];
}

export interface DivisionHealth {
	id: string;
	code: string;
	label: string;
	format: DrawFormat;
	stale: boolean;
	lastSuccessAt: string | null;
	lastError: string | null;
	matchCount: number;
	confirmedCount: number;
}

export interface EventHealth {
	slug: string;
	tid: string;
	name: string;
	window: {
		start: string;
		end: string;
		timezone: string;
		active: boolean;
	};
	lastSuccessAt: string | null;
	lastAttemptAt: string | null;
	status: EventSnapshot['status'];
	staleDivisions: number;
	quarantineCount: number;
	divisions: DivisionHealth[];
	quarantine: QuarantineItem[];
	overridesApplied: OverrideApplication[];
}

export interface HealthReport {
	version: 1;
	ok: boolean;
	generatedAt: string;
	scheduler: {
		lastRunAt: string | null;
		lastTrigger: 'cron' | 'manual' | 'cli' | null;
		skipped: 'outside-window' | null;
	};
	staleCount: number;
	quarantineCount: number;
	lastSuccessAt: string | null;
	events: EventHealth[];
}

export interface LiveActivityItem {
	id: string;
	at: string;
	type: 'result';
	divisionId: string;
	divisionLabel: string;
	matchId: string;
	headline: string;
	detail?: string;
	bracketHref: string;
}

export interface LiveActivityFeed {
	lastUpdated: string | null;
	eventSlug: string;
	events: LiveActivityItem[];
}

export type MatchOverridePatch = {
	winner?: 1 | 2 | null;
	score?: string | null;
	player1?: string;
	player2?: string;
	note?: string;
};

export type OverrideFile = Record<string, Record<string, Record<string, MatchOverridePatch>>>;

export interface ValidationIssue {
	level: 'error' | 'warn';
	code: string;
	message: string;
	matchId?: string;
}

export interface DivisionValidation {
	ok: boolean;
	issues: ValidationIssue[];
}
