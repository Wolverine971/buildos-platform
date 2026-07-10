// apps/web/src/lib/services/tracking-consent.test.ts
import { describe, expect, it } from 'vitest';
import { detectBrowserPrivacySignal, parseTrackingPreferences } from './tracking-consent';

describe('tracking consent', () => {
	it('accepts only the current persisted preference shape', () => {
		expect(
			parseTrackingPreferences(
				JSON.stringify({
					version: 1,
					analytics: true,
					marketing: false,
					updatedAt: '2026-07-10T00:00:00.000Z'
				})
			)
		).toEqual({
			version: 1,
			analytics: true,
			marketing: false,
			updatedAt: '2026-07-10T00:00:00.000Z'
		});

		expect(parseTrackingPreferences('{bad json')).toBeNull();
		expect(
			parseTrackingPreferences(
				JSON.stringify({ version: 2, analytics: true, marketing: true, updatedAt: 'now' })
			)
		).toBeNull();
	});

	it('prioritizes Global Privacy Control and recognizes Do Not Track', () => {
		expect(detectBrowserPrivacySignal({ globalPrivacyControl: true, doNotTrack: '0' })).toBe(
			'global-privacy-control'
		);
		expect(detectBrowserPrivacySignal({ doNotTrack: '1' })).toBe('do-not-track');
		expect(detectBrowserPrivacySignal({ doNotTrack: '0' })).toBeNull();
	});
});
