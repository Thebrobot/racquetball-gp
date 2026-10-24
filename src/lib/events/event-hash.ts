export const EVENT_PANELS = ['brackets', 'participants'] as const;
export type EventPanelId = (typeof EVENT_PANELS)[number];

/** Tab / panel id encoded in `#brackets`, `#participants`, or `#panel-*`. */
export function eventPanelFromHash(hash: string | null | undefined): EventPanelId | null {
	if (!hash) return null;
	let id = hash.trim().replace(/^#/, '').trim().toLowerCase();
	if (id.startsWith('panel-')) id = id.slice('panel-'.length);
	if (id === 'brackets' || id === 'participants') return id;
	return null;
}

/** Clearance below the fixed nav pill so hash-scroll does not hide the tab bar. */
export function eventHashScrollTop(targetTop: number, navBottom: number, extra = 12): number {
	const clearance = Math.max(72, Math.round(navBottom) + extra);
	return Math.max(0, Math.round(targetTop - clearance));
}
