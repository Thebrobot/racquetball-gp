import {
	DEFAULT_TIMEZONE,
	DEFAULT_WINDOW_END_HOUR,
	DEFAULT_WINDOW_START_HOUR,
} from './config';
import type { R2EventConfig } from './types';

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function partsInZone(date: Date, timeZone: string): { ymd: string; hms: string } {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	});
	const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
	return {
		ymd: `${parts.year}-${parts.month}-${parts.day}`,
		hms: `${parts.hour}:${parts.minute}:${parts.second}`,
	};
}

/** Convert a wall-clock datetime in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(ymd: string, hour: number, minute: number, timeZone: string): Date {
	const desired = `${ymd}T${pad2(hour)}:${pad2(minute)}:00`;
	let utc = Date.parse(`${desired}Z`);
	for (let i = 0; i < 8; i++) {
		const got = partsInZone(new Date(utc), timeZone);
		const gotStamp = Date.parse(`${got.ymd}T${got.hms}Z`);
		const wantStamp = Date.parse(`${desired}Z`);
		const diff = wantStamp - gotStamp;
		utc += diff;
		if (diff === 0) break;
	}
	return new Date(utc);
}

function addCalendarDays(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
	return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export interface EventWindow {
	start: Date;
	end: Date;
	timezone: string;
}

export function eventWindow(event: R2EventConfig): EventWindow {
	const timezone = event.timezone ?? DEFAULT_TIMEZONE;
	const startHour = event.windowStartHour ?? DEFAULT_WINDOW_START_HOUR;
	const endHour = event.windowEndHour ?? DEFAULT_WINDOW_END_HOUR;
	const start = zonedLocalToUtc(event.startDate, startHour, 0, timezone);
	const end = zonedLocalToUtc(addCalendarDays(event.endDate, 1), endHour, 0, timezone);
	return { start, end, timezone };
}

export function isEventWindowOpen(event: R2EventConfig, now = new Date()): boolean {
	const { start, end } = eventWindow(event);
	return now >= start && now < end;
}

export function activeEvents(events: R2EventConfig[], now = new Date()): R2EventConfig[] {
	return events.filter((event) => isEventWindowOpen(event, now));
}

export function anyEventWindowOpen(events: R2EventConfig[], now = new Date()): boolean {
	return events.some((event) => isEventWindowOpen(event, now));
}
