// apps/web/src/lib/server/welcome-sequence.logic.test.ts
import { describe, expect, it } from 'vitest';

import { buildWelcomeEmailContent } from './welcome-sequence.content';
import {
	determineNextWelcomeAction,
	getWelcomeBacklogSkip,
	hasReturnedForSecondSession,
	isOutsideWelcomeWindow,
	WELCOME_SEQUENCE_WINDOW_DAYS,
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

	it('sends Email 2 with already_created_project branch when a first project already exists', () => {
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
			action: 'send',
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

describe('welcome sequence backlog guard', () => {
	it('derives the window from the last step day plus the lateness allowance', () => {
		expect(WELCOME_SEQUENCE_WINDOW_DAYS).toBe(12);
		expect(
			isOutsideWelcomeWindow('2026-03-01T10:00:00.000Z', new Date('2026-03-13T10:00:00.000Z'))
		).toBe(false);
		expect(
			isOutsideWelcomeWindow('2026-03-01T10:00:00.000Z', new Date('2026-03-13T10:00:01.000Z'))
		).toBe(true);
	});

	it('lets an on-time step through to the normal decision', () => {
		const progress = createProgress({ sentAt: { email_1: '2026-03-01T10:01:00.000Z' } });

		expect(getWelcomeBacklogSkip(progress, new Date('2026-03-02T10:30:00.000Z'))).toBeNull();
	});

	it('keeps a step held from Friday evening to Monday morning sendable', () => {
		// Thursday 17:30 signup: email_2 falls due Friday 17:30, first send window is Monday 09:00.
		const progress = createProgress({
			startedAt: '2026-03-05T17:30:00.000Z',
			sentAt: { email_1: '2026-03-05T17:31:00.000Z' }
		});

		expect(getWelcomeBacklogSkip(progress, new Date('2026-03-09T09:00:00.000Z'))).toBeNull();
	});

	it('skips a step that is more than three days overdue', () => {
		const progress = createProgress({ sentAt: { email_1: '2026-03-01T10:01:00.000Z' } });

		expect(getWelcomeBacklogSkip(progress, new Date('2026-03-05T10:30:00.000Z'))).toEqual({
			action: 'skip',
			step: 'email_2',
			reason: 'step_overdue'
		});
	});

	it('skips the welcome itself for a signup past the window', () => {
		expect(
			getWelcomeBacklogSkip(createProgress(), new Date('2026-09-01T10:00:00.000Z'))
		).toEqual({
			action: 'skip',
			step: 'email_1',
			reason: 'outside_welcome_window'
		});
	});

	it('fails closed when the start time cannot be read', () => {
		expect(
			getWelcomeBacklogSkip(
				createProgress({ startedAt: 'not-a-date' }),
				new Date('2026-03-01T10:00:00.000Z')
			)
		).toMatchObject({ action: 'skip', step: 'email_1', reason: 'outside_welcome_window' });
	});

	it('leaves finished sequences alone', () => {
		expect(
			getWelcomeBacklogSkip(
				createProgress({ status: 'completed' }),
				new Date('2026-09-01T10:00:00.000Z')
			)
		).toBeNull();
	});
});
