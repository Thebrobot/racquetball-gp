/**
 * Page scroll lock that works on iOS. `overflow: hidden` on html/body does not
 * stop touch scrolling in Safari, and while it is set, fixed elements (the nav
 * pill) get dragged along with the swipe. Pinning the body in place instead
 * freezes the page for real. Several overlays can hold the lock at once.
 */
const holders = new Set<string>();
let savedY = 0;

export function lockScroll(reason: string): void {
	const wasLocked = holders.size > 0;
	holders.add(reason);
	if (wasLocked) return;
	savedY = window.scrollY;
	document.body.style.top = `-${savedY}px`;
	document.documentElement.classList.add('scroll-locked');
}

export function unlockScroll(reason: string): void {
	holders.delete(reason);
	if (holders.size > 0) return;
	const html = document.documentElement;
	if (!html.classList.contains('scroll-locked')) return;
	html.classList.remove('scroll-locked');
	document.body.style.top = '';
	// Restore the position without the smooth-scroll animation the site uses elsewhere.
	const prev = html.style.scrollBehavior;
	html.style.scrollBehavior = 'auto';
	window.scrollTo(0, savedY);
	html.style.scrollBehavior = prev;
}
