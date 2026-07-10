// apps/web/src/lib/services/browser-analytics.ts
import { browser, dev } from '$app/environment';
import {
	getEffectiveTrackingPreferences,
	TRACKING_PREFERENCES_CHANGED_EVENT,
	type TrackingPreferences
} from './tracking-consent';

const META_PIXEL_ID = '1295810581888875';
const META_SCRIPT_ID = 'buildos-meta-pixel';

type PostHogModule = typeof import('./posthog');
type VisitorModule = typeof import('./visitor.service');

interface MetaPixelFunction {
	(...args: unknown[]): void;
	callMethod?: (...args: unknown[]) => void;
	queue: unknown[][];
	push: MetaPixelFunction;
	loaded: boolean;
	version: string;
}

type MetaWindow = Window & {
	fbq?: MetaPixelFunction;
	_fbq?: MetaPixelFunction;
};

let operationalMeasurementScheduled = false;
let postHogModulePromise: Promise<PostHogModule> | null = null;
let visitorModulePromise: Promise<VisitorModule> | null = null;
let metaInitialized = false;
let metaEnabled = false;
let lastMetaPageView: string | null = null;

function runWhenIdle(callback: () => void, timeout = 3000): void {
	if (!browser) return;

	if ('requestIdleCallback' in window) {
		window.requestIdleCallback(callback, { timeout });
		return;
	}

	setTimeout(callback, Math.min(timeout, 1500));
}

function scheduleOperationalMeasurement(): void {
	if (!browser || dev || operationalMeasurementScheduled) return;
	operationalMeasurementScheduled = true;

	runWhenIdle(() => {
		void Promise.all([
			import('@vercel/analytics/sveltekit').then(({ injectAnalytics }) => {
				injectAnalytics({ mode: 'production' });
			}),
			import('@vercel/speed-insights/sveltekit').then(({ injectSpeedInsights }) => {
				injectSpeedInsights();
			})
		]).catch((error) => {
			console.warn('Operational measurement failed to initialize:', error);
		});
	}, 3500);
}

function getMetaPixel(): MetaPixelFunction {
	const metaWindow = window as MetaWindow;
	if (metaWindow.fbq) return metaWindow.fbq;

	const fbq = function (...args: unknown[]) {
		if (fbq.callMethod) {
			fbq.callMethod(...args);
			return;
		}
		fbq.queue.push(args);
	} as MetaPixelFunction;

	fbq.push = fbq;
	fbq.loaded = true;
	fbq.version = '2.0';
	fbq.queue = [];
	metaWindow.fbq = fbq;
	metaWindow._fbq = fbq;
	return fbq;
}

function currentPageKey(): string {
	return `${window.location.pathname}${window.location.search}`;
}

function enableMetaPixel(): void {
	if (!browser || dev) return;

	const fbq = getMetaPixel();
	if (!metaInitialized) {
		metaInitialized = true;
		fbq('consent', 'grant');
		fbq('init', META_PIXEL_ID);

		if (!document.getElementById(META_SCRIPT_ID)) {
			const script = document.createElement('script');
			script.id = META_SCRIPT_ID;
			script.async = true;
			script.src = 'https://connect.facebook.net/en_US/fbevents.js';
			document.head.appendChild(script);
		}
	} else {
		fbq('consent', 'grant');
	}

	metaEnabled = true;
	trackMetaPageView();
}

function disableMetaPixel(): void {
	metaEnabled = false;
	lastMetaPageView = null;
	if (!browser) return;
	(window as MetaWindow).fbq?.('consent', 'revoke');
}

async function enableProductAnalytics(): Promise<void> {
	postHogModulePromise ??= import('./posthog');
	visitorModulePromise ??= import('./visitor.service');

	const [posthog, visitor] = await Promise.all([postHogModulePromise, visitorModulePromise]);
	posthog.initPostHog();
	await visitor.visitorService.initialize();
}

function disableProductAnalytics(): void {
	if (postHogModulePromise) {
		void postHogModulePromise.then(({ disablePostHog }) => disablePostHog());
	}
	if (visitorModulePromise) {
		void visitorModulePromise.then(({ visitorService }) => visitorService.clearTrackingData());
	}
}

async function applyTrackingPreferences(): Promise<void> {
	const preferences = getEffectiveTrackingPreferences();

	if (preferences?.analytics) {
		await enableProductAnalytics();
	} else {
		disableProductAnalytics();
	}

	if (preferences?.marketing) {
		enableMetaPixel();
	} else {
		disableMetaPixel();
	}
}

export function initializeBrowserAnalytics(): () => void {
	if (!browser) return () => {};

	scheduleOperationalMeasurement();
	void applyTrackingPreferences();

	const handlePreferenceChange = (_event: Event) => {
		void applyTrackingPreferences();
	};
	window.addEventListener(TRACKING_PREFERENCES_CHANGED_EVENT, handlePreferenceChange);

	return () => {
		window.removeEventListener(TRACKING_PREFERENCES_CHANGED_EVENT, handlePreferenceChange);
	};
}

export function trackMetaPageView(): void {
	if (!browser || !metaEnabled) return;

	const pageKey = currentPageKey();
	if (lastMetaPageView === pageKey) return;
	lastMetaPageView = pageKey;
	(window as MetaWindow).fbq?.('track', 'PageView');
}

export type { TrackingPreferences };
