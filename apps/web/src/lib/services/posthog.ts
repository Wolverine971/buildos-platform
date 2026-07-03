// apps/web/src/lib/services/posthog.ts
// Client-side PostHog wrapper. Every export is a safe no-op when PostHog is not
// configured (no PUBLIC_POSTHOG_KEY) or when running on the server, so callers
// never need to guard. See docs/marketing/growth/posthog-analytics-workflow.md.
import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';

const FIRST_TOUCH_STORAGE_KEY = 'buildos_first_touch';
const FUNNEL_EVENTS = new Set([
	'signup',
	'onboarding_started',
	'onboarding_completed',
	'brain_dump_created',
	'project_created',
	'brief_generated',
	'brief_viewed',
	'task_completed'
]);

export interface FirstTouchAttribution {
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	referrer: string | null;
	landing_page: string | null;
	captured_at: string;
}

let initialized = false;
let initPromise: Promise<any | null> | null = null;
let posthogClient: any = null;
let pendingIdentify: {
	userId: string;
	properties?: Record<string, unknown>;
} | null = null;

function logHealth(
	status: 'captured' | 'skipped' | 'error',
	event: string,
	details?: Record<string, unknown>
): void {
	if (!FUNNEL_EVENTS.has(event)) return;
	console.info('[posthog-health]', {
		runtime: 'web-client',
		status,
		event,
		...details
	});
}

function isEnabled(): boolean {
	if (!browser || !env.PUBLIC_POSTHOG_KEY) return false;
	// Dev captures are opt-in so localhost sessions don't pollute production data
	if (dev && env.PUBLIC_POSTHOG_CAPTURE_DEV !== 'true') return false;
	return true;
}

function applyPendingIdentify(): void {
	if (!posthogClient || !pendingIdentify) return;

	const { userId, properties } = pendingIdentify;
	pendingIdentify = null;
	const firstTouch = getFirstTouchAttribution();
	posthogClient.identify(userId, properties, firstTouch ? { ...firstTouch } : undefined);
}

function ensurePostHogInitialized(): Promise<any | null> {
	if (initialized && posthogClient) return Promise.resolve(posthogClient);
	if (!isEnabled()) return Promise.resolve(null);

	if (!initPromise) {
		initPromise = import('posthog-js')
			.then(({ default: posthog }) => {
				posthogClient = posthog;

				if (!initialized) {
					posthog.init(env.PUBLIC_POSTHOG_KEY!, {
						api_host: env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
						defaults: '2026-05-30', // history_change pageviews — SPA navigations tracked automatically
						person_profiles: 'identified_only',
						capture_pageleave: true
					});
					initialized = true;
				}

				applyPendingIdentify();
				return posthogClient;
			})
			.catch((error) => {
				initPromise = null;
				posthogClient = null;
				initialized = false;
				console.error('[posthog] failed to initialize:', error);
				return null;
			});
	}

	return initPromise;
}

/**
 * Initialize PostHog. Call once from the root layout. Also stashes first-touch
 * attribution (which runs even when capture is disabled, so UTM data survives
 * a localhost signup or a session that starts before consent to capture).
 */
export function initPostHog(): void {
	if (browser) captureFirstTouchAttribution();
	if (initialized || initPromise || !isEnabled()) return;

	const start = () => {
		void ensurePostHogInitialized();
	};

	if (browser && 'requestIdleCallback' in window) {
		window.requestIdleCallback(start, { timeout: 3000 });
	} else {
		setTimeout(start, 0);
	}
}

/**
 * Tie events to the logged-in user. First-touch attribution is attached with
 * $set_once so it never overwrites the original acquisition source.
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
	if (!isEnabled()) return;
	pendingIdentify = { userId, properties };

	if (initialized && posthogClient) {
		applyPendingIdentify();
		return;
	}

	void ensurePostHogInitialized();
}

/** Call on logout so the next login isn't merged into the previous identity. */
export function resetPostHogUser(): void {
	pendingIdentify = null;
	if (!initialized || !posthogClient) return;
	posthogClient.reset();
}

export function captureEvent(event: string, properties?: Record<string, unknown>): void {
	if (!isEnabled()) {
		logHealth('skipped', event, { reason: 'not_initialized' });
		return;
	}

	void ensurePostHogInitialized().then((client) => {
		if (!client || !initialized) {
			logHealth('skipped', event, { reason: 'not_initialized' });
			return;
		}

		try {
			client.capture(event, properties);
			logHealth('captured', event);
		} catch (error) {
			logHealth('error', event, {
				message: error instanceof Error ? error.message : String(error)
			});
			console.error(`[posthog] failed to capture ${event}:`, error);
		}
	});
}

/**
 * First-touch UTM/referrer capture. Stored once in localStorage and never
 * overwritten; later attached to identify() and the register request so
 * acquisition source is durable in both PostHog and the users table.
 */
function captureFirstTouchAttribution(): void {
	try {
		if (localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)) return;

		const params = new URLSearchParams(window.location.search);
		const referrer = document.referrer || null;
		const externalReferrer =
			referrer && !referrer.startsWith(window.location.origin) ? referrer : null;
		const utmSource = params.get('utm_source');

		// Nothing worth recording on a clean direct visit
		if (!utmSource && !externalReferrer) return;

		const attribution: FirstTouchAttribution = {
			utm_source: utmSource,
			utm_medium: params.get('utm_medium'),
			utm_campaign: params.get('utm_campaign'),
			referrer: externalReferrer,
			landing_page: window.location.pathname,
			captured_at: new Date().toISOString()
		};
		localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(attribution));
	} catch {
		// localStorage unavailable (private mode etc.) — attribution is best-effort
	}
}

export function getFirstTouchAttribution(): FirstTouchAttribution | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as FirstTouchAttribution) : null;
	} catch {
		return null;
	}
}
