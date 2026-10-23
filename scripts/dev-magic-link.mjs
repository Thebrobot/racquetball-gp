// Dev helper: mint a magic-link token for an email via the Supabase admin API,
// so the sign-in callback can be tested locally without reading an inbox.
// Usage: node --env-file=.env.local magic-link.mjs you@example.com
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const email = process.argv[2];
if (!url || !key || !email) {
	console.error('missing url/key/email');
	process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (error) {
	console.error('error:', error.message);
	process.exit(1);
}
const hash = data.properties?.hashed_token;
console.log(JSON.stringify({ userId: data.user?.id, callback: `/auth/callback?token_hash=${hash}&type=magiclink&next=/account` }));
