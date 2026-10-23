/**
 * Anonymous visitor identity for view/share counting: a salted hash of the
 * request address, user agent and the day. Never stores raw addresses, and
 * rotates daily so it cannot be used to follow a person across days.
 */
import { createHash } from 'node:crypto';

function salt(): string {
	return (
		process.env.GALLERY_SESSION_SECRET ??
		process.env.SUPABASE_SERVICE_ROLE_KEY ??
		process.env.SERVICE_ROLE_KEY ??
		'florida-racquetball-grand-prix'
	).slice(0, 48);
}

export function todayUtc(): string {
	return new Date().toISOString().slice(0, 10);
}

export function visitorHash(request: Request, clientAddress: string | undefined): string {
	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	const ip = forwarded || clientAddress || 'unknown';
	const ua = request.headers.get('user-agent') ?? '';
	return createHash('sha256').update(`${ip}|${ua}|${todayUtc()}|${salt()}`).digest('base64url').slice(0, 32);
}

/** Photo ids are blob file stems: letters, digits, dash, underscore. */
export function isValidPhotoId(id: unknown): id is string {
	return typeof id === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(id);
}
