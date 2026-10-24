/** Parse R2 draw/match-page schedule text into site `Friday · 5:30 PM` + `Court 1`. */

const DAY_MAP: Record<string, string> = {
	f: 'Friday',
	fr: 'Friday',
	sa: 'Saturday',
	su: 'Sunday',
	mo: 'Monday',
	tu: 'Tuesday',
	we: 'Wednesday',
	th: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday',
	sunday: 'Sunday',
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
};

export type ParsedSchedule = {
	scheduledTime?: string;
	court?: string;
};

function formatCourt(raw: string): string {
	return `Court ${raw.trim()}`;
}

function decodeScheduleText(raw: string): string {
	return raw
		.replace(/&middot;|&#183;|&#x[bB]7;/g, '·')
		.replace(/&nbsp;/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function weekdayClockFromDated(monthDayYear: string, clockRaw: string): string | undefined {
	const when = new Date(`${monthDayYear} ${clockRaw}`);
	if (Number.isNaN(when.getTime())) return undefined;
	const day = when.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
	const clock = clockRaw.replace(/\s+/g, ' ').toUpperCase().replace(/\s*([AP]M)/, ' $1');
	const hm = clock.match(/(\d{1,2}:\d{2})\s*([AP]M)/i);
	return hm ? `${day} · ${hm[1]} ${hm[2]!.toUpperCase()}` : `${day} · ${clock}`;
}

function formatClock(hourMin: string, meridiem: string): string {
	const mer = meridiem.toUpperCase().startsWith('P') ? 'PM' : 'AM';
	const cleaned = hourMin.replace(/\s+/g, '');
	return `${cleaned} ${mer}`;
}

/** Draw boxes use `F 5:30 P#1`, `Sa 10:00 A`, `Sa 1:00 P#2`. */
export function parseR2Schedule(text: string): ParsedSchedule {
	const t = (text ?? '').replace(/\s+/g, ' ').trim();
	const out: ParsedSchedule = {};

	const courtHash = t.match(/#\s*(\d{1,2})(?!\d)/);
	if (courtHash) out.court = formatCourt(courtHash[1]!);
	else {
		const courtWord = t.match(/\bCourt\s*#?\s*(\d{1,2})\b/i);
		if (courtWord) out.court = formatCourt(courtWord[1]!);
	}

	const already = t.match(
		/\b(Friday|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday)\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)\b/i,
	);
	if (already) {
		out.scheduledTime = `${already[1]} · ${already[2]!.replace(/\s+/g, ' ').toUpperCase().replace('AM', 'AM').replace('PM', 'PM')}`;
		const mer = already[2]!.replace(/\s+/g, ' ');
		const clock = mer.match(/(\d{1,2}:\d{2})\s*([AP]M)/i);
		if (clock) out.scheduledTime = `${capitalize(already[1]!)} · ${clock[1]} ${clock[2]!.toUpperCase()}`;
		return out;
	}

	const compact = t.match(
		/\b(Fr|Sa|Su|Mo|Tu|We|Th|F)\b\.?\s+(\d{1,2}:\d{2})\s*([AP])M?\b/i,
	);
	if (compact) {
		const day = DAY_MAP[compact[1]!.toLowerCase()];
		if (day) out.scheduledTime = `${day} · ${formatClock(compact[2]!, compact[3]!)}`;
	}

	return out;
}

/** Match pages use `Court 1 · Scheduled Oct 23, 2026 at 4:30 PM`. */
export function parseMatchPageSchedule(text: string): ParsedSchedule {
	const t = decodeScheduleText(text ?? '');
	const out: ParsedSchedule = {};
	const court = t.match(/\bCourt\s*#?\s*(\d{1,2})\b/i);
	if (court) out.court = formatCourt(court[1]!);

	const dated = t.match(
		/Scheduled\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i,
	);
	if (dated) {
		const clock = weekdayClockFromDated(dated[1]!, dated[2]!);
		if (clock) {
			out.scheduledTime = clock;
			return out;
		}
	}

	return { ...out, ...parseR2Schedule(t) };
}

/**
 * Court/time from an r2-push page, including when `.r2p-scheduled` is the only
 * usable markup (draw boxes drop `#court` after Final). Never reads `#` hashes
 * out of raw HTML — those collide with CSS colors.
 */
export function scheduleFromMatchHtml(html: string): ParsedSchedule {
	if (!html) return {};
	const block = html.match(
		/<[^>]*class=["'][^"']*r2p-scheduled[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/i,
	);
	if (block) {
		const parsed = parseMatchPageSchedule(block[1] ?? '');
		if (parsed.court || parsed.scheduledTime) return parsed;
	}
	const text = decodeScheduleText(html);
	const out: ParsedSchedule = {};
	const court = text.match(/\bCourt\s*#?\s*(\d{1,2})\b/i);
	if (court) out.court = formatCourt(court[1]!);
	const dated = text.match(
		/Scheduled\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i,
	);
	if (dated) {
		const clock = weekdayClockFromDated(dated[1]!, dated[2]!);
		if (clock) out.scheduledTime = clock;
	}
	return out;
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
