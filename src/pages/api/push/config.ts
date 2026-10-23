import type { APIRoute } from 'astro';
import { json } from '../../../lib/accounts/supabase';
import { pushConfigured, pushPublicKey } from '../../../lib/notify/push';

export const prerender = false;

/** Public: whether browser push is available and the key the browser subscribes with. */
export const GET: APIRoute = async () => json({ enabled: pushConfigured(), publicKey: pushConfigured() ? pushPublicKey() : null });
