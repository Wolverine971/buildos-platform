// apps/web/static/sw.js
/**
 * Service Worker: push notifications + instant app launch.
 *
 * Push: shows notifications and keeps the app badge in sync.
 *
 * Launch: opening the installed app used to show a black screen until the server had
 * built the whole Today page (~1.5–3 s on a phone). The worker now answers app launches
 * from the device: the saved Today screen when it is from today, otherwise a softly
 * fading Brain Bolt. Either one swaps to the live page as soon as it arrives.
 */

// Service Worker version - increment to force update
const SW_VERSION = '1.3.1';

// ---------------------------------------------------------------------------
// Launch screen + saved Today screen
// ---------------------------------------------------------------------------

// Keep in sync with LAUNCH_CACHE_NAME / LAUNCH_SNAPSHOT_KEY in $lib/utils/pwa-launch.ts.
const LAUNCH_CACHE = 'buildos-launch-v1';
const SNAPSHOT_KEY = '/__buildos/launch/today-snapshot';
const SNAPSHOT_TAKEN_AT_HEADER = 'x-buildos-snapshot-at';
const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LAUNCH_ICON_PATH = '/launch/brain-bolt.webp';
const TODAY_PATH = '/today';
// The manifest start_url is `/today?source=pwa`, so a launch is never confused with an
// ordinary visit to Today.
const LAUNCH_SOURCE_PARAM = 'source';
const LAUNCH_SOURCE_VALUE = 'pwa';
// mode-watcher's storage key; the launch pages resolve light/dark exactly like it does.
const MODE_STORAGE_KEY = 'mode-watcher-mode';

/**
 * Which launch behavior a top-level navigation gets.
 * - 'app-launch': the home-screen icon (start_url). Saved Today screen or Brain Bolt.
 * - 'home': a plain visit to `/`. Signed-in users (a saved screen exists) get the Brain
 *   Bolt and go straight to Today, skipping the server's `/` → `/today` redirect.
 *   Signed-out visitors get the normal homepage.
 * - 'today': any other Today load. Passed through, saved for the next launch, and
 *   answered from the saved screen when the phone is offline.
 */
function classifyNavigation(url) {
	if (url.origin !== self.location.origin) return null;
	if (
		url.pathname === TODAY_PATH &&
		url.searchParams.get(LAUNCH_SOURCE_PARAM) === LAUNCH_SOURCE_VALUE
	) {
		return 'app-launch';
	}
	if (url.pathname === '/' && url.search === '') return 'home';
	if (url.pathname === TODAY_PATH) return 'today';
	return null;
}

/** Today's URL with the launch marker removed and every other parameter kept. */
function launchTarget(url) {
	const params = new URLSearchParams(url.search);
	params.delete(LAUNCH_SOURCE_PARAM);
	const search = params.toString();
	return search ? `${TODAY_PATH}?${search}` : TODAY_PATH;
}

function isSameLocalDay(a, b) {
	return new Date(a).toDateString() === new Date(b).toDateString();
}

async function readSnapshot(now = Date.now()) {
	if (!(await caches.has(LAUNCH_CACHE))) return null;
	const cache = await caches.open(LAUNCH_CACHE);
	const response = await cache.match(SNAPSHOT_KEY);
	if (!response) return null;

	const takenAt = Number(response.headers.get(SNAPSHOT_TAKEN_AT_HEADER));
	const expired =
		!Number.isFinite(takenAt) || now - takenAt > SNAPSHOT_MAX_AGE_MS || takenAt > now + 60_000;
	if (expired) {
		await cache.delete(SNAPSHOT_KEY);
		return null;
	}
	return { takenAt, response };
}

async function clearSnapshot() {
	if (!(await caches.has(LAUNCH_CACHE))) return;
	const cache = await caches.open(LAUNCH_CACHE);
	await cache.delete(SNAPSHOT_KEY);
}

function isRedirectResponse(response) {
	return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

function shouldSaveSnapshot(url, response) {
	return (
		url.search === '' &&
		response.status === 200 &&
		response.type === 'basic' &&
		(response.headers.get('content-type') || '').includes('text/html')
	);
}

const STYLESHEET_LINK_PATTERN = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
const HREF_PATTERN = /\bhref=["']([^"']+)["']/i;
const SCRIPT_PATTERN = /<script\b[\s\S]*?<\/script\s*>/gi;
const PRELOAD_LINK_PATTERN =
	/<link\b[^>]*\brel=["']?(?:modulepreload|preload|prefetch)["']?[^>]*>/gi;
const RELATIVE_CSS_URL_PATTERN = /url\(\s*(['"]?)(\.{1,2}\/[^'")\s]+)\1\s*\)/g;

/**
 * Inline a stylesheet so the saved screen keeps its look even after a deploy removes
 * the hashed CSS file it was built with. Relative url()s are rebased because the CSS
 * no longer lives at its own address.
 */
async function fetchStylesheetText(href, baseUrl) {
	const cssUrl = new URL(href, baseUrl);
	if (cssUrl.origin !== self.location.origin) return { keepLink: true };

	const response = await fetch(cssUrl.href, { credentials: 'same-origin', cache: 'force-cache' });
	if (!response.ok) return null;
	const css = await response.text();
	const rebased = css.replace(
		RELATIVE_CSS_URL_PATTERN,
		(_match, quote, path) => `url(${quote}${new URL(path, cssUrl).pathname}${quote})`
	);
	return { css: rebased.replace(/<\/style/gi, '<\\/style') };
}

/**
 * Turn a server-rendered Today page into a self-contained picture of it: stylesheets
 * inlined, scripts and preloads removed (the saved screen is only shown, never run).
 * Returns null when a stylesheet can't be read, so the previous saved screen stays.
 */
async function prepareSnapshotHtml(html, pageUrl) {
	const links = html.match(STYLESHEET_LINK_PATTERN) || [];
	const sheets = await Promise.all(
		links.map(async (tag) => {
			const href = tag.match(HREF_PATTERN)?.[1];
			if (!href) return { tag, replacement: tag };
			const sheet = await fetchStylesheetText(href, pageUrl);
			if (!sheet) return null;
			return { tag, replacement: sheet.keepLink ? tag : `<style>${sheet.css}</style>` };
		})
	);
	if (sheets.some((sheet) => sheet === null)) return null;

	let prepared = html;
	for (const { tag, replacement } of sheets) {
		prepared = prepared.replace(tag, () => replacement);
	}
	return prepared.replace(SCRIPT_PATTERN, '').replace(PRELOAD_LINK_PATTERN, '');
}

async function saveSnapshot(response, pageUrl, now = Date.now()) {
	const html = await response.text();
	const prepared = await prepareSnapshotHtml(html, response.url || pageUrl);
	if (!prepared) return false;

	const cache = await caches.open(LAUNCH_CACHE);
	await cache.put(
		SNAPSHOT_KEY,
		new Response(prepared, {
			headers: {
				'content-type': 'text/html; charset=utf-8',
				[SNAPSHOT_TAKEN_AT_HEADER]: String(now)
			}
		})
	);
	return true;
}

/** JSON that is safe inside an inline <script>. */
function scriptJson(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Runs first in <head>: same light/dark decision as mode-watcher, so the launch page
// never flashes the wrong theme. In standalone mode it also nudges the Brain Bolt up
// by half the status bar so it sits exactly where the splash image drew it.
const LAUNCH_HEAD_SCRIPT = `(function(){var r=document.documentElement;try{var m=localStorage.getItem(${scriptJson(
	MODE_STORAGE_KEY
)})||'system';var l=m==='light'||(m==='system'&&matchMedia('(prefers-color-scheme: light)').matches);r.classList.toggle('dark',!l);r.style.colorScheme=l?'light':'dark';}catch(e){}try{var s=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;var d=(screen.height-innerHeight)/2;if(s&&d>0&&d<40)r.style.setProperty('--splash-shift',(-d)+'px');}catch(e){}})();`;

// Runs at the end of <body>. Refresh mode hands off to the live page after one painted
// frame (the browser keeps this page on screen until the live one paints). Offline mode
// waits for the user, or for the connection to come back.
const LAUNCH_BODY_SCRIPT = `(function(c){var done=false;function go(){if(done)return;done=true;location.replace(c.target);}if(c.mode==='refresh'){requestAnimationFrame(function(){requestAnimationFrame(go);});setTimeout(go,150);return;}var t=document.querySelector('[data-launch-time]');if(t&&c.takenAt){try{t.textContent=new Date(c.takenAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}catch(e){}}var b=document.querySelector('[data-launch-retry]');if(b)b.addEventListener('click',go);addEventListener('online',go);})`;

const LAUNCH_SHELL_CSS = `:root{--bg:#fbfaf9;--ink:#57534e}html.dark{--bg:#1d1c1b;--ink:#a8a29e}html,body{margin:0;height:100%;background:var(--bg)}body{overflow:hidden;-webkit-tap-highlight-color:transparent}.stage{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;color:var(--ink);font:500 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}.bolt{display:block;width:120px;height:120px;transform:translateY(var(--splash-shift,0px));animation:fade 2.4s ease-in-out infinite}.note{margin:0;text-align:center}.note button{margin-top:12px;font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:999px;padding:8px 18px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}@keyframes fade{0%,100%{opacity:1}50%{opacity:.55}}@media (prefers-reduced-motion:reduce){.bolt{animation:none}}@view-transition{navigation:auto}`;

const LAUNCH_SNAPSHOT_CSS = `@view-transition{navigation:auto}html[data-buildos-launch] body{pointer-events:none;-webkit-user-select:none;user-select:none}.buildos-launch-pill{position:fixed;z-index:2147483647;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 6px;border-radius:999px;font:500 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:hsl(var(--foreground));background:hsl(var(--background) / .94);border:1px solid hsl(var(--border));box-shadow:var(--shadow-ink);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);pointer-events:auto;white-space:nowrap;animation:buildos-launch-in .2s ease-out .4s both}.buildos-launch-pill img{width:18px;height:18px;animation:buildos-launch-breathe 2.4s ease-in-out infinite}.buildos-launch-pill button{margin-left:4px;font:inherit;color:inherit;background:transparent;border:0;text-decoration:underline;padding:0}@keyframes buildos-launch-in{from{opacity:0}to{opacity:1}}@keyframes buildos-launch-breathe{0%,100%{opacity:1}50%{opacity:.55}}@media (prefers-reduced-motion:reduce){.buildos-launch-pill,.buildos-launch-pill img{animation:none}}`;

/** The Brain Bolt alone, softly fading, shown when there is no saved Today screen to use. */
function renderLaunchScreen({ mode, target }) {
	const note =
		mode === 'offline'
			? `<p class="note">You're offline.<br><button type="button" data-launch-retry>Try again</button></p>`
			: '';
	return `<!doctype html><html lang="en" data-buildos-launch="${mode}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="theme-color" content="#fbfaf9" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#1d1c1b" media="(prefers-color-scheme: dark)"><title>BuildOS</title><script>${LAUNCH_HEAD_SCRIPT}</script><style>${LAUNCH_SHELL_CSS}</style></head><body><main class="stage" role="status" aria-live="polite"><img class="bolt" src="${LAUNCH_ICON_PATH}" alt="" width="120" height="120" decoding="sync">${note}<span class="sr">Opening BuildOS</span></main><script>${LAUNCH_BODY_SCRIPT}(${scriptJson(
		{ mode, target }
	)});</script></body></html>`;
}

/** The saved Today screen, frozen, with a small status pill on top. */
function renderSnapshot(html, { mode, target, takenAt }) {
	const pill =
		mode === 'offline'
			? `<div class="buildos-launch-pill" role="status">Offline · as of <span data-launch-time></span><button type="button" data-launch-retry>Retry</button></div>`
			: `<div class="buildos-launch-pill" role="status"><img src="${LAUNCH_ICON_PATH}" alt="">Updating</div>`;
	const head = `<script>${LAUNCH_HEAD_SCRIPT}</script><style>${LAUNCH_SNAPSHOT_CSS}</style>`;
	const tail = `${pill}<script>${LAUNCH_BODY_SCRIPT}(${scriptJson({ mode, target, takenAt })});</script>`;

	let page = /<head(\s[^>]*)?>/i.test(html)
		? html.replace(/<head(\s[^>]*)?>/i, (tag) => `${tag}${head}`)
		: `${head}${html}`;
	page = /<html\b/i.test(page)
		? page.replace(/<html\b/i, `<html data-buildos-launch="${mode}"`)
		: page;
	return /<\/body>/i.test(page)
		? page.replace(/<\/body>/i, () => `${tail}</body>`)
		: `${page}${tail}`;
}

function htmlResponse(body) {
	return new Response(body, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}

async function handleAppLaunch(url, now = Date.now()) {
	const target = launchTarget(url);
	const snapshot = await readSnapshot(now);
	if (snapshot && target === TODAY_PATH && isSameLocalDay(snapshot.takenAt, now)) {
		const html = await snapshot.response.text();
		return htmlResponse(
			renderSnapshot(html, { mode: 'refresh', target, takenAt: snapshot.takenAt })
		);
	}
	return htmlResponse(renderLaunchScreen({ mode: 'refresh', target }));
}

async function handleHome(request, now = Date.now()) {
	const snapshot = await readSnapshot(now);
	if (!snapshot) return fetch(request);
	return htmlResponse(renderLaunchScreen({ mode: 'refresh', target: TODAY_PATH }));
}

async function handleTodayNavigation(event, url) {
	let response;
	try {
		response = await fetch(event.request);
	} catch {
		const target = `${url.pathname}${url.search}`;
		const snapshot = await readSnapshot().catch(() => null);
		if (snapshot) {
			const html = await snapshot.response.text();
			return htmlResponse(
				renderSnapshot(html, { mode: 'offline', target, takenAt: snapshot.takenAt })
			);
		}
		return htmlResponse(renderLaunchScreen({ mode: 'offline', target }));
	}

	if (shouldSaveSnapshot(url, response)) {
		const copy = response.clone();
		event.waitUntil(
			saveSnapshot(copy, url.href).catch((error) =>
				console.warn('[ServiceWorker] Could not save the Today screen:', error)
			)
		);
	} else if (isRedirectResponse(response)) {
		// Today redirects when the session is gone (→ sign in): forget the saved screen.
		event.waitUntil(clearSnapshot().catch(() => undefined));
	}
	return response;
}

async function serveLaunchIcon(request) {
	const cache = await caches.open(LAUNCH_CACHE);
	const cached = await cache.match(LAUNCH_ICON_PATH, { ignoreSearch: true });
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) await cache.put(LAUNCH_ICON_PATH, response.clone());
	return response;
}

async function precacheLaunchAssets() {
	try {
		const cache = await caches.open(LAUNCH_CACHE);
		await cache.add(new Request(LAUNCH_ICON_PATH, { cache: 'reload' }));
	} catch (error) {
		// Never fail the install over this: the icon also loads on demand.
		console.warn('[ServiceWorker] Could not precache the launch icon:', error);
	}
}

async function deleteOldLaunchCaches() {
	const names = await caches.keys();
	await Promise.all(
		names
			.filter((name) => name.startsWith('buildos-launch-') && name !== LAUNCH_CACHE)
			.map((name) => caches.delete(name))
	);
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin === self.location.origin && url.pathname === LAUNCH_ICON_PATH) {
		event.respondWith(serveLaunchIcon(request).catch(() => fetch(request)));
		return;
	}

	if (request.mode !== 'navigate') return;
	const kind = classifyNavigation(url);
	if (kind === 'app-launch') {
		event.respondWith(handleAppLaunch(url).catch(() => fetch(request)));
	} else if (kind === 'home') {
		event.respondWith(handleHome(request).catch(() => fetch(request)));
	} else if (kind === 'today') {
		event.respondWith(handleTodayNavigation(event, url));
	}
});

// Exposed for unit tests (static/sw.js has no module system).
self.__buildosLaunch = {
	LAUNCH_CACHE,
	SNAPSHOT_KEY,
	classifyNavigation,
	launchTarget,
	prepareSnapshotHtml,
	renderLaunchScreen,
	renderSnapshot,
	handleAppLaunch,
	handleHome,
	handleTodayNavigation,
	saveSnapshot,
	readSnapshot
};

function normalizeBadgeCount(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return null;
	}
	return Math.max(0, Math.floor(numeric));
}

async function applyAppBadge(count) {
	const appNavigator = self.navigator;
	if (!appNavigator || typeof appNavigator.setAppBadge !== 'function') {
		return;
	}

	const normalizedCount = normalizeBadgeCount(count) ?? 0;

	try {
		if (normalizedCount > 0) {
			await appNavigator.setAppBadge(normalizedCount);
			return;
		}

		if (typeof appNavigator.clearAppBadge === 'function') {
			await appNavigator.clearAppBadge();
			return;
		}

		await appNavigator.setAppBadge(0);
	} catch (error) {
		console.warn('[ServiceWorker] Failed to update app badge:', error);
	}
}

async function fetchUnreadPushCount() {
	try {
		const response = await fetch('/api/notifications/unread-count?channel=push', {
			method: 'GET',
			credentials: 'include'
		});

		if (!response.ok) {
			return null;
		}

		const payload = await response.json();
		const count =
			typeof payload?.data?.count === 'number'
				? payload.data.count
				: typeof payload?.count === 'number'
					? payload.count
					: null;

		return normalizeBadgeCount(count);
	} catch (error) {
		console.warn('[ServiceWorker] Failed to fetch unread push count:', error);
		return null;
	}
}

async function syncBadgeCount(fallbackCount = null) {
	const unreadCount = await fetchUnreadPushCount();
	const countToApply = unreadCount ?? normalizeBadgeCount(fallbackCount);

	if (countToApply === null) {
		return;
	}

	await applyAppBadge(countToApply);
}

self.addEventListener('install', (event) => {
	console.log(`[ServiceWorker v${SW_VERSION}] Installing...`);
	self.skipWaiting(); // Activate immediately
	event.waitUntil(precacheLaunchAssets());
});

self.addEventListener('activate', (event) => {
	console.log(`[ServiceWorker v${SW_VERSION}] Activating...`);
	event.waitUntil(
		Promise.allSettled([self.clients.claim(), deleteOldLaunchCaches()]) // Take control immediately
	);
});

// Handle push events
self.addEventListener('push', (event) => {
	console.log('[ServiceWorker] Push event received', event);

	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch (error) {
		console.error('[ServiceWorker] Failed to parse push data:', error);
		data = {
			title: 'BuildOS Notification',
			body: event.data ? event.data.text() : 'You have a new notification'
		};
	}

	const title = data.title || 'BuildOS';
	const payloadBadgeCount = normalizeBadgeCount(data.badge_count ?? data.badgeCount);
	const options = {
		body: data.body || '',
		icon: data.icon || '/AppImages/android/android-launchericon-192-192.png',
		badge: data.badge || '/AppImages/android/android-launchericon-96-96.png',
		tag: data.tag || 'buildos-notification',
		requireInteraction: data.requireInteraction || false,
		data: data.data || {}
	};

	event.waitUntil(
		Promise.allSettled([
			self.registration.showNotification(title, options),
			syncBadgeCount(payloadBadgeCount ?? 1)
		])
	);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('[ServiceWorker] Notification clicked:', event.notification);

	event.notification.close();

	const urlToOpen = event.notification.data?.url || '/';
	const deliveryId = event.notification.data?.delivery_id;
	const action = event.action; // For action buttons on notifications

	// Track click event via API (non-blocking)
	const trackingPromise = deliveryId
		? (() => {
				console.log(
					'[ServiceWorker] Tracking notification click, delivery_id:',
					deliveryId
				);
				return fetch(`/api/notification-tracking/click/${deliveryId}`, {
					method: 'POST',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						metadata: {
							action: action || 'notification_body',
							user_agent: navigator.userAgent,
							timestamp: new Date().toISOString()
						}
					})
				})
					.then((response) => {
						if (response.ok) {
							console.log('[ServiceWorker] Click tracked successfully');
						} else {
							console.error(
								'[ServiceWorker] Click tracking failed:',
								response.status
							);
						}
					})
					.catch((error) => {
						console.error('[ServiceWorker] Failed to track notification click:', error);
					});
			})()
		: Promise.resolve();

	// Navigate to URL
	const navigatePromise = self.clients
		.matchAll({
			type: 'window',
			includeUncontrolled: true
		})
		.then((clientList) => {
			// Check if there's already a window open
			for (const client of clientList) {
				if (client.url === urlToOpen && 'focus' in client) {
					return client.focus();
				}
			}

			// Open new window if none found
			if (self.clients.openWindow) {
				return self.clients.openWindow(urlToOpen);
			}
		});

	const badgePromise = trackingPromise.finally(() => syncBadgeCount(0));

	event.waitUntil(Promise.allSettled([trackingPromise, badgePromise, navigatePromise]));
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
	console.log('[ServiceWorker] Notification closed:', event.notification);
	// Could track dismissal here if needed
});

self.addEventListener('message', (event) => {
	const messageType = event?.data?.type;

	if (messageType === 'BUILDOS_SYNC_BADGE') {
		event.waitUntil(syncBadgeCount());
		return;
	}

	if (messageType === 'BUILDOS_CLEAR_BADGE') {
		event.waitUntil(applyAppBadge(0));
		return;
	}

	if (messageType === 'BUILDOS_CLEAR_LAUNCH_SNAPSHOT') {
		event.waitUntil(clearSnapshot());
	}
});

console.log(`[ServiceWorker v${SW_VERSION}] Loaded`);
