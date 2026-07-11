// apps/worker/src/workers/notification/email-action-url.test.ts
import { describe, expect, it } from 'vitest';

import { resolveNotificationActionUrl } from './email-action-url.js';

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
