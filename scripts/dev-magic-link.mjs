// Dev helper: mint an auth link token via the Supabase admin API so sign-in,
// verification and password-reset callbacks can be tested without an inbox.
// Usage: node --env-file=.env.local scripts/dev-magic-link.mjs you@example.com [magiclink|recovery]
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const email = process.argv[2];
const type = process.argv[3] || 'magiclink';
if (!url || !key || !email) {
	console.error('missing url/key/email');
	process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({ type, email });
if (error) {
	console.error('error:', error.message);
	process.exit(1);
}
const hash = data.properties?.hashed_token;
const next = type === 'recovery' ? '/account/password' : '/account';
console.log(JSON.stringify({ userId: data.user?.id, callback: `/auth/callback?token_hash=${hash}&type=${type}&next=${next}` }));
