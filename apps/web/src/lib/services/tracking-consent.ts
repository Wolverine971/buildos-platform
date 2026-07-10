// apps/web/src/lib/services/tracking-consent.ts
import { browser } from '$app/environment';

export const TRACKING_PREFERENCES_STORAGE_KEY = 'buildos_tracking_preferences_v1';
export const TRACKING_PREFERENCES_CHANGED_EVENT = 'buildos:tracking-preferences-changed';
export const TRACKING_PREFERENCES_OPEN_EVENT = 'buildos:open-tracking-preferences';

const TRACKING_PREFERENCES_VERSION = 1 as const;
let runtimePreferences: TrackingPreferences | null = null;

export type TrackingPreferences = {
	version: typeof TRACKING_PREFERENCES_VERSION;
	analytics: boolean;
	marketing: boolean;
	updatedAt: string;
};

export type BrowserPrivacySignal = 'global-privacy-control' | 'do-not-track' | null;

type NavigatorPrivacyState = Pick<Navigator, 'doNotTrack'> & {
	globalPrivacyControl?: boolean;
};

export function parseTrackingPreferences(raw: string | null): TrackingPreferences | null {
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<TrackingPreferences>;
		if (
			parsed.version !== TRACKING_PREFERENCES_VERSION ||
			typeof parsed.analytics !== 'boolean' ||
			typeof parsed.marketing !== 'boolean' ||
			typeof parsed.updatedAt !== 'string'
		) {
			return null;
		}

		return {
			version: TRACKING_PREFERENCES_VERSION,
			analytics: parsed.analytics,
			marketing: parsed.marketing,
			updatedAt: parsed.updatedAt
		};
	} catch {
		return null;
	}
}

export function detectBrowserPrivacySignal(
	navigatorState?: NavigatorPrivacyState | null
): BrowserPrivacySignal {
	if (navigatorState?.globalPrivacyControl === true) return 'global-privacy-control';
	if (navigatorState?.doNotTrack === '1') return 'do-not-track';
	return null;
}

export function getBrowserPrivacySignal(): BrowserPrivacySignal {
	if (!browser) return null;
	return detectBrowserPrivacySignal(navigator as NavigatorPrivacyState);
}

export function getStoredTrackingPreferences(): TrackingPreferences | null {
	if (!browser) return null;
	if (runtimePreferences) return runtimePreferences;

	try {
		runtimePreferences = parseTrackingPreferences(
			localStorage.getItem(TRACKING_PREFERENCES_STORAGE_KEY)
		);
		return runtimePreferences;
	} catch {
		return null;
	}
}

export function getEffectiveTrackingPreferences(): TrackingPreferences | null {
	const stored = getStoredTrackingPreferences();
	if (!getBrowserPrivacySignal()) return stored;

	return {
		version: TRACKING_PREFERENCES_VERSION,
		analytics: false,
		marketing: false,
		updatedAt: stored?.updatedAt ?? new Date(0).toISOString()
	};
}

export function hasAnalyticsConsent(): boolean {
	return getEffectiveTrackingPreferences()?.analytics === true;
}

export function hasMarketingConsent(): boolean {
	return getEffectiveTrackingPreferences()?.marketing === true;
}

export function saveTrackingPreferences(
	preferences: Pick<TrackingPreferences, 'analytics' | 'marketing'>
): TrackingPreferences {
	const saved: TrackingPreferences = {
		version: TRACKING_PREFERENCES_VERSION,
		analytics: preferences.analytics,
		marketing: preferences.marketing,
		updatedAt: new Date().toISOString()
	};
	runtimePreferences = saved;

	if (!browser) return saved;

	try {
		localStorage.setItem(TRACKING_PREFERENCES_STORAGE_KEY, JSON.stringify(saved));
	} catch {
		// The runtime preference still applies for this page even if storage is unavailable.
	}

	window.dispatchEvent(
		new CustomEvent<TrackingPreferences>(TRACKING_PREFERENCES_CHANGED_EVENT, {
			detail: saved
		})
	);

	return saved;
}

export function requestTrackingPreferences(): void {
	if (!browser) return;
	window.dispatchEvent(new CustomEvent(TRACKING_PREFERENCES_OPEN_EVENT));
}
