// apps/web/src/lib/components/notifications/types/notification-modal-accessibility.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import type {
	CalendarAnalysisNotification,
	ProjectSynthesisNotification,
	TimeBlockNotification
} from '$lib/types/notification.types';
import CalendarAnalysisModalContent from './calendar-analysis/CalendarAnalysisModalContent.svelte';
import ProjectSynthesisModalContent from './project-synthesis/ProjectSynthesisModalContent.svelte';
import TimeBlockModalContent from './time-block/TimeBlockModalContent.svelte';

const originalAnimate = Element.prototype.animate;

function baseNotification() {
	return {
		id: 'notification-1',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: false,
		isPersistent: false,
		autoCloseMs: null
	};
}

describe('legacy notification modal accessibility', () => {
	beforeEach(() => {
		Element.prototype.animate = vi.fn(() => ({
			cancel: vi.fn(),
			finished: Promise.resolve(),
			playState: 'finished'
		})) as unknown as typeof Element.prototype.animate;
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
			window.setTimeout(() => callback(0), 0)
		);
		vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
		vi.stubGlobal('scrollTo', vi.fn());
	});

	afterEach(() => {
		cleanup();
		if (originalAnimate) Element.prototype.animate = originalAnimate;
		else Reflect.deleteProperty(Element.prototype, 'animate');
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('names the calendar-analysis dialog when its custom header is rendered', async () => {
		const notification: CalendarAnalysisNotification = {
			...baseNotification(),
			type: 'calendar-analysis',
			status: 'processing',
			data: { daysBack: 7, daysForward: 14 },
			progress: { type: 'indeterminate', message: 'Reviewing calendar events…' },
			actions: {}
		};

		render(CalendarAnalysisModalContent, { props: { notification } });

		const dialog = screen.getByRole('dialog', { name: 'Analyzing calendar' });
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
	});

	it('names the time-block dialog without referencing a suppressed default title', async () => {
		const notification: TimeBlockNotification = {
			...baseNotification(),
			type: 'time-block',
			status: 'idle',
			data: {
				timeBlockId: 'time-block-1',
				blockType: 'project',
				projectName: 'Launch plan',
				startTime: '2026-07-15T13:00:00.000Z',
				endTime: '2026-07-15T14:00:00.000Z',
				durationMinutes: 60
			},
			progress: { type: 'indeterminate' },
			actions: {}
		};

		render(TimeBlockModalContent, { props: { notification } });

		const dialog = screen.getByRole('dialog', { name: 'Time block suggestions' });
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
	});

	it('shows time-block processing status once instead of duplicating it in the body', async () => {
		const notification: TimeBlockNotification = {
			...baseNotification(),
			type: 'time-block',
			status: 'processing',
			data: {
				timeBlockId: 'time-block-2',
				blockType: 'build',
				startTime: '2026-07-15T13:00:00.000Z',
				endTime: '2026-07-15T14:00:00.000Z',
				durationMinutes: 60,
				suggestionsState: {
					status: 'generating',
					progress: 'Prioritizing suggested tasks…'
				}
			},
			progress: { type: 'indeterminate' },
			actions: {}
		};

		render(TimeBlockModalContent, { props: { notification } });

		const dialog = screen.getByRole('dialog', { name: 'Time block suggestions' });
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
		expect(screen.getAllByText('Prioritizing suggested tasks…')).toHaveLength(1);
	});

	it('shows a terminal failure heading when project synthesis fails', async () => {
		const options = { selectedModules: ['task_synthesis'], config: {} };
		const notification: ProjectSynthesisNotification = {
			...baseNotification(),
			type: 'project-synthesis',
			status: 'error',
			data: {
				projectId: 'project-1',
				projectName: 'Launch plan',
				options,
				requestPayload: { regenerate: false, includeDeleted: false, options },
				taskCount: 12,
				selectedModules: ['task_synthesis'],
				error: 'The synthesis request failed.'
			},
			progress: { type: 'indeterminate' },
			actions: {}
		};

		render(ProjectSynthesisModalContent, { props: { notification } });

		const dialog = screen.getByRole('dialog', { name: 'Project Synthesis — Launch plan' });
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
		expect(screen.getByRole('heading', { name: 'Synthesis failed' })).toBeInTheDocument();
		expect(screen.getByText('12 tasks in this run')).toBeInTheDocument();
	});
});
