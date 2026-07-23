// apps/web/src/lib/server/gmail-relevance/config.test.ts
import { describe, expect, it } from 'vitest';
import { isGmailRelevancePhaseAEnabled, isGmailRelevancePhaseAUserAllowed } from './config';

describe('Gmail relevance Phase A config', () => {
	it('is disabled by default', () => {
		expect(isGmailRelevancePhaseAEnabled({})).toBe(false);
		expect(isGmailRelevancePhaseAUserAllowed('user-a', {})).toBe(false);
	});

	it('requires both the global flag and an exact user ID', () => {
		const env = {
			GMAIL_RELEVANCE_PHASE_A_ENABLED: 'true',
			GMAIL_RELEVANCE_PHASE_A_USER_IDS: 'user-a, user-b'
		};

		expect(isGmailRelevancePhaseAUserAllowed('user-a', env)).toBe(true);
		expect(isGmailRelevancePhaseAUserAllowed('user-c', env)).toBe(false);
	});

	it('does not treat a wildcard as authorization', () => {
		expect(
			isGmailRelevancePhaseAUserAllowed('user-a', {
				GMAIL_RELEVANCE_PHASE_A_ENABLED: 'true',
				GMAIL_RELEVANCE_PHASE_A_USER_IDS: '*'
			})
		).toBe(false);
	});
});
