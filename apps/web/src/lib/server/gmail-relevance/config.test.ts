// apps/web/src/lib/server/gmail-relevance/config.test.ts
import { describe, expect, it } from 'vitest';
import {
	isGmailRelevancePhaseAEnabled,
	isGmailRelevancePhaseAReviewUserAllowed,
	isGmailRelevancePhaseAUserAllowed
} from './config';

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

	it('keeps review independently default-off and exactly allowlisted', () => {
		const reviewEnv = {
			GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED: 'true',
			GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS: 'reviewer-a'
		};
		expect(isGmailRelevancePhaseAReviewUserAllowed('reviewer-a', {})).toBe(false);
		expect(isGmailRelevancePhaseAReviewUserAllowed('reviewer-a', reviewEnv)).toBe(true);
		expect(isGmailRelevancePhaseAReviewUserAllowed('reviewer-b', reviewEnv)).toBe(false);
		expect(
			isGmailRelevancePhaseAReviewUserAllowed('reviewer-a', {
				GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED: 'true',
				GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS: '*'
			})
		).toBe(false);
	});
});
