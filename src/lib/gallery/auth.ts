import { createHmac, timingSafeEqual } from 'node:crypto';

export const GALLERY_SESSION_COOKIE = 'gp_gallery_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function getPassword(): string {
	return process.env.GALLERY_PASSWORD ?? '';
}

function getSecret(): string {
	return process.env.GALLERY_SESSION_SECRET ?? '';
}

export function galleryAuthConfigured(): boolean {
	return Boolean(getPassword() && getSecret());
}

export function verifyGalleryPassword(password: string): boolean {
	const expected = getPassword();
	if (!expected || !password) return false;
	const a = Buffer.from(password);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function sign(payload: string): string {
	return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createGallerySessionToken(): string {
	const exp = String(Date.now() + SESSION_TTL_MS);
	return `${exp}.${sign(exp)}`;
}

export function verifyGallerySessionToken(token: string | undefined): boolean {
	if (!token || !getSecret()) return false;
	const [exp, sig] = token.split('.');
	if (!exp || !sig) return false;
	const expected = sign(exp);
	try {
		const a = Buffer.from(sig);
		const b = Buffer.from(expected);
		if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
	} catch {
		return false;
	}
	const expMs = Number(exp);
	if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
	return true;
}

export function parseSessionCookie(cookieHeader: string | null): string | undefined {
	if (!cookieHeader) return undefined;
	const parts = cookieHeader.split(';');
	for (const part of parts) {
		const [rawName, ...rest] = part.trim().split('=');
		if (rawName === GALLERY_SESSION_COOKIE) {
			return decodeURIComponent(rest.join('='));
		}
	}
	return undefined;
}

export function isGalleryAuthenticated(request: Request): boolean {
	const token = parseSessionCookie(request.headers.get('cookie'));
	return verifyGallerySessionToken(token);
}

export function sessionCookieHeader(token: string): string {
	const maxAge = Math.floor(SESSION_TTL_MS / 1000);
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	return `${GALLERY_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	return `${GALLERY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
