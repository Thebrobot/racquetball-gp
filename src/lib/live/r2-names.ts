/** Name matching for R2 draw slots vs match-page sides. Never used to infer a winner. */

const SUFFIX_RE = /^(jr|sr|ii|iii|iv)\.?$/i;

export function cleanPlayerName(raw: string): string {
	return (raw ?? '')
		.replace(/\s*:\s*.*$/, '')
		.replace(/\s+-\s*W\s*$/i, '')
		.replace(/_/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function isPlayerName(s: string): boolean {
	const t = (s ?? '').trim();
	return t.length >= 3 && (t.includes(' ') || t.includes('/')) && /[A-Za-z]/.test(t);
}

function wordsOf(part: string): string[] {
	return part
		.trim()
		.split(/\s+/)
		.map((w) => w.replace(/[^A-Za-z.]/g, ''))
		.filter(Boolean)
		.filter((w) => !SUFFIX_RE.test(w));
}

export function lastNames(name: string): string[] {
	return (name ?? '')
		.split('/')
		.map((part) => {
			const words = wordsOf(part);
			return (words[words.length - 1] ?? '').toLowerCase();
		})
		.filter(Boolean);
}

function firstInitial(part: string): string | null {
	const words = wordsOf(part);
	const first = words[0] ?? '';
	return first ? first[0]!.toUpperCase() : null;
}

function partsOf(name: string): string[] {
	return (name ?? '')
		.split('/')
		.map((p) => cleanPlayerName(p))
		.filter(Boolean);
}

/** True when two player/team strings name the same side. */
export function namesAlign(a: string | null | undefined, b: string | null | undefined): boolean {
	const left = cleanPlayerName(a ?? '');
	const right = cleanPlayerName(b ?? '');
	if (!left || !right) return false;
	if (left.toLowerCase() === right.toLowerCase()) return true;

	const leftParts = partsOf(left);
	const rightParts = partsOf(right);
	if (!leftParts.length || !rightParts.length) return false;

	const leftLN = lastNames(left);
	const rightLN = lastNames(right);
	if (!leftLN.length || !rightLN.length) return false;

	const lastNamesMatch =
		leftLN.length === rightLN.length &&
		leftLN.every((ln) => rightLN.some((r) => r === ln || r.includes(ln) || ln.includes(r)));
	if (!lastNamesMatch) return false;

	// Same last names: require compatible first initials when both sides have them.
	if (leftParts.length !== rightParts.length) return lastNamesMatch;

	return leftParts.every((lp) => {
		const ln = lastNames(lp)[0];
		if (!ln) return false;
		const rp = rightParts.find((p) => {
			const rln = lastNames(p)[0];
			return rln === ln || rln?.includes(ln) || ln.includes(rln ?? '');
		});
		if (!rp) return false;
		const leftLastOnly = wordsOf(lp).length === 1;
		const rightLastOnly = wordsOf(rp).length === 1;
		if (leftLastOnly || rightLastOnly) return true;
		const li = firstInitial(lp);
		const ri = firstInitial(rp);
		if (!li || !ri) return true;
		return li === ri;
	});
}

function isFullName(name: string): boolean {
	return partsOf(name).every((p) => {
		const words = wordsOf(p);
		return words.length >= 2 && (words[0]?.length ?? 0) > 1;
	});
}

/** Map "E Saunders" / "Huck / Joseph" onto a unique full roster name. */
export function expandFromRoster(name: string | null | undefined, roster: string[]): string | null {
	const raw = cleanPlayerName(name ?? '');
	if (!raw) return null;
	const hits = roster.map((r) => cleanPlayerName(r)).filter((r) => r && namesAlign(raw, r));
	const unique = [...new Set(hits)];
	if (!unique.length) return raw;
	if (unique.length === 1) return unique[0]!.length >= raw.length ? unique[0]! : raw;
	const fuller = unique.filter(isFullName);
	if (fuller.length === 1) return fuller[0]!;
	return raw;
}

export function matchWinnerSide(
	winnerName: string,
	player1: string | null | undefined,
	player2: string | null | undefined,
): 1 | 2 | null {
	const hits1 = namesAlign(winnerName, player1);
	const hits2 = namesAlign(winnerName, player2);
	if (hits1 && !hits2) return 1;
	if (hits2 && !hits1) return 2;
	return null;
}

export function normalizeScore(score: string | null | undefined): string {
	return (score ?? '').replace(/–/g, '-').replace(/\s+/g, '').toLowerCase();
}

export function scoresEqual(a?: string | null, b?: string | null): boolean {
	return normalizeScore(a) === normalizeScore(b);
}

export function formatScore(score: string): string {
	const compact = score.replace(/–/g, '-').replace(/\s+/g, '');
	return compact.replace(/,/g, ', ');
}

function isGhostToken(s: string): boolean {
	return /^(tbd|bye)$/i.test(s.trim());
}

/** Live result names may replace a TBD/abbreviated draw slot. */
export function incomingFillsSlot(slot: string, incoming: string | null | undefined): boolean {
	const s = cleanPlayerName(slot);
	const n = cleanPlayerName(incoming ?? '');
	if (!n || isGhostToken(n)) return false;
	if (!s || isGhostToken(s)) return true;
	if (/\btbd\b/i.test(s)) {
		const known = lastNames(s.replace(/\btbd\b/gi, ' '));
		const incomingLast = lastNames(n);
		return (
			known.length === 0 ||
			known.every((k) => incomingLast.some((i) => i === k || i.includes(k) || k.includes(i)))
		);
	}
	if (!namesAlign(s, n)) return false;
	return n.length > s.length;
}

/** Match a roster player to a singles name or doubles team string. */
export function playerAppearsInSlot(playerName: string, slot: string, roster: string[] = []): boolean {
	const player = cleanPlayerName(playerName);
	const raw = cleanPlayerName(slot);
	if (!player || !raw || isGhostToken(raw)) return false;
	if (playerMatchesTeamOrName(player, raw)) return true;
	if (!roster.length) return false;
	const expanded = expandFromRoster(raw, roster);
	if (expanded && expanded !== raw && playerMatchesTeamOrName(player, expanded)) return true;
	for (const part of raw.split('/')) {
		const token = cleanPlayerName(part);
		if (!token || isGhostToken(token)) continue;
		if (namesAlign(player, token)) return true;
		const hits = [...new Set(roster.map((r) => cleanPlayerName(r)).filter((r) => r && !r.includes('/') && namesAlign(token, r)))];
		if (hits.length === 1 && namesAlign(player, hits[0]!)) return true;
	}
	return false;
}

function playerMatchesTeamOrName(playerName: string, entryName: string): boolean {
	const norm = playerName.trim().toLowerCase();
	const entryNorm = entryName.trim().toLowerCase();
	if (entryNorm === norm) return true;
	if (!entryNorm.includes('/')) return false;
	const lastName = norm.split(/\s+/).pop() ?? '';
	const firstInitial = norm[0] ?? '';
	if (lastName.length <= 1) return false;
	return entryNorm.split(/\s*\/\s*/).some((p) => {
		const part = p.trim();
		if (part === lastName || part === norm) return true;
		if (!part.endsWith(lastName)) return false;
		const init = part.match(/^([a-z])\.?\s/);
		return !init || init[1] === firstInitial;
	});
}

/** Expand a match slot into individual roster names (skip TBD/BYE). */
export function individualsFromSlot(slot: string, roster: string[]): string[] {
	const raw = cleanPlayerName(slot);
	if (!raw || isGhostToken(raw)) return [];
	const tokens = raw.includes('/') ? raw.split(/\s*\/\s*/) : [raw];
	const out: string[] = [];
	for (const token of tokens) {
		const part = cleanPlayerName(token);
		if (!part || isGhostToken(part)) continue;
		const people = roster.filter((r) => r && !r.includes('/')).map((r) => cleanPlayerName(r));
		const aligned = [...new Set(people.filter((r) => namesAlign(part, r)))];
		if (aligned.length === 1) {
			out.push(aligned[0]!);
			continue;
		}
		const suffix = [...new Set(people.filter((r) => r.toLowerCase().endsWith(part.toLowerCase())))];
		if (suffix.length === 1) {
			out.push(suffix[0]!);
			continue;
		}
		const expanded = expandFromRoster(part, people) ?? part;
		if (expanded && !expanded.includes('/') && !isGhostToken(expanded) && people.includes(expanded)) out.push(expanded);
	}
	return out;
}
