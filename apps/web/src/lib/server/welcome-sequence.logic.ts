// apps/web/src/lib/server/welcome-sequence.logic.ts
export const WELCOME_SEQUENCE_VERSION = '2026-03-16';
export const WELCOME_SEQUENCE_STEPS = [
	'email_1',
	'email_2',
	'email_3',
	'email_4',
	'email_5'
] as const;

export type WelcomeSequenceStep = (typeof WELCOME_SEQUENCE_STEPS)[number];

export interface WelcomeSequenceProgress {
	startedAt: string;
	status: 'active' | 'completed' | 'cancelled';
	sentAt: Partial<Record<WelcomeSequenceStep, string | null>>;
	skippedAt: Partial<Record<WelcomeSequenceStep, string | null>>;
}

export interface WelcomeSequenceProductState {
	userId: string;
	email: string;
	name: string | null;
	createdAt: string;
	timezone: string | null;
	onboardingIntent: string | null;
	onboardingCompleted: boolean;
	projectCount: number;
	latestProjectId: string | null;
	emailDailyBriefEnabled: boolean;
	smsChannelEnabled: boolean;
	calendarConnected: boolean;
	lastVisit: string | null;
}

export interface WelcomeStepAction {
	action: 'send' | 'skip' | 'wait' | 'complete';
	step?: WelcomeSequenceStep;
	branchKey?: string;
	reason: string;
}

const STEP_DAY_OFFSETS: Record<WelcomeSequenceStep, number> = {
	email_1: 0,
	email_2: 1,
	email_3: 3,
	email_4: 6,
	email_5: 9
};

const SEND_WINDOW_START_HOUR = 9;
const SEND_WINDOW_END_HOUR = 17;

function safeTimezone(timezone: string | null | undefined): string {
	if (!timezone) {
		return 'UTC';
	}

	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
		return timezone;
	} catch {
		return 'UTC';
	}
}

function addDays(isoTimestamp: string, days: number): Date {
	const next = new Date(isoTimestamp);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function getLocalHour(timezone: string, now: Date): number {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: safeTimezone(timezone),
		hour12: false,
		hour: '2-digit'
	});
	return Number(formatter.format(now));
}

function isStepFinalized(progress: WelcomeSequenceProgress, step: WelcomeSequenceStep): boolean {
	return Boolean(progress.sentAt[step] || progress.skippedAt[step]);
}

export function getEmail3Branch(state: WelcomeSequenceProductState): string {
	if (state.projectCount === 0) {
		return 'no_project';
	}
	if (!state.onboardingCompleted) {
		return 'finish_setup';
	}
	return 'reopen_project';
}

export function getEmail4Branch(state: WelcomeSequenceProductState): {
	shouldSend: boolean;
	branchKey: string;
} {
	const hasFollowThroughChannel =
		state.emailDailyBriefEnabled || state.smsChannelEnabled || state.calendarConnected;

	if (!state.onboardingCompleted) {
		return { shouldSend: true, branchKey: 'finish_setup' };
	}

	if (!hasFollowThroughChannel) {
		return { shouldSend: true, branchKey: 'follow_through_missing' };
	}

	return { shouldSend: false, branchKey: 'follow_through_ready' };
}

export function hasReturnedForSecondSession(
	progress: WelcomeSequenceProgress,
	state: WelcomeSequenceProductState
): boolean {
	if (!state.lastVisit) {
		return false;
	}

	const startedAt = new Date(progress.startedAt).getTime();
	const lastVisit = new Date(state.lastVisit).getTime();
	if (Number.isNaN(startedAt) || Number.isNaN(lastVisit)) {
		return false;
	}

	return lastVisit - startedAt >= 12 * 60 * 60 * 1000;
}

export function isWithinWelcomeSendWindow(
	timezone: string | null | undefined,
	now: Date = new Date()
): boolean {
	const localHour = getLocalHour(safeTimezone(timezone), now);
	return localHour >= SEND_WINDOW_START_HOUR && localHour < SEND_WINDOW_END_HOUR;
}

export function determineNextWelcomeAction(
	progress: WelcomeSequenceProgress,
	state: WelcomeSequenceProductState,
	now: Date = new Date()
): WelcomeStepAction {
	if (progress.status === 'completed' || progress.status === 'cancelled') {
		return { action: 'complete', reason: `sequence_${progress.status}` };
	}

	for (const step of WELCOME_SEQUENCE_STEPS) {
		if (isStepFinalized(progress, step)) {
			continue;
		}

		const dueAt = addDays(progress.startedAt, STEP_DAY_OFFSETS[step]);
		if (dueAt.getTime() > now.getTime()) {
			return { action: 'wait', step, reason: `${step}_not_due` };
		}

		if (step !== 'email_1' && !isWithinWelcomeSendWindow(state.timezone, now)) {
			return { action: 'wait', step, reason: 'outside_send_window' };
		}

		switch (step) {
			case 'email_1':
				return { action: 'send', step, branchKey: 'welcome', reason: 'initial_welcome' };
			case 'email_2':
				if (state.projectCount === 0) {
					return { action: 'send', step, branchKey: 'no_project', reason: 'no_project' };
				}
				return {
					action: 'send',
					step,
					branchKey: 'already_created_project',
					reason: 'project_already_created'
				};
			case 'email_3':
				return {
					action: 'send',
					step,
					branchKey: getEmail3Branch(state),
					reason: 'context_carry_forward'
				};
			case 'email_4': {
				const email4Decision = getEmail4Branch(state);
				return email4Decision.shouldSend
					? {
							action: 'send',
							step,
							branchKey: email4Decision.branchKey,
							reason: 'follow_through_nudge'
						}
					: {
							action: 'skip',
							step,
							branchKey: email4Decision.branchKey,
							reason: 'follow_through_already_configured'
						};
			}
			case 'email_5':
				return {
					action: 'send',
					step,
					branchKey: hasReturnedForSecondSession(progress, state)
						? 'returning_check_in'
						: 'general_check_in',
					reason: 'personal_check_in'
				};
		}
	}

	return { action: 'complete', reason: 'all_steps_finalized' };
}
