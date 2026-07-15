// apps/web/src/lib/components/notifications/notification-preview.ts
import type {
	AgentRunNotification,
	CalendarAnalysisNotification,
	Notification,
	ProjectSynthesisNotification,
	StepsProgress,
	TimeBlockNotification
} from '$lib/types/notification.types';

export interface NotificationPreviewContract {
	contextLabel: string;
	contextAriaLabel?: string;
	accessibleContextSuffix?: string;
	actionLabel: string;
	targetLabel?: string | null;
	preview?: string | null;
}

const MODULE_LABELS: Record<string, string> = {
	task_synthesis: 'Tasks',
	project_analysis: 'Analysis',
	completion_score: 'Score',
	thought_partner: 'Insights'
};

function progressMessage(notification: Notification): string | null {
	const progress = notification.progress;
	if (!progress) return null;

	if ('message' in progress && typeof progress.message === 'string' && progress.message.trim()) {
		return progress.message.trim();
	}

	if (progress.type === 'steps' && progress.steps.length > 0) {
		const index = Math.min(progress.currentStep, progress.steps.length - 1);
		return progress.steps[index]?.message || progress.steps[index]?.name || null;
	}

	return null;
}

function projectSynthesisPreview(
	notification: ProjectSynthesisNotification
): NotificationPreviewContract {
	const steps =
		notification.progress?.type === 'steps' ? (notification.progress as StepsProgress) : null;
	const hasSteps = Boolean(steps && steps.totalSteps > 0);
	const currentStepIndex = hasSteps
		? Math.max(0, Math.min(steps!.currentStep, steps!.totalSteps - 1))
		: 0;
	const currentStep = hasSteps
		? steps!.steps[Math.min(currentStepIndex, steps!.steps.length - 1)]
		: null;
	const modules = notification.data.selectedModules
		.map((module) => MODULE_LABELS[module] ?? module)
		.join(' · ');

	if (notification.status === 'success') {
		const result = notification.data.result;
		return {
			contextLabel: notification.data.projectName,
			contextAriaLabel: `Project: ${notification.data.projectName}`,
			actionLabel: 'Review project synthesis',
			targetLabel: modules || 'Project audit',
			preview:
				result?.summary ||
				result?.insights ||
				(result
					? `${result.operationsCount} optimization${result.operationsCount === 1 ? '' : 's'} proposed across ${notification.data.taskCount} tasks.`
					: 'Project synthesis is ready to review.')
		};
	}

	if (notification.status === 'error') {
		return {
			contextLabel: notification.data.projectName,
			contextAriaLabel: `Project: ${notification.data.projectName}`,
			actionLabel: 'Retry project synthesis',
			targetLabel: modules || 'Project audit',
			preview:
				notification.data.error ||
				progressMessage(notification) ||
				'The analysis did not finish.'
		};
	}

	const stepLabel = currentStep?.name || 'Analyzing project tasks';
	const stepCount = hasSteps ? `Step ${currentStepIndex + 1} of ${steps!.totalSteps}` : null;

	return {
		contextLabel: notification.data.projectName,
		contextAriaLabel: `Project: ${notification.data.projectName}`,
		actionLabel: 'Analyze project',
		targetLabel: modules || 'Project audit',
		preview: [currentStep?.message || stepLabel, stepCount].filter(Boolean).join(' · ')
	};
}

function timeBlockPreview(notification: TimeBlockNotification): NotificationPreviewContract {
	const suggestionCount = notification.data.suggestions?.length ?? 0;
	const suggestionsState = notification.data.suggestionsState;
	const duration = `${notification.data.durationMinutes} min`;

	if (notification.status === 'processing') {
		return {
			contextLabel: notification.data.projectName || 'Calendar',
			contextAriaLabel: notification.data.projectName
				? `Project: ${notification.data.projectName}`
				: 'Calendar',
			actionLabel: 'Create time block',
			targetLabel: duration,
			preview:
				suggestionsState?.progress ||
				progressMessage(notification) ||
				'Analyzing tasks for this block.'
		};
	}

	if (notification.status === 'success' || notification.status === 'warning') {
		return {
			contextLabel: notification.data.projectName || 'Calendar',
			contextAriaLabel: notification.data.projectName
				? `Project: ${notification.data.projectName}`
				: 'Calendar',
			actionLabel: 'Review time block',
			targetLabel: duration,
			preview:
				notification.data.suggestionsSummary ||
				(notification.status === 'warning'
					? 'The block was created, but AI suggestions are unavailable.'
					: suggestionCount > 0
						? `${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'} ready to review.`
						: 'The time block is ready.')
		};
	}

	if (notification.status === 'error') {
		return {
			contextLabel: notification.data.projectName || 'Calendar',
			contextAriaLabel: notification.data.projectName
				? `Project: ${notification.data.projectName}`
				: 'Calendar',
			actionLabel: 'Retry time block',
			targetLabel: duration,
			preview:
				notification.data.error ||
				progressMessage(notification) ||
				'The time block did not finish.'
		};
	}

	return {
		contextLabel: notification.data.projectName || 'Calendar',
		contextAriaLabel: notification.data.projectName
			? `Project: ${notification.data.projectName}`
			: 'Calendar',
		actionLabel: 'Open time block',
		targetLabel: duration,
		preview: notification.data.error || progressMessage(notification)
	};
}

function calendarRangeLabel(notification: CalendarAnalysisNotification): string {
	const { daysBack, daysForward } = notification.data;
	if (daysBack === 0 && daysForward === 0) return 'Today';

	const past = daysBack > 0 ? `Past ${daysBack} day${daysBack === 1 ? '' : 's'}` : null;
	const future =
		daysForward > 0 ? `Next ${daysForward} day${daysForward === 1 ? '' : 's'}` : null;
	return [past, future].filter(Boolean).join(' · ') || 'Recent activity';
}

function calendarAnalysisPreview(
	notification: CalendarAnalysisNotification
): NotificationPreviewContract {
	const suggestions = Array.isArray(notification.data.suggestions)
		? notification.data.suggestions.length
		: 0;
	const events = notification.data.eventCount;
	const context: NotificationPreviewContract = {
		contextLabel: 'Calendar',
		actionLabel: 'Analyze calendar',
		targetLabel: calendarRangeLabel(notification)
	};

	if (notification.status === 'success') {
		return {
			...context,
			actionLabel: 'Review calendar analysis',
			preview:
				typeof events === 'number'
					? `${suggestions} suggestion${suggestions === 1 ? '' : 's'} from ${events} event${events === 1 ? '' : 's'}.`
					: `${suggestions} suggestion${suggestions === 1 ? '' : 's'} ready to review.`
		};
	}

	if (notification.status === 'error') {
		return {
			...context,
			actionLabel: 'Retry calendar analysis',
			preview:
				notification.data.error ||
				progressMessage(notification) ||
				'The calendar analysis did not finish.'
		};
	}

	return {
		...context,
		preview: progressMessage(notification) || 'Looking for project activity and follow-up work.'
	};
}

function agentRunPreview(notification: AgentRunNotification): NotificationPreviewContract {
	const contextLabel =
		notification.data.projectName ||
		(notification.data.contextType === 'global' ? 'Workspace' : 'Project');

	return {
		contextLabel,
		contextAriaLabel: notification.data.projectName
			? `Project: ${notification.data.projectName}`
			: contextLabel,
		accessibleContextSuffix: 'agent work',
		actionLabel: notification.data.activityLabel || notification.data.label,
		targetLabel: notification.data.targetLabel,
		preview: notification.data.preview || notification.data.goal
	};
}

export function getNotificationPreview(
	notification:
		| AgentRunNotification
		| ProjectSynthesisNotification
		| TimeBlockNotification
		| CalendarAnalysisNotification
): NotificationPreviewContract {
	switch (notification.type) {
		case 'agent-run':
			return agentRunPreview(notification);
		case 'project-synthesis':
			return projectSynthesisPreview(notification);
		case 'time-block':
			return timeBlockPreview(notification);
		case 'calendar-analysis':
			return calendarAnalysisPreview(notification);
	}
}

export function notificationPreviewAriaLabel(contract: NotificationPreviewContract): string {
	const target = contract.targetLabel ? ` — ${contract.targetLabel}` : '';
	const preview = contract.preview ? `. ${contract.preview}` : '';
	const contextSuffix = contract.accessibleContextSuffix
		? ` ${contract.accessibleContextSuffix}`
		: '';
	return `Open ${contract.contextLabel}${contextSuffix}: ${contract.actionLabel}${target}${preview}`;
}
