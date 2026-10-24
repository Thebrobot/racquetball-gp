/** First photo in a burst creates the admin alert; later ones in this window do not. */
export const SUBMISSION_ALERT_WINDOW_MS = 15 * 60 * 1000;

/** Instant kinds email/push immediately. Likes and submissions wait for the digest cron. */
export function deliversInstantly(kind: string): boolean {
	return kind !== 'like' && kind !== 'submission';
}

/** True when this upload should create the admin `submission` notification (one per 15-minute batch). */
export function shouldCreateSubmissionAlert(otherPendingInWindow: number): boolean {
	return otherPendingInWindow <= 0;
}

export function photoApprovedCopy(count: number): { subject: string; heading: string; intro: string; pushBody: string } {
	const n = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
	if (n > 1) {
		const line = `${n} photos are now in the gallery`;
		return { subject: line, heading: line, intro: 'They are live now.', pushBody: line };
	}
	return {
		subject: 'Your photo is in the gallery',
		heading: 'Your photo is in the gallery',
		intro: 'It is live now.',
		pushBody: 'Approved and live in the gallery.',
	};
}

export function submissionDigestLine(name: string, count: number): string {
	const n = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
	const who = name.trim() || 'Someone';
	return `${who} sent ${n} ${n === 1 ? 'photo' : 'photos'} for review`;
}

export function submissionDigestCopy(groups: { name: string; count: number }[]): { heading: string; intro: string } {
	const lines = groups.filter((g) => g.count > 0).map((g) => submissionDigestLine(g.name, g.count));
	if (lines.length === 1) {
		return { heading: lines[0], intro: 'Approve them and they go into the gallery.' };
	}
	return { heading: 'New photos to review', intro: lines.length ? `${lines.join('. ')}.` : 'New photos are waiting in the admin queue.' };
}

/** Count pending photos per uploader, optionally limited to the actors on unsent alerts. */
export function groupPendingByUploader(
	pending: { user_id: string }[],
	names: Record<string, string | null | undefined>,
	actorIds?: Iterable<string>,
): { userId: string; name: string; count: number }[] {
	const allow = actorIds ? new Set([...actorIds].filter(Boolean)) : null;
	const counts = new Map<string, number>();
	for (const row of pending) {
		if (allow && !allow.has(row.user_id)) continue;
		counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([userId, count]) => ({ userId, name: names[userId]?.trim() || 'Someone', count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** After sequential approve_all, one summary notify per uploader. */
export function summarizeApprovals(approved: { user_id: string; id: string; album: string }[]): { userId: string; count: number; photoId: string; album: string }[] {
	const map = new Map<string, { count: number; photoId: string; album: string }>();
	for (const row of approved) {
		const cur = map.get(row.user_id);
		if (cur) cur.count += 1;
		else map.set(row.user_id, { count: 1, photoId: row.id, album: row.album });
	}
	return [...map.entries()].map(([userId, info]) => ({ userId, ...info }));
}
