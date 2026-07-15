// apps/web/src/lib/components/notifications/notification-preview.test.ts
import { describe, expect, it } from 'vitest';
import { getNotificationPreview, notificationPreviewAriaLabel } from './notification-preview';
import type {
	CalendarAnalysisNotification,
	ProjectSynthesisNotification,
	TimeBlockNotification
} from '$lib/types/notification.types';

const base = {
	id: 'notification-1',
	createdAt: Date.now(),
	updatedAt: Date.now(),
	isMinimized: true,
	isPersistent: true,
	autoCloseMs: null
} as const;

describe('notification preview contract', () => {
	it('puts the project before a verb-led synthesis action and preview', () => {
		const notification: ProjectSynthesisNotification = {
			...base,
			type: 'project-synthesis',
			status: 'success',
			data: {
				projectId: 'project-1',
				projectName: 'Author Training',
				options: { selectedModules: [], config: {} },
				requestPayload: {
					regenerate: false,
					includeDeleted: false,
					options: { selectedModules: [], config: {} }
				},
				taskCount: 12,
				selectedModules: ['task_synthesis', 'project_analysis'],
				result: {
					synthesisId: 'synthesis-1',
					operations: [],
					insights: 'Three duplicate tasks can be combined.',
					comparison: [],
					summary: 'Consolidate overlapping onboarding work.',
					operationsCount: 3,
					consolidationCount: 2,
					newTasksCount: 1,
					deletionsCount: 0
				}
			},
			progress: { type: 'indeterminate', message: 'Complete' },
			actions: {}
		};

		const preview = getNotificationPreview(notification);
		expect(preview).toMatchObject({
			contextLabel: 'Author Training',
			actionLabel: 'Review project synthesis',
			targetLabel: 'Tasks · Analysis',
			preview: 'Consolidate overlapping onboarding work.'
		});
		expect(notificationPreviewAriaLabel(preview)).toBe(
			'Open Author Training: Review project synthesis — Tasks · Analysis. Consolidate overlapping onboarding work.'
		);
	});

	it('does not announce an impossible step count when synthesis progress is empty', () => {
		const notification: ProjectSynthesisNotification = {
			...base,
			type: 'project-synthesis',
			status: 'processing',
			data: {
				projectId: 'project-1',
				projectName: 'Author Training',
				options: { selectedModules: [], config: {} },
				requestPayload: {
					regenerate: false,
					includeDeleted: false,
					options: { selectedModules: [], config: {} }
				},
				taskCount: 0,
				selectedModules: []
			},
			progress: { type: 'steps', currentStep: 0, totalSteps: 0, steps: [] },
			actions: {}
		};

		expect(getNotificationPreview(notification)).toMatchObject({
			contextLabel: 'Author Training',
			actionLabel: 'Analyze project',
			targetLabel: 'Project audit',
			preview: 'Analyzing project tasks'
		});
	});

	it('keeps the project attached to a time-block proposal', () => {
		const notification: TimeBlockNotification = {
			...base,
			type: 'time-block',
			status: 'success',
			data: {
				timeBlockId: 'block-1',
				blockType: 'project',
				projectId: 'project-1',
				projectName: 'Author Training',
				startTime: '2026-07-14T14:00:00.000Z',
				endTime: '2026-07-14T15:00:00.000Z',
				durationMinutes: 60,
				suggestions: []
			},
			progress: { type: 'indeterminate', message: 'Ready' },
			actions: {}
		};

		expect(getNotificationPreview(notification)).toMatchObject({
			contextLabel: 'Author Training',
			actionLabel: 'Review time block',
			targetLabel: '60 min',
			preview: 'The time block is ready.'
		});
	});

	it('uses a retry action and the project context when a time block fails', () => {
		const notification: TimeBlockNotification = {
			...base,
			type: 'time-block',
			status: 'error',
			data: {
				timeBlockId: 'block-2',
				blockType: 'project',
				projectId: 'project-1',
				projectName: 'Author Training',
				startTime: '2026-07-14T14:00:00.000Z',
				endTime: '2026-07-14T15:00:00.000Z',
				durationMinutes: 60,
				error: 'Calendar access expired.'
			},
			progress: { type: 'indeterminate', message: 'Failed' },
			actions: {}
		};

		expect(getNotificationPreview(notification)).toMatchObject({
			contextLabel: 'Author Training',
			actionLabel: 'Retry time block',
			targetLabel: '60 min',
			preview: 'Calendar access expired.'
		});
	});

	it('labels calendar analysis as calendar work with its range and result', () => {
		const notification: CalendarAnalysisNotification = {
			...base,
			type: 'calendar-analysis',
			status: 'success',
			data: {
				daysBack: 7,
				daysForward: 3,
				eventCount: 14,
				suggestions: [{ id: 'suggestion-1' }]
			},
			progress: { type: 'indeterminate', message: 'Complete' },
			actions: {}
		};

		expect(getNotificationPreview(notification)).toMatchObject({
			contextLabel: 'Calendar',
			actionLabel: 'Review calendar analysis',
			targetLabel: 'Past 7 days · Next 3 days',
			preview: '1 suggestion from 14 events.'
		});
	});
});
