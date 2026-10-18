// apps/web/src/lib/utils/pwa-launch-sw.test.ts
// The launch half of static/sw.js: what the installed app shows the moment it opens.
// sw.js is a classic script, so it runs here in a sandbox with fake caches and fetch.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { LAUNCH_CACHE_NAME, LAUNCH_SNAPSHOT_KEY } from './pwa-launch';

const SW_SOURCE = readFileSync(
	fileURLToPath(new URL('../../../static/sw.js', import.meta.url)),
	'utf8'
);
const ORIGIN = 'https://build-os.com';
const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();
const YESTERDAY = new Date(2026, 9, 17, 18, 0, 0).getTime();

type Fetch = (input: Request | string, init?: RequestInit) => Promise<Response>;

function fakeCaches() {
	const store = new Map<string, Map<string, Response>>();
	const keyOf = (key: Request | string) =>
		typeof key === 'string' ? key : new URL(key.url).pathname;
	return {
		store,
		api: {
			has: async (name: string) => store.has(name),
			keys: async () => [...store.keys()],
			delete: async (name: string) => store.delete(name),
			open: async (name: string) => {
				if (!store.has(name)) store.set(name, new Map());
				const entries = store.get(name)!;
				return {
					match: async (key: Request | string) => entries.get(keyOf(key))?.clone(),
					put: async (key: Request | string, response: Response) => {
						entries.set(keyOf(key), response);
					},
					delete: async (key: Request | string) => entries.delete(keyOf(key)),
					add: async () => undefined
				};
			}
		}
	};
}

function loadWorker(fetchImpl: Fetch = vi.fn()) {
	const listeners: Record<string, (event: unknown) => void> = {};
	const caches = fakeCaches();
	const self = {
		location: new URL(`${ORIGIN}/sw.js`),
		addEventListener: (type: string, fn: (event: unknown) => void) => {
			listeners[type] = fn;
		},
		skipWaiting: () => undefined,
		clients: { claim: async () => undefined },
		registration: {},
		navigator: {}
	} as Record<string, any>;
	const context = vm.createContext({
		self,
		caches: caches.api,
		fetch: fetchImpl,
		Response,
		Request,
		Headers,
		URL,
		URLSearchParams,
		console: { log: () => undefined, warn: () => undefined, error: () => undefined },
		setTimeout
	});
	vm.runInContext(SW_SOURCE, context);
	return { launch: self.__buildosLaunch, listeners, caches };
}

function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
	const waits: Promise<unknown>[] = [];
	const event = {
		request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'navigate' },
		// Swallow the worker's answer: these tests only check whether it answered.
		respondWith: vi.fn((answer: Promise<unknown>) => Promise.resolve(answer).catch(() => {})),
		waitUntil: (promise: Promise<unknown>) => waits.push(promise)
	};
	return { event, settle: () => Promise.all(waits) };
}

function htmlPage(body = '<main>Today: Ship the launch screen</main>') {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link href="./_app/immutable/assets/0.abc.css" rel="stylesheet">
<link rel="modulepreload" href="./_app/immutable/entry/start.js">
<script>(function Et(){ /* mode-watcher */ })()</script>
</head><body><div style="display: contents">${body}<script>Promise.all([import("./_app/immutable/entry/start.js")])</script></div></body></html>`;
}

const CSS = `body{background:url(./grain.png)}.noise{background:url("data:image/svg+xml,%3Cfilter id='n'/%3E%3Crect filter='url(%23n)'/%3E")}`;

function cssFetch(): Fetch {
	return vi.fn(async (input: Request | string) => {
		const url = typeof input === 'string' ? input : input.url;
		if (url.endsWith('.css')) {
			return new Response(CSS, { headers: { 'content-type': 'text/css' } });
		}
		throw new Error(`unexpected fetch ${url}`);
	});
}

async function seedSnapshot(launch: any, takenAt: number) {
	const saved = await launch.saveSnapshot(
		new Response(htmlPage(), { headers: { 'content-type': 'text/html' } }),
		`${ORIGIN}/today`,
		takenAt
	);
	expect(saved).toBe(true);
}

/** Every inline script the worker writes must at least parse. */
function expectScriptsParse(html: string) {
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	expect(scripts.length).toBeGreaterThan(0);
	for (const script of scripts) expect(() => new Function(script)).not.toThrow();
}

describe('service worker launch', () => {
	it('shares its cache names with the page helper', () => {
		const { launch } = loadWorker();
		expect(launch.LAUNCH_CACHE).toBe(LAUNCH_CACHE_NAME);
		expect(launch.SNAPSHOT_KEY).toBe(LAUNCH_SNAPSHOT_KEY);
	});

	it('only treats the home-screen start URL, bare /, and Today as launch-relevant', () => {
		const { launch } = loadWorker();
		const kind = (path: string, origin = ORIGIN) =>
			launch.classifyNavigation(new URL(path, origin));
		expect(kind('/today?source=pwa')).toBe('app-launch');
		expect(kind('/')).toBe('home');
		expect(kind('/?action=braindump')).toBeNull();
		expect(kind('/today')).toBe('today');
		expect(kind('/today?activated_project=1')).toBe('today');
		expect(kind('/projects')).toBeNull();
		expect(kind('/today?source=pwa', 'https://evil.example')).toBeNull();
	});

	it('drops only the launch marker from the destination', () => {
		const { launch } = loadWorker();
		expect(launch.launchTarget(new URL(`${ORIGIN}/today?source=pwa`))).toBe('/today');
		expect(
			launch.launchTarget(new URL(`${ORIGIN}/today?source=pwa&open=agent-chat&skill=x`))
		).toBe('/today?open=agent-chat&skill=x');
	});

	it('freezes Today into a self-contained page: CSS inlined and rebased, scripts removed', async () => {
		const fetchImpl = cssFetch();
		const { launch } = loadWorker(fetchImpl);
		const prepared = await launch.prepareSnapshotHtml(htmlPage(), `${ORIGIN}/today`);

		expect(fetchImpl).toHaveBeenCalledWith(
			`${ORIGIN}/_app/immutable/assets/0.abc.css`,
			expect.objectContaining({ cache: 'force-cache' })
		);
		expect(prepared).toContain('url(/_app/immutable/assets/grain.png)');
		// A data URI's inner url(%23n) is not a relative path and must survive untouched.
		expect(prepared).toContain("filter='url(%23n)'");
		expect(prepared).not.toMatch(/<script/i);
		expect(prepared).not.toContain('modulepreload');
		expect(prepared).not.toContain('rel="stylesheet"');
		expect(prepared).toContain('Today: Ship the launch screen');
	});

	it('keeps the previous saved screen when a stylesheet cannot be read', async () => {
		const { launch } = loadWorker(vi.fn(async () => new Response('gone', { status: 404 })));
		expect(await launch.prepareSnapshotHtml(htmlPage(), `${ORIGIN}/today`)).toBeNull();
	});

	it('opens to the breathing Brain Bolt when nothing is saved yet', async () => {
		const { launch } = loadWorker(cssFetch());
		const response = await launch.handleAppLaunch(new URL(`${ORIGIN}/today?source=pwa`), NOON);
		const html = await response.text();

		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('src="/launch/brain-bolt.webp"');
		expect(html).toContain('"target":"/today"');
		expect(html).toContain('"mode":"refresh"');
		expect(html).toContain('@view-transition');
		expectScriptsParse(html);
	});

	it('opens to the saved Today screen when it is from today, then refreshes', async () => {
		const { launch } = loadWorker(cssFetch());
		await seedSnapshot(launch, NOON - 60 * 60 * 1000);

		const html = await (
			await launch.handleAppLaunch(new URL(`${ORIGIN}/today?source=pwa`), NOON)
		).text();

		expect(html).toContain('Today: Ship the launch screen');
		expect(html).toContain('Updating');
		expect(html).toContain('data-buildos-launch="refresh"');
		expect(html).toContain('"target":"/today"');
		// Theme is decided before the inlined CSS so dark mode never flashes light.
		expect(html.indexOf('mode-watcher-mode')).toBeLessThan(html.indexOf('<style>body{'));
		expectScriptsParse(html);
	});

	it("never shows yesterday's Today; the Brain Bolt covers the first open of the day", async () => {
		const { launch } = loadWorker(cssFetch());
		await seedSnapshot(launch, YESTERDAY);

		const html = await (
			await launch.handleAppLaunch(new URL(`${ORIGIN}/today?source=pwa`), NOON)
		).text();
		expect(html).not.toContain('Ship the launch screen');
		expect(html).toContain('brain-bolt.webp');
	});

	it('uses the Brain Bolt, not the saved screen, when the launch carries a chat or deep link', async () => {
		const { launch } = loadWorker(cssFetch());
		await seedSnapshot(launch, NOON - 1000);

		const html = await (
			await launch.handleAppLaunch(
				new URL(`${ORIGIN}/today?source=pwa&open=agent-chat`),
				NOON
			)
		).text();
		expect(html).not.toContain('Ship the launch screen');
		expect(html).toContain('"target":"/today?open=agent-chat"');
	});

	it('leaves the homepage alone for signed-out visitors and skips the redirect for signed-in ones', async () => {
		const homepage = new Response('<h1>Marketing</h1>');
		const fetchImpl = vi.fn(async (input: Request | string) =>
			String(typeof input === 'string' ? input : input.url).endsWith('.css')
				? new Response(CSS)
				: homepage
		);
		const { launch } = loadWorker(fetchImpl as Fetch);
		const request = { url: `${ORIGIN}/`, mode: 'navigate', method: 'GET' };

		expect(await launch.handleHome(request, NOON)).toBe(homepage);

		await seedSnapshot(launch, YESTERDAY);
		const html = await (await launch.handleHome(request, NOON)).text();
		expect(html).toContain('brain-bolt.webp');
		expect(html).toContain('"target":"/today"');
	});

	it('saves each fresh Today page for the next launch', async () => {
		const page = new Response(htmlPage(), {
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8' }
		});
		Object.defineProperty(page, 'type', { value: 'basic' });
		const fetchImpl = vi.fn(async (input: Request | string) =>
			typeof input === 'string' ? new Response(CSS) : page
		);
		const { launch, caches } = loadWorker(fetchImpl as Fetch);
		const { event, settle } = fetchEvent(`${ORIGIN}/today`);

		const response = await launch.handleTodayNavigation(event, new URL(`${ORIGIN}/today`));
		await settle();

		expect(response).toBe(page);
		expect(await response.text()).toContain('<script>'); // the live page is untouched
		const saved = caches.store.get(LAUNCH_CACHE_NAME)?.get(LAUNCH_SNAPSHOT_KEY);
		expect(saved).toBeDefined();
		expect(Number(saved!.headers.get('x-buildos-snapshot-at'))).toBeGreaterThan(0);
	});

	it('forgets the saved screen when Today redirects (signed out)', async () => {
		const { launch, caches } = loadWorker(cssFetch());
		await seedSnapshot(launch, NOON);

		const redirect = new Response(null, { status: 303, headers: { location: '/auth/login' } });
		const worker = loadWorker(vi.fn(async () => redirect) as Fetch);
		worker.caches.store.set(LAUNCH_CACHE_NAME, caches.store.get(LAUNCH_CACHE_NAME)!);
		const { event, settle } = fetchEvent(`${ORIGIN}/today`);

		expect(await worker.launch.handleTodayNavigation(event, new URL(`${ORIGIN}/today`))).toBe(
			redirect
		);
		await settle();
		expect(worker.caches.store.get(LAUNCH_CACHE_NAME)?.has(LAUNCH_SNAPSHOT_KEY)).toBe(false);
	});

	it('shows the last Today read-only with Retry when the phone is offline', async () => {
		const seeded = loadWorker(cssFetch());
		await seedSnapshot(seeded.launch, YESTERDAY);
		const offline = loadWorker(
			vi.fn(async () => {
				throw new TypeError('Load failed');
			}) as Fetch
		);
		offline.caches.store.set(LAUNCH_CACHE_NAME, seeded.caches.store.get(LAUNCH_CACHE_NAME)!);
		const { event } = fetchEvent(`${ORIGIN}/today`);

		const html = await (
			await offline.launch.handleTodayNavigation(event, new URL(`${ORIGIN}/today`))
		).text();
		expect(html).toContain('Ship the launch screen');
		expect(html).toContain('Offline');
		expect(html).toContain('data-launch-retry');
		expect(html).toContain('"mode":"offline"');
		expectScriptsParse(html);
	});

	it('shows the Brain Bolt with Try again when offline and nothing is saved', async () => {
		const { launch } = loadWorker(
			vi.fn(async () => {
				throw new TypeError('Load failed');
			}) as Fetch
		);
		const { event } = fetchEvent(`${ORIGIN}/today`);
		const html = await (
			await launch.handleTodayNavigation(event, new URL(`${ORIGIN}/today`))
		).text();
		expect(html).toContain("You're offline.");
		expect(html).toContain('Try again');
	});

	it('only intercepts launch-relevant navigations and the launch icon', () => {
		const { listeners } = loadWorker(cssFetch());
		const handle = (url: string, init?: { method?: string; mode?: string }) => {
			const { event } = fetchEvent(url, init);
			listeners.fetch!(event);
			return event.respondWith.mock.calls.length > 0;
		};

		expect(handle(`${ORIGIN}/today?source=pwa`)).toBe(true);
		expect(handle(`${ORIGIN}/today`)).toBe(true);
		expect(handle(`${ORIGIN}/launch/brain-bolt.webp`, { mode: 'no-cors' })).toBe(true);
		expect(handle(`${ORIGIN}/projects`)).toBe(false);
		expect(handle(`${ORIGIN}/api/today`, { mode: 'cors' })).toBe(false);
		expect(handle(`${ORIGIN}/today`, { method: 'POST' })).toBe(false);
		expect(handle(`${ORIGIN}/_app/immutable/assets/0.css`, { mode: 'no-cors' })).toBe(false);
	});
});
