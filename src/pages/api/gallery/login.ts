import type { APIRoute } from 'astro';
import {
	createGallerySessionToken,
	galleryAuthConfigured,
	sessionCookieHeader,
	verifyGalleryPassword,
} from '../../../lib/gallery/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	if (!galleryAuthConfigured()) {
		return new Response(JSON.stringify({ error: 'Gallery login is not configured.' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	let password = '';
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		const body = (await request.json()) as { password?: string };
		password = body.password ?? '';
	} else {
		const form = await request.formData();
		password = String(form.get('password') ?? '');
	}

	if (!verifyGalleryPassword(password)) {
		return new Response(JSON.stringify({ error: 'Invalid password.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const token = createGallerySessionToken();
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Set-Cookie': sessionCookieHeader(token),
		},
	});
};
