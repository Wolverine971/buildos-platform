// apps/web/src/lib/server/welcome-sequence.logic.test.ts
import { describe, expect, it } from 'vitest';

import { buildWelcomeEmailContent } from './welcome-sequence.content';
import {
	determineNextWelcomeAction,
	hasReturnedForSecondSession,
	type WelcomeSequenceProductState,
	type WelcomeSequenceProgress
} from './welcome-sequence.logic';

function createProgress(overrides: Partial<WelcomeSequenceProgress> = {}): WelcomeSequenceProgress {
	return {
		startedAt: '2026-03-01T10:00:00.000Z',
		status: 'active',
		sentAt: {},
		skippedAt: {},
		...overrides
	};
}

function createState(
	overrides: Partial<WelcomeSequenceProductState> = {}
): WelcomeSequenceProductState {
	return {
		userId: 'user-123',
		email: 'user@example.com',
		name: 'Alex Builder',
		createdAt: '2026-03-01T10:00:00.000Z',
		timezone: 'UTC',
		onboardingIntent: 'plan',
		onboardingCompleted: false,
		projectCount: 0,
		latestProjectId: null,
		emailDailyBriefEnabled: false,
		smsChannelEnabled: false,
		calendarConnected: false,
		lastVisit: null,
		...overrides
	};
}

describe('welcome sequence logic', () => {
	it('sends Email 2 after one day when no project exists', () => {
		const action = determineNextWelcomeAction(
			createProgress({
				sentAt: {
					email_1: '2026-03-01T10:01:00.000Z'
				}
			}),
			createState(),
			new Date('2026-03-02T10:30:00.000Z')
		);

		expect(action).toMatchObject({
			action: 'send',
			step: 'email_2',
			branchKey: 'no_project'
		});
	});

	it('skips Email 2 when a first project already exists', () => {
		const action = determineNextWelcomeAction(
			createProgress({
				sentAt: {
					email_1: '2026-03-01T10:01:00.000Z'
				}
			}),
			createState({
				projectCount: 1,
				latestProjectId: 'project-1'
			}),
			new Date('2026-03-02T10:30:00.000Z')
		);

		expect(action).toMatchObject({
			action: 'skip',
			step: 'email_2',
			branchKey: 'already_created_project'
		});
	});

	it('skips Email 4 when onboarding is complete and a follow-through channel is already set up', () => {
		const action = determineNextWelcomeAction(
			createProgress({
				sentAt: {
					email_1: '2026-03-01T10:01:00.000Z',
					email_2: '2026-03-02T10:01:00.000Z',
					email_3: '2026-03-04T10:01:00.000Z'
				}
			}),
			createState({
				onboardingCompleted: true,
				projectCount: 1,
				emailDailyBriefEnabled: true,
				smsChannelEnabled: true,
				calendarConnected: true,
				latestProjectId: 'project-1'
			}),
			new Date('2026-03-07T10:30:00.000Z')
		);

		expect(action).toMatchObject({
			action: 'skip',
			step: 'email_4',
			branchKey: 'follow_through_ready'
		});
	});

	it('sends Email 4 when onboarding is complete but no follow-through channel exists', () => {
		const action = determineNextWelcomeAction(
			createProgress({
				sentAt: {
					email_1: '2026-03-01T10:01:00.000Z',
					email_2: '2026-03-02T10:01:00.000Z',
					email_3: '2026-03-04T10:01:00.000Z'
				}
			}),
			createState({
				onboardingCompleted: true,
				projectCount: 1,
				latestProjectId: 'project-1'
			}),
			new Date('2026-03-07T10:30:00.000Z')
		);

		expect(action).toMatchObject({
			action: 'send',
			step: 'email_4',
			branchKey: 'follow_through_missing'
		});
	});

	it('detects a returning user and keeps project CTA for Email 5', () => {
		const progress = createProgress({
			sentAt: {
				email_1: '2026-03-01T10:01:00.000Z',
				email_3: '2026-03-04T10:01:00.000Z'
			}
		});
		const state = createState({
			projectCount: 1,
			latestProjectId: 'project-123',
			onboardingCompleted: true,
			lastVisit: '2026-03-02T00:30:00.000Z'
		});

		expect(hasReturnedForSecondSession(progress, state)).toBe(true);

		const email = buildWelcomeEmailContent('email_5', progress, state, 'https://build-os.com');

		expect(email.branchKey).toBe('returning_check_in');
		expect(email.ctaUrl).toBe('https://build-os.com/projects/project-123');
		expect(email.body).toContain('reply to this email');
	});

	it('keeps plain-text greetings unescaped while escaping HTML greetings', () => {
		const email = buildWelcomeEmailContent(
			'email_1',
			createProgress(),
			createState({
				name: "D'Angelo Builder"
			}),
			'https://build-os.com'
		);

		expect(email.body).toContain("Hi D'Angelo,");
		expect(email.body).not.toContain('D&#39;Angelo');
		expect(email.html).toContain('<p>Hi D&#39;Angelo,</p>');
	});
});
