// apps/web/src/lib/services/__tests__/phase-generation-notification.bridge.test.ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: false, dev: false }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import {
	startPhaseGeneration,
	cleanupPhaseGenerationNotificationBridge,
	initPhaseGenerationNotificationBridge
} from '../phase-generation-notification.bridge';
import { notificationStore } from '$lib/stores/notification.store';
import { toastService } from '$lib/stores/toast.store';
import { projectStoreV2 } from '$lib/stores/project.store';
import type { PhaseGenerationNotification } from '$lib/types/notification.types';

const basePayload = {
	selected_statuses: ['backlog'],
	scheduling_method: 'phases_only' as const,
	project_start_date: '2024-01-01',
	project_end_date: '2024-01-31',
	project_dates_changed: false,
	user_instructions: 'Keep things tight'
};

const baseOptions = {
	projectId: 'project-123',
	projectName: 'Launch Website',
	isRegeneration: false,
	taskCount: 5,
	selectedStatuses: ['backlog'],
	requestPayload: basePayload
};

declare const global: typeof globalThis & { fetch: ReturnType<typeof vi.fn> };

let successSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	vi.restoreAllMocks();
	notificationStore.clear();
	cleanupPhaseGenerationNotificationBridge();
	global.fetch = vi.fn();
	successSpy = vi.spyOn(toastService, 'success').mockReturnValue('toast-success');
	errorSpy = vi.spyOn(toastService, 'error').mockReturnValue('toast-error');
	projectStoreV2.reset();
});

afterEach(() => {
	notificationStore.clear();
	cleanupPhaseGenerationNotificationBridge();
	vi.restoreAllMocks();
});

describe('phase-generation-notification.bridge', () => {
	it('creates a processing notification with expected metadata', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: { phases: [], backlogTasks: [] } })
		});

		const { notificationId } = await startPhaseGeneration(baseOptions);
		const initialState = get(notificationStore);
		const initialNotification = initialState.notifications.get(notificationId) as
			| PhaseGenerationNotification
			| undefined;

		expect(initialNotification).toBeDefined();
		expect(initialNotification?.type).toBe('phase-generation');
		expect(initialNotification?.status).toBe('processing');

		await flushAsync();
		const state = get(notificationStore);
		const notification = state.notifications.get(notificationId) as
			| PhaseGenerationNotification
			| undefined;
		expect(notification?.data.projectId).toBe(baseOptions.projectId);
		expect(notification?.data.selectedStatuses).toEqual(['backlog']);
		expect(notification?.data.requestPayload).toEqual(basePayload);
		expect(global.fetch).toHaveBeenCalledWith(
			`/api/projects/${baseOptions.projectId}/phases/generate`,
			expect.objectContaining({
				method: 'POST'
			})
		);
	});

	it('marks notification as success and stores results when generation completes', async () => {
		const phases = [{ id: 'phase-1', name: 'Planning' }];
		const backlogTasks = [{ id: 'task-1', title: 'Draft brief' }];
		const setPhasesSpy = vi.spyOn(projectStoreV2, 'setPhases');

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: {
					phases,
					backlogTasks,
					calendarEventCount: 2,
					summaryMarkdown: '<p>Done</p>'
				}
			})
		});

		const { notificationId } = await startPhaseGeneration(baseOptions);
		await flushAsync();
		const state = get(notificationStore);
		const notification = state.notifications.get(notificationId) as
			| PhaseGenerationNotification
			| undefined;
		expect(notification?.status).toBe('success');

		const finalNotification = get(notificationStore).notifications.get(
			notificationId
		) as PhaseGenerationNotification;

		expect(setPhasesSpy).toHaveBeenCalledWith(phases);
		expect(finalNotification.data.result?.phases).toEqual(phases);
		expect(finalNotification.data.result?.backlogTasks).toEqual(backlogTasks);
		expect(finalNotification.data.result?.calendarEventCount).toBe(2);
		expect(finalNotification.status).toBe('success');
		expect(successSpy).toHaveBeenCalled();
	});

	it('marks notification as error when generation fails', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({ error: 'Generation failed' })
		});

		const { notificationId } = await startPhaseGeneration(baseOptions);
		await flushAsync();
		const state = get(notificationStore);
		const notification = state.notifications.get(notificationId) as
			| PhaseGenerationNotification
			| undefined;
		expect(notification?.status).toBe('error');

		const finalNotification = get(notificationStore).notifications.get(
			notificationId
		) as PhaseGenerationNotification;
		expect(finalNotification.data.error).toBe('Generation failed');
		expect(errorSpy).toHaveBeenCalledWith('Generation failed');
	});

	it('replays pending notifications when bridge initializes', async () => {
		const steps = [
			{ key: 'queue', name: 'Queue', status: 'processing' as const },
			{ key: 'finalize', name: 'Finalize', status: 'pending' as const }
		];

		notificationStore.clear();
		cleanupPhaseGenerationNotificationBridge();

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: { phases: [], backlogTasks: [] } })
		});

		notificationStore.add({
			type: 'phase-generation',
			status: 'processing',
			isMinimized: true,
			isPersistent: true,
			data: {
				projectId: baseOptions.projectId,
				projectName: baseOptions.projectName,
				isRegeneration: false,
				strategy: 'phases-only',
				taskCount: baseOptions.taskCount,
				selectedStatuses: baseOptions.selectedStatuses ?? [],
				requestPayload: basePayload,
				telemetry: { startedAt: Date.now(), fallbackMode: 'timer' }
			},
			progress: {
				type: 'steps',
				currentStep: 0,
				totalSteps: steps.length,
				steps
			},
			actions: {}
		} as PhaseGenerationNotification);

		initPhaseGenerationNotificationBridge();
		await flushAsync();

		expect(global.fetch).toHaveBeenCalled();
	});
});
