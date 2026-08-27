// apps/worker/src/workers/notification/email-action-url.test.ts
import { describe, expect, it } from 'vitest';

import { buildDailyBriefUrl, resolveNotificationActionUrl } from './email-action-url.js';

describe('resolveNotificationActionUrl', () => {
	it('turns a document workspace path into an absolute email destination', () => {
		expect(
			resolveNotificationActionUrl(
				'https://build-os.com',
				'/projects/project-1/documents/document-1'
			)
		).toBe('https://build-os.com/projects/project-1/documents/document-1');
	});

	it('preserves valid absolute destinations', () => {
		expect(
			resolveNotificationActionUrl(
				'https://build-os.com',
				'https://app.build-os.com/projects/project-1'
			)
		).toBe('https://app.build-os.com/projects/project-1');
	});

	it('rejects non-web protocols', () => {
		expect(
			resolveNotificationActionUrl('https://build-os.com', 'javascript:alert(1)')
		).toBeNull();
	});
});

describe('buildDailyBriefUrl', () => {
	it('opens the exact generated brief in the single-brief reader', () => {
		expect(buildDailyBriefUrl('https://build-os.com', '2026-08-27', 'brief-1')).toBe(
			'https://build-os.com/briefs?date=2026-08-27&view=single&brief_id=brief-1'
		);
	});

	it('falls back to the brief reader when identifiers are unavailable', () => {
		expect(buildDailyBriefUrl('https://build-os.com', null)).toBe(
			'https://build-os.com/briefs?view=single'
		);
	});
});
