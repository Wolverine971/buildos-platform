// apps/web/src/lib/services/__tests__/time-block-notification.bridge.test.ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { TimeBlockSuggestion, TimeBlockWithProject } from '@buildos/shared-types';
import {
	initTimeBlockNotificationBridge,
	destroyTimeBlockNotificationBridge
} from '../time-block-notification.bridge';
import { notificationStore } from '$lib/stores/notification.store';
import { timeBlocksStore } from '$lib/stores/timeBlocksStore';
import type { TimeBlockNotification } from '$lib/types/notification.types';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

declare const global: typeof globalThis & { fetch: ReturnType<typeof vi.fn> };

const createSessionStorageMock = () => {
	const storage = new Map<string, string>();
	return {
		getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
		setItem: (key: string, value: string) => {
			storage.set(key, String(value));
		},
		removeItem: (key: string) => storage.delete(key),
		clear: () => storage.clear()
	};
};

const nowIso = '2025-10-15T08:00:00.000Z';

const createPendingBlock = (id: string, overrides: Partial<TimeBlockWithProject> = {}) =>
	({
		id,
		user_id: 'user-123',
		block_type: 'project',
		project_id: 'proj-1',
		start_time: '2025-10-15T09:00:00.000Z',
		end_time: '2025-10-15T10:00:00.000Z',
		duration_minutes: 60,
		timezone: 'America/New_York',
		calendar_event_id: `cal-${id}`,
		calendar_event_link: `https://calendar.google.com/event?eid=${id}`,
		sync_status: 'synced',
		sync_source: 'app',
		last_synced_at: nowIso,
		ai_suggestions: null,
		suggestions_summary: null,
		suggestions_generated_at: null,
		suggestions_model: null,
		suggestions_state: { status: 'pending', startedAt: nowIso },
		created_at: nowIso,
		updated_at: nowIso,
		project: {
			id: 'proj-1',
			name: 'Priority Project',
			calendar_color_id: '5'
		},
		...overrides
	}) as TimeBlockWithProject;

const createCompletedBlock = (
	id: string,
	suggestions: TimeBlockSuggestion[] = []
): TimeBlockWithProject =>
	createPendingBlock(id, {
		ai_suggestions: suggestions,
		suggestions_summary: suggestions.length > 0 ? 'Auto summary' : null,
		suggestions_generated_at: nowIso,
		suggestions_model: 'test-model',
		suggestions_state: {
			status: 'completed',
			startedAt: nowIso,
			completedAt: nowIso
		}
	});

const flushMicrotasks = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

let originalWindow: typeof window | undefined;
let storageMock: ReturnType<typeof createSessionStorageMock>;
let minimizeSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
	vi.useFakeTimers();
	storageMock = createSessionStorageMock();
	originalWindow = (globalThis as unknown as { window?: typeof window }).window;
	(globalThis as any).sessionStorage = storageMock;
	(globalThis as any).window = {
		setTimeout: global.setTimeout,
		clearTimeout: global.clearTimeout,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		sessionStorage: storageMock,
		open: vi.fn()
	};
	global.fetch = vi.fn();
	notificationStore.clear();
	timeBlocksStore.reset();
	destroyTimeBlockNotificationBridge();
});

afterEach(() => {
	minimizeSpy?.mockRestore();
	destroyTimeBlockNotificationBridge();
	notificationStore.clear();
	timeBlocksStore.reset();
	vi.useRealTimers();
	vi.restoreAllMocks();
	if (originalWindow) {
		(globalThis as any).window = originalWindow;
	} else {
		delete (globalThis as any).window;
	}
	delete (globalThis as any).sessionStorage;
});

describe('time-block-notification.bridge', () => {
	it('creates a processing notification and updates to success once suggestions finish', async () => {
		const blockId = 'block-success';
		const completedBlock = createCompletedBlock(blockId, [
			{
				title: 'Outline investor memo',
				reason: 'Highest leverage task for upcoming review.'
			}
		]);

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: {
					time_block: completedBlock
				}
			})
		});

		initTimeBlockNotificationBridge();

		timeBlocksStore.upsertBlock(createPendingBlock(blockId));

		let state = get(notificationStore);
		const [notificationId] = state.notifications.keys();
		expect(notificationId).toBeDefined();

		let notification = state.notifications.get(notificationId!) as
			| TimeBlockNotification
			| undefined;
		expect(notification?.status).toBe('processing');
		expect(global.fetch).toHaveBeenCalledTimes(1);

		await flushMicrotasks();

		state = get(notificationStore);
		notification = state.notifications.get(notificationId!) as
			| TimeBlockNotification
			| undefined;
		expect(notification?.status).toBe('success');
		expect(notification?.data.suggestions?.length).toBe(1);
		expect(notification?.data.suggestionsSummary).toBe('Auto summary');

		minimizeSpy = vi.spyOn(notificationStore, 'minimize');
		vi.advanceTimersByTime(3000);
		expect(minimizeSpy).toHaveBeenCalledWith(notificationId);
	});

	it('limits concurrent generations to three and processes queued blocks afterwards', async () => {
		const pendingFetches = new Map<
			string,
			{
				resolve: (value: {
					ok: boolean;
					json: () => Promise<{ data: { time_block: TimeBlockWithProject } }>;
				}) => void;
			}
		>();

		const createDeferred = () => {
			let resolver:
				| ((value: {
						ok: boolean;
						json: () => Promise<{ data: { time_block: TimeBlockWithProject } }>;
				  }) => void)
				| null = null;
			const promise = new Promise<{
				ok: boolean;
				json: () => Promise<{ data: { time_block: TimeBlockWithProject } }>;
			}>((resolve) => {
				resolver = resolve;
			});

			return {
				promise,
				resolve: (value: {
					ok: boolean;
					json: () => Promise<{ data: { time_block: TimeBlockWithProject } }>;
				}) => resolver?.(value)
			};
		};

		global.fetch = vi.fn().mockImplementation((_, init?: RequestInit) => {
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
			const timeBlockId: string = body.time_block_id;
			const deferred = createDeferred();
			pendingFetches.set(timeBlockId, deferred);
			return deferred.promise;
		});

		initTimeBlockNotificationBridge();

		const blockIds = ['block-1', 'block-2', 'block-3', 'block-4', 'block-5'];
		blockIds.forEach((id) => {
			timeBlocksStore.upsertBlock(createPendingBlock(id));
		});

		expect(global.fetch).toHaveBeenCalledTimes(3);

		const resolveFetch = async (id: string) => {
			const deferred = pendingFetches.get(id);
			expect(deferred).toBeDefined();
			deferred?.resolve({
				ok: true,
				json: async () => ({
					data: {
						time_block: createCompletedBlock(id)
					}
				})
			});
			await flushMicrotasks();
		};

		await resolveFetch('block-1');
		expect(global.fetch).toHaveBeenCalledTimes(4);

		await resolveFetch('block-2');
		expect(global.fetch).toHaveBeenCalledTimes(5);

		await resolveFetch('block-3');
		await resolveFetch('block-4');
		await resolveFetch('block-5');
		expect(global.fetch).toHaveBeenCalledTimes(5);

		const finalState = get(notificationStore);
		const completedStatuses = Array.from(finalState.notifications.values()).map(
			(notification) => notification.status
		);
		expect(new Set(completedStatuses)).toContain('success');
	});

	it('exposes retry action that resets suggestions state and retriggers generation after failure', async () => {
		const blockId = 'block-retry';
		global.fetch = vi
			.fn()
			.mockImplementationOnce(async () => ({
				ok: false,
				json: async () => ({ error: 'LLM timeout' })
			}))
			.mockImplementationOnce(async () => ({
				ok: true,
				json: async () => ({
					data: {
						time_block: createCompletedBlock(blockId, [
							{
								title: 'Retry generated task',
								reason: 'Second attempt succeeded.'
							}
						])
					}
				})
			}));

		initTimeBlockNotificationBridge();
		timeBlocksStore.upsertBlock(createPendingBlock(blockId));

		await flushMicrotasks();

		let state = get(notificationStore);
		const [notificationId] = state.notifications.keys();
		const notification = state.notifications.get(notificationId!) as
			| TimeBlockNotification
			| undefined;
		expect(notification?.status).toBe('warning');
		expect(notification?.data.suggestionsState?.status).toBe('failed');
		expect(global.fetch).toHaveBeenCalledTimes(1);

		notification?.actions.retry?.();

		const blocksState = get(timeBlocksStore);
		const retriedBlock = blocksState.blocks.find((block) => block.id === blockId);
		expect(retriedBlock?.suggestions_state?.status).toBe('pending');
		expect(global.fetch).toHaveBeenCalledTimes(2);

		await flushMicrotasks();

		state = get(notificationStore);
		const retriedNotification = state.notifications.get(notificationId!) as
			| TimeBlockNotification
			| undefined;
		expect(retriedNotification?.status).toBe('success');
		expect(retriedNotification?.data.suggestions?.length).toBe(1);
	});
});
