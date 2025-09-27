// src/lib/config/trial.ts
export const TRIAL_CONFIG = {
	// Default trial length in days
	DEFAULT_TRIAL_DAYS: 14,

	// Grace period after trial ends before account suspension
	GRACE_PERIOD_DAYS: 7,

	// Warning email days before trial ends
	WARNING_DAYS: [7, 3, 1],

	// Features available in read-only mode after trial
	READ_ONLY_FEATURES: {
		// What users CAN do in read-only mode
		canView: true,
		canExport: true,
		canLogin: true,
		canViewBriefs: true,
		canViewProjects: true,
		canViewTasks: true,
		canViewCalendar: true,

		// What users CANNOT do in read-only mode
		canCreateProjects: false,
		canEditProjects: false,
		canCreateTasks: false,
		canEditTasks: false,
		canUseBrainDump: false,
		canGenerateBriefs: false,
		canSyncCalendar: false,
		canInviteMembers: false
	},

	// Messages to show users
	MESSAGES: {
		trialActive: (daysLeft: number) => `Your ${daysLeft}-day trial is active`,
		trialEnded: 'Your trial has ended. Subscribe to continue using BuildOS.',
		readOnlyMode: 'Your account is in read-only mode. Subscribe to regain full access.',
		trialExpiringSoon: (daysLeft: number) =>
			`Your trial expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Subscribe now to ensure uninterrupted access.`,
		gracePeriod: (daysLeft: number) =>
			`Your trial has ended. You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} grace period to subscribe before your account is suspended.`
	}
};

// Helper functions
export function calculateTrialEndDate(
	startDate: Date = new Date(),
	trialDays: number = TRIAL_CONFIG.DEFAULT_TRIAL_DAYS
): Date {
	const endDate = new Date(startDate);
	endDate.setDate(endDate.getDate() + trialDays);
	endDate.setHours(23, 59, 59, 999); // End of day
	return endDate;
}

export function getDaysUntilTrialEnd(trialEndDate: Date): number {
	const now = new Date();
	const diffTime = trialEndDate.getTime() - now.getTime();
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	return Math.max(0, diffDays);
}

export function isInTrial(user: {
	trial_ends_at?: string | null;
	subscription_status?: string;
}): boolean {
	if (!user.trial_ends_at) return false;
	if (user.subscription_status === 'active') return false;

	const trialEnd = new Date(user.trial_ends_at);
	return trialEnd > new Date();
}

export function isInGracePeriod(user: {
	trial_ends_at?: string | null;
	subscription_status?: string;
}): boolean {
	if (!user.trial_ends_at) return false;
	if (user.subscription_status === 'active') return false;

	const trialEnd = new Date(user.trial_ends_at);
	const gracePeriodEnd = new Date(trialEnd);
	gracePeriodEnd.setDate(gracePeriodEnd.getDate() + TRIAL_CONFIG.GRACE_PERIOD_DAYS);

	const now = new Date();
	return now > trialEnd && now <= gracePeriodEnd;
}

export function isTrialExpired(user: {
	trial_ends_at?: string | null;
	subscription_status?: string;
}): boolean {
	if (!user.trial_ends_at) return false;
	if (user.subscription_status === 'active') return false;

	const trialEnd = new Date(user.trial_ends_at);
	const gracePeriodEnd = new Date(trialEnd);
	gracePeriodEnd.setDate(gracePeriodEnd.getDate() + TRIAL_CONFIG.GRACE_PERIOD_DAYS);

	return new Date() > gracePeriodEnd;
}

export function shouldShowTrialWarning(user: {
	trial_ends_at?: string | null;
	subscription_status?: string;
}): boolean {
	if (!isInTrial(user)) return false;

	const daysLeft = getDaysUntilTrialEnd(new Date(user.trial_ends_at!));
	return TRIAL_CONFIG.WARNING_DAYS.includes(daysLeft);
}
