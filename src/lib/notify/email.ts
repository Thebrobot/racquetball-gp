/**
 * Transactional email through Resend's REST API. The key lives in RESEND_API_KEY
 * (Vercel env). When it is missing, sends are skipped and reported as such so the
 * calling request never fails because of mail.
 */
import { env } from '../accounts/supabase';

export function emailConfigured(): boolean {
	return Boolean(env('RESEND_API_KEY'));
}

export function siteOrigin(): string {
	return env('PUBLIC_SITE_URL') || 'https://www.racquetballgp.com';
}

const FROM = () => env('NOTIFY_FROM') || 'Florida Racquetball Grand Prix <noreply@racquetballgp.com>';

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
	const key = env('RESEND_API_KEY');
	if (!key) return false;
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
		});
		return res.ok;
	} catch {
		return false;
	}
}

// ─── Templates ────────────────────────────────────────────────────────────────

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type PhotoCard = { url: string; href: string; label: string; caption?: string | null; note?: string };

/** Shared shell: navy header, white card, orange button, settings footer. */
export function layout(opts: { heading: string; intro: string; cards?: PhotoCard[]; cta: { label: string; href: string }; footer?: string }): { html: string; text: string } {
	const origin = siteOrigin();
	const cards = (opts.cards ?? [])
		.map(
			(c) => `
			<tr><td style="padding:0 0 12px 0;">
				<a href="${esc(c.href)}" style="text-decoration:none;color:#0a1628;">
				<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e6ec;border-radius:12px;overflow:hidden;">
					<tr>
						<td width="96" style="padding:0;"><img src="${esc(c.url)}" width="96" height="96" alt="" style="display:block;width:96px;height:96px;object-fit:cover;" /></td>
						<td style="padding:10px 14px;font-family:Arial,Helvetica,sans-serif;">
							<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f05a1a;font-weight:bold;">${esc(c.label)}</div>
							${c.caption ? `<div style="font-size:14px;color:#0a1628;margin-top:4px;">${esc(c.caption)}</div>` : ''}
							${c.note ? `<div style="font-size:13px;color:#5b6473;margin-top:4px;">${esc(c.note)}</div>` : ''}
						</td>
					</tr>
				</table>
				</a>
			</td></tr>`,
		)
		.join('');
	const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
	<tr><td style="background:#0a1628;border-radius:16px 16px 0 0;padding:18px 24px;font-family:Arial,Helvetica,sans-serif;color:#fff;font-weight:bold;font-size:14px;letter-spacing:.12em;text-transform:uppercase;">
		Florida <span style="color:#f05a1a;">Racquetball</span> Grand Prix
	</td></tr>
	<tr><td style="background:#ffffff;padding:26px 24px 8px;font-family:Arial,Helvetica,sans-serif;color:#0a1628;">
		<h1 style="margin:0 0 10px;font-size:22px;line-height:1.2;">${esc(opts.heading)}</h1>
		<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#3c4452;">${esc(opts.intro)}</p>
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
		<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 22px;"><tr><td style="background:#f05a1a;border-radius:8px;">
			<a href="${esc(opts.cta.href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;">${esc(opts.cta.label)}</a>
		</td></tr></table>
	</td></tr>
	<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 24px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8a93a3;">
		${esc(opts.footer ?? 'You are getting this because you have a player account on racquetballgp.com.')}
		<a href="${esc(origin)}/account#notifications" style="color:#8a93a3;">Notification settings</a>
	</td></tr>
</table>
</td></tr></table></body></html>`;
	const text = [
		opts.heading,
		'',
		opts.intro,
		'',
		...(opts.cards ?? []).map((c) => `• ${c.label}${c.caption ? `: ${c.caption}` : ''}${c.note ? ` (${c.note})` : ''}\n  ${c.href}`),
		'',
		`${opts.cta.label}: ${opts.cta.href}`,
		'',
		`Notification settings: ${origin}/account#notifications`,
	].join('\n');
	return { html, text };
}
