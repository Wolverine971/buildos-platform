// apps/web/src/lib/services/time-block-notification.bridge.ts
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import type { TimeBlockSuggestionsState, TimeBlockWithProject } from '@buildos/shared-types';
import { notificationStore } from '$lib/stores/notification.store';
import { timeBlocksStore } from '$lib/stores/timeBlocksStore';
import type { TimeBlockNotification } from '$lib/types/notification.types';

const MAX_CONCURRENT_SUGGESTIONS = 3;

const activeTimeBlockNotifications = new Map<string, string>();
const lastSyncedHashes = new Map<string, string>();
const autoMinimizeTimers = new Map<string, number>();
const activeGenerations = new Set<string>();
const generationQueue: string[] = [];

let unsubscribe: (() => void) | null = null;
let initialized = false;

export function initTimeBlockNotificationBridge(): void {
	if (!browser || initialized) {
		return;
	}

	const currentStore = get(notificationStore);
	for (const notification of currentStore.notifications.values()) {
		if (notification.type !== 'time-block') continue;
		const timeBlockId = notification.data.timeBlockId;
		if (!timeBlockId) continue;
		activeTimeBlockNotifications.set(timeBlockId, notification.id);
		ensureTimeBlockNotificationActions(timeBlockId, notification.id);
	}

	unsubscribe = timeBlocksStore.subscribe((state) => {
		const blocks = state?.blocks ?? [];
		for (const block of blocks) {
			syncTimeBlockToNotification(block);
		}
		cleanupStaleTracking(blocks);
	});

	initialized = true;
	console.log('[TimeBlockNotificationBridge] Initialized');
}

export function destroyTimeBlockNotificationBridge(): void {
	if (!initialized) return;

	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}

	for (const timer of autoMinimizeTimers.values()) {
		if (typeof window !== 'undefined') {
			window.clearTimeout(timer);
		}
	}
	autoMinimizeTimers.clear();

	activeTimeBlockNotifications.clear();
	lastSyncedHashes.clear();
	activeGenerations.clear();
	generationQueue.length = 0;

	initialized = false;
	console.log('[TimeBlockNotificationBridge] Destroyed');
}

function syncTimeBlockToNotification(block: TimeBlockWithProject): void {
	const hash = computeBlockHash(block);
	const previous = lastSyncedHashes.get(block.id);
	if (previous === hash) {
		return;
	}
	lastSyncedHashes.set(block.id, hash);

	const suggestionsState = block.suggestions_state;
	const status = suggestionsState?.status ?? 'pending';

	let notificationId = activeTimeBlockNotifications.get(block.id);

	if ((status === 'pending' || status === 'generating') && !notificationId) {
		notificationId = createTimeBlockNotification(block);
		activeTimeBlockNotifications.set(block.id, notificationId);
	}

	if (notificationId) {
		if (!ensureNotificationExists(notificationId, block.id)) {
			notificationId = undefined;
		} else {
			updateTimeBlockNotification(notificationId, block);
		}
	}

	if (status === 'pending') {
		queueSuggestionGeneration(block.id);
	} else if (status === 'completed' || status === 'failed') {
		finishGeneration(block.id);
		processGenerationQueue();
	}
}

function computeBlockHash(block: TimeBlockWithProject): string {
	const state = block.suggestions_state;
	const status = state?.status ?? 'none';
	const error = state?.error ?? '';
	const suggestionCount = block.ai_suggestions?.length ?? 0;
	const updatedAt = block.updated_at ?? '';
	return `${status}|${error}|${suggestionCount}|${updatedAt}`;
}

function ensureNotificationExists(notificationId: string, blockId: string): boolean {
	const storeState = get(notificationStore);
	if (!storeState.notifications.has(notificationId)) {
		activeTimeBlockNotifications.delete(blockId);
		clearAutoMinimizeTimer(notificationId);
		return false;
	}
	return true;
}

function createTimeBlockNotification(block: TimeBlockWithProject): string {
	const notification: Omit<TimeBlockNotification, 'id' | 'createdAt' | 'updatedAt'> = {
		type: 'time-block',
		status: 'processing',
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			timeBlockId: block.id,
			blockType: block.block_type,
			projectId: block.project_id,
			projectName: block.project?.name ?? null,
			startTime: block.start_time,
			endTime: block.end_time,
			durationMinutes: block.duration_minutes,
			calendarEventId: block.calendar_event_id,
			calendarEventLink: block.calendar_event_link,
			suggestionsState: block.suggestions_state ?? { status: 'pending' }
		},
		progress: {
			type: 'percentage',
			percentage: 0,
			message: 'Generating AI suggestions...'
		},
		actions: buildTimeBlockNotificationActions(block.id)
	};

	const notificationId = notificationStore.add(notification);
	console.log('[TimeBlockNotificationBridge] Created notification:', {
		timeBlockId: block.id,
		notificationId
	});

	return notificationId;
}

function updateTimeBlockNotification(notificationId: string, block: TimeBlockWithProject): void {
	const suggestionsState = block.suggestions_state;

	let status: TimeBlockNotification['status'] = 'processing';
	if (suggestionsState?.status === 'completed') {
		status = 'success';
	} else if (suggestionsState?.status === 'failed') {
		status = 'warning';
	}

	let progress: TimeBlockNotification['progress'];
	if (suggestionsState?.status === 'generating') {
		progress = {
			type: 'percentage',
			percentage: 50,
			message: suggestionsState.progress ?? 'Analyzing tasks...'
		};
	} else if (suggestionsState?.status === 'completed') {
		progress = {
			type: 'percentage',
			percentage: 100,
			message: 'Suggestions ready!'
		};
	} else if (suggestionsState?.status === 'failed') {
		progress = {
			type: 'percentage',
			percentage: 100,
			message: suggestionsState.error ?? 'Suggestion generation failed'
		};
	} else {
		progress = {
			type: 'percentage',
			percentage: 0,
			message: 'Starting suggestion generation...'
		};
	}

	notificationStore.update(notificationId, {
		status,
		data: {
			timeBlockId: block.id,
			blockType: block.block_type,
			projectId: block.project_id,
			projectName: block.project?.name ?? null,
			startTime: block.start_time,
			endTime: block.end_time,
			durationMinutes: block.duration_minutes,
			calendarEventId: block.calendar_event_id,
			calendarEventLink: block.calendar_event_link,
			suggestionsState: block.suggestions_state,
			suggestions: block.ai_suggestions ?? null,
			suggestionsSummary: block.suggestions_summary ?? null,
			suggestionsModel: block.suggestions_model ?? null
		},
		progress,
		actions: buildTimeBlockNotificationActions(block.id)
	});

	if (status === 'success') {
		startAutoMinimizeTimer(notificationId, block.id);
	} else {
		clearAutoMinimizeTimer(notificationId);
	}
}

function startAutoMinimizeTimer(notificationId: string, blockId: string): void {
	clearAutoMinimizeTimer(notificationId);

	if (typeof window === 'undefined') return;

	const timer = window.setTimeout(() => {
		const current = get(notificationStore);
		if (current.notifications.has(notificationId)) {
			notificationStore.minimize(notificationId);
		}
		autoMinimizeTimers.delete(notificationId);
	}, 3000);

	autoMinimizeTimers.set(notificationId, timer);
}

function clearAutoMinimizeTimer(notificationId: string): void {
	if (!autoMinimizeTimers.has(notificationId)) return;
	if (typeof window !== 'undefined') {
		window.clearTimeout(autoMinimizeTimers.get(notificationId));
	}
	autoMinimizeTimers.delete(notificationId);
}

function queueSuggestionGeneration(timeBlockId: string): void {
	if (activeGenerations.has(timeBlockId)) return;
	if (generationQueue.includes(timeBlockId)) return;

	if (activeGenerations.size < MAX_CONCURRENT_SUGGESTIONS) {
		void startSuggestionGeneration(timeBlockId);
	} else {
		generationQueue.push(timeBlockId);
	}
}

async function startSuggestionGeneration(timeBlockId: string): Promise<void> {
	const state = get(timeBlocksStore);
	const block = state.blocks.find((item) => item.id === timeBlockId);
	if (!block) {
		finishGeneration(timeBlockId);
		processGenerationQueue();
		return;
	}

	activeGenerations.add(timeBlockId);

	const startedAt = block.suggestions_state?.startedAt ?? new Date().toISOString();

	updateSuggestionsState(timeBlockId, {
		status: 'generating',
		startedAt,
		progress: 'Analyzing tasks...'
	});

	try {
		const response = await fetch('/api/time-blocks/generate-suggestions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ time_block_id: timeBlockId })
		});

		if (!response.ok) {
			const errorPayload = await response.json().catch(() => ({}));
			const errorMessage =
				typeof errorPayload?.error === 'string'
					? errorPayload.error
					: 'Failed to generate time-block suggestions';

			updateSuggestionsState(timeBlockId, {
				status: 'failed',
				error: errorMessage,
				startedAt,
				completedAt: new Date().toISOString()
			});

			throw new Error(errorMessage);
		}

		const payload = await response.json().catch(() => ({}));
		const updatedBlock = payload?.data?.time_block;
		if (updatedBlock) {
			timeBlocksStore.upsertBlock(updatedBlock);
		}
	} catch (error) {
		console.error(
			'[TimeBlockNotificationBridge] Suggestion generation failed:',
			timeBlockId,
			error
		);
	} finally {
		finishGeneration(timeBlockId);
		processGenerationQueue();
	}
}

function updateSuggestionsState(timeBlockId: string, state: TimeBlockSuggestionsState): void {
	if (typeof timeBlocksStore.updateBlockSuggestionsState === 'function') {
		timeBlocksStore.updateBlockSuggestionsState(timeBlockId, state);
	}
}

function finishGeneration(timeBlockId: string): void {
	activeGenerations.delete(timeBlockId);

	const queueIndex = generationQueue.indexOf(timeBlockId);
	if (queueIndex >= 0) {
		generationQueue.splice(queueIndex, 1);
	}
}

function processGenerationQueue(): void {
	while (generationQueue.length > 0 && activeGenerations.size < MAX_CONCURRENT_SUGGESTIONS) {
		const nextId = generationQueue.shift();
		if (nextId) {
			void startSuggestionGeneration(nextId);
		}
	}
}

function buildTimeBlockNotificationActions(timeBlockId: string): TimeBlockNotification['actions'] {
	return {
		view: () => {
			const notificationId = activeTimeBlockNotifications.get(timeBlockId);
			if (notificationId) {
				notificationStore.expand(notificationId);
			}
		},
		dismiss: () => {
			const notificationId = activeTimeBlockNotifications.get(timeBlockId);
			if (notificationId) {
				notificationStore.remove(notificationId);
				clearAutoMinimizeTimer(notificationId);
			}
			activeTimeBlockNotifications.delete(timeBlockId);
			lastSyncedHashes.delete(timeBlockId);
		},
		retry: () => {
			const state = get(timeBlocksStore);
			const existingBlock = state.blocks.find((block) => block.id === timeBlockId);
			if (!existingBlock) return;

			const resetBlock: TimeBlockWithProject = {
				...existingBlock,
				ai_suggestions: null,
				suggestions_summary: null,
				suggestions_generated_at: null,
				suggestions_model: null,
				suggestions_state: {
					status: 'pending',
					startedAt: new Date().toISOString()
				}
			};

			timeBlocksStore.upsertBlock(resetBlock);
			queueSuggestionGeneration(timeBlockId);
		}
	};
}

function ensureTimeBlockNotificationActions(timeBlockId: string, notificationId: string): void {
	notificationStore.update(notificationId, {
		actions: buildTimeBlockNotificationActions(timeBlockId)
	});
}

function cleanupStaleTracking(blocks: TimeBlockWithProject[]): void {
	const activeIds = new Set(blocks.map((block) => block.id));

	for (const [blockId, notificationId] of activeTimeBlockNotifications.entries()) {
		if (!activeIds.has(blockId)) {
			activeTimeBlockNotifications.delete(blockId);
			lastSyncedHashes.delete(blockId);
			clearAutoMinimizeTimer(notificationId);
		}
	}

	for (const blockId of Array.from(lastSyncedHashes.keys())) {
		if (!activeIds.has(blockId)) {
			lastSyncedHashes.delete(blockId);
		}
	}
}

if (browser) {
	(window as any).__timeBlockNotificationBridge = {
		activeTimeBlockNotifications,
		lastSyncedHashes,
		activeGenerations,
		queue: generationQueue
	};
}
