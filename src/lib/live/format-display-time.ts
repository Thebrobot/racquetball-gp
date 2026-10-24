/** User-facing live timestamps. Stored values stay UTC ISO. */
export const DISPLAY_TIME_ZONE = 'America/New_York';

function partsOf(
	iso: string,
	opts: Intl.DateTimeFormatOptions,
): Record<Intl.DateTimeFormatPartTypes, string> | null {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const out = {} as Record<Intl.DateTimeFormatPartTypes, string>;
	for (const part of new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TIME_ZONE, ...opts }).formatToParts(d)) {
		if (part.type !== 'literal') out[part.type] = part.value;
	}
	return out;
}

/** `2026-10-24T14:50:00.000Z` → `Oct 24, 10:50 AM` */
export function formatLiveWhen(iso: string): string {
	const p = partsOf(iso, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	if (!p) return '';
	return `${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** Last-synced line, including EST/EDT. */
export function formatLiveSyncedAt(iso: string | null): string {
	if (!iso) return 'Not yet synced';
	const p = partsOf(iso, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
	});
	if (!p) return 'Not yet synced';
	return `${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}

export function formatLiveDayLabel(iso: string): string {
	const p = partsOf(iso, { weekday: 'long', month: 'long', day: 'numeric' });
	if (!p) return '';
	return `${p.weekday}, ${p.month} ${p.day}`;
}

/** Relative while fresh; ET clock time after a day so server/client stay aligned. */
export function formatLiveRelativeTime(iso: string, now = Date.now()): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const sec = Math.floor((now - d.getTime()) / 1000);
	if (sec < 60) return 'Just now';
	if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
	if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
	return formatLiveWhen(iso);
}
