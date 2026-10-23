/**
 * Browser-side push helper shared by the account page and the gallery.
 * State: unsupported | denied | off | on. iPhones need the site on the Home
 * Screen before push works, so we say so instead of failing quietly.
 */
export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
	return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIosBrowserTab(): boolean {
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
	return ios && !standalone;
}

async function registration(): Promise<ServiceWorkerRegistration> {
	const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
	await navigator.serviceWorker.ready;
	return reg;
}

export async function getPushState(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	try {
		const reg = await navigator.serviceWorker.getRegistration('/');
		const sub = await reg?.pushManager.getSubscription();
		return sub ? 'on' : 'off';
	} catch {
		return 'off';
	}
}

function toKey(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe this browser and save it. Returns the new state or an error message. */
export async function enablePush(): Promise<{ state: PushState; error?: string }> {
	if (!pushSupported()) return { state: 'unsupported', error: isIosBrowserTab() ? 'On iPhone, add this site to your Home Screen first (Share → Add to Home Screen), then turn notifications on from there.' : 'This browser does not support notifications.' };
	const cfg = (await fetch('/api/push/config', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { enabled?: boolean; publicKey?: string } | null;
	if (!cfg?.enabled || !cfg.publicKey) return { state: 'off', error: 'Notifications are not switched on for this site yet.' };
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return { state: permission === 'denied' ? 'denied' : 'off', error: permission === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : undefined };
	try {
		const reg = await registration();
		const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(cfg.publicKey) as BufferSource }));
		const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
		if (res.status === 401) return { state: 'off', error: 'Sign in first.' };
		if (!res.ok) return { state: 'off', error: 'Could not save the subscription.' };
		return { state: 'on' };
	} catch {
		return { state: 'off', error: 'Could not turn notifications on in this browser.' };
	}
}

/** Unsubscribe this browser (and tell the server to forget it). */
export async function disablePush(all = false): Promise<PushState> {
	try {
		const reg = await navigator.serviceWorker.getRegistration('/');
		const sub = await reg?.pushManager.getSubscription();
		const endpoint = sub?.endpoint;
		await sub?.unsubscribe();
		await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? { all: true } : { endpoint }) });
	} catch {
		/* ignore */
	}
	return 'off';
}
