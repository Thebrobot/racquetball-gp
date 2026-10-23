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
		const li = firstInitial(lp);
		const ri = firstInitial(rp);
		if (!li || !ri) return true;
		return li === ri;
	});
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
