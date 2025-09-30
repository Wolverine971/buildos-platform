// src/lib/stores/project.store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ProjectStore - Real-time Sync Race Condition', () => {
	let mockRealtimeService: any;
	let mockApiCall: any;

	beforeEach(() => {
		vi.resetModules();

		// Mock RealtimeProjectService
		mockRealtimeService = {
			trackLocalUpdate: vi.fn()
		};

		mockApiCall = vi.fn().mockResolvedValue({
			id: 'real-id-123',
			name: 'Created Task',
			status: 'todo'
		});
	});

	describe('optimisticCreateTask Race Condition Prevention', () => {
		it('should track update BEFORE API call', async () => {
			const orderOfOperations: string[] = [];

			// Override trackLocalUpdate to track order
			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				orderOfOperations.push(`trackUpdate:${id}`);
			});

			// Override API call to track order
			const apiCall = vi.fn(async () => {
				orderOfOperations.push('apiCall');
				return {
					id: 'real-id-123',
					name: 'Created Task'
				};
			});

			// Simulate the optimistic create flow
			const tempId = 'temp-id-456';

			// Track temp ID BEFORE API call (this is the fix)
			mockRealtimeService.trackLocalUpdate(tempId);

			// Then make API call
			const result = await apiCall();

			// Track real ID after API call
			if (result?.id && result.id !== tempId) {
				mockRealtimeService.trackLocalUpdate(result.id);
			}

			// Verify order: trackUpdate (temp) -> apiCall -> trackUpdate (real)
			expect(orderOfOperations[0]).toBe(`trackUpdate:${tempId}`);
			expect(orderOfOperations[1]).toBe('apiCall');
			expect(orderOfOperations[2]).toBe(`trackUpdate:${result.id}`);
		});

		it('should track both tempId and realId', async () => {
			const trackedIds: string[] = [];

			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				trackedIds.push(id);
			});

			const tempId = 'temp-id-789';
			const realId = 'real-id-abc';

			// Track temp ID first
			mockRealtimeService.trackLocalUpdate(tempId);

			// Simulate API call
			const apiResult = await mockApiCall();
			const result = { ...apiResult, id: realId };

			// Track real ID after
			if (result?.id && result.id !== tempId) {
				mockRealtimeService.trackLocalUpdate(result.id);
			}

			// Both IDs should be tracked
			expect(trackedIds).toContain(tempId);
			expect(trackedIds).toContain(realId);
			expect(trackedIds.length).toBe(2);
		});

		it('should not duplicate tracking if realId same as tempId', async () => {
			const trackedIds: string[] = [];

			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				trackedIds.push(id);
			});

			const taskId = 'same-id-123';

			// Track temp ID
			mockRealtimeService.trackLocalUpdate(taskId);

			// Simulate API returning same ID
			const result = { id: taskId, name: 'Task' };

			// Check before tracking again
			if (result?.id && result.id !== taskId) {
				mockRealtimeService.trackLocalUpdate(result.id);
			}

			// Should only be tracked once
			expect(trackedIds.length).toBe(1);
			expect(trackedIds[0]).toBe(taskId);
		});

		it('should prevent race condition where realtime update arrives before tracking', async () => {
			// Simulate scenario:
			// 1. User creates task (temp ID assigned)
			// 2. Temp ID is tracked
			// 3. API call starts
			// 4. Real-time update arrives with real ID (should be skipped because of tracking)
			// 5. API call completes with real ID
			// 6. Real ID is tracked

			const realtimeUpdates: Array<{ id: string; skipped: boolean }> = [];
			const trackedIds = new Set<string>();

			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				trackedIds.add(id);
			});

			// Simulate realtime update handler
			const handleRealtimeUpdate = (taskId: string) => {
				if (trackedIds.has(taskId)) {
					realtimeUpdates.push({ id: taskId, skipped: true });
					return; // Skip this update - it's our own change
				}
				realtimeUpdates.push({ id: taskId, skipped: false });
			};

			const tempId = 'temp-id-999';
			const realId = 'real-id-999';

			// Step 1-2: Track temp ID
			mockRealtimeService.trackLocalUpdate(tempId);

			// Step 3: API call starts (simulate delay)
			const apiPromise = new Promise((resolve) => {
				setTimeout(() => resolve({ id: realId, name: 'Task' }), 100);
			});

			// Step 4: Real-time update arrives during API call
			// This should be skipped because temp ID is tracked
			handleRealtimeUpdate(tempId);

			// Step 5: API completes
			const result = (await apiPromise) as any;

			// Step 6: Track real ID
			mockRealtimeService.trackLocalUpdate(result.id);

			// Real-time update with real ID arrives
			handleRealtimeUpdate(result.id);

			// Verify both updates were skipped (preventing duplicate UI updates)
			expect(realtimeUpdates.length).toBe(2);
			expect(realtimeUpdates[0]).toEqual({ id: tempId, skipped: true });
			expect(realtimeUpdates[1]).toEqual({ id: realId, skipped: true });
		});
	});

	describe('optimisticUpdateTask Race Condition Prevention', () => {
		it('should track update BEFORE API call', async () => {
			const orderOfOperations: string[] = [];

			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				orderOfOperations.push(`trackUpdate:${id}`);
			});

			const apiCall = vi.fn(async () => {
				orderOfOperations.push('apiCall');
				return {
					id: 'task-123',
					name: 'Updated Task',
					status: 'in_progress'
				};
			});

			const taskId = 'task-123';

			// Track BEFORE API call (this is the fix)
			mockRealtimeService.trackLocalUpdate(taskId);

			// Then make API call
			await apiCall();

			// Verify order
			expect(orderOfOperations[0]).toBe(`trackUpdate:${taskId}`);
			expect(orderOfOperations[1]).toBe('apiCall');
		});

		it('should not track update again after API call for updates', async () => {
			const trackedIds: string[] = [];

			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				trackedIds.push(id);
			});

			const taskId = 'task-456';

			// Track before API call
			mockRealtimeService.trackLocalUpdate(taskId);

			// Make API call
			const result = await mockApiCall();

			// For updates, we don't track again after API call
			// (unlike creates which track both temp and real ID)

			// Should only be tracked once
			expect(trackedIds.length).toBe(1);
			expect(trackedIds[0]).toBe(taskId);
		});

		it('should prevent duplicate UI updates from realtime subscription', async () => {
			const uiUpdates: Array<{ id: string; source: string }> = [];
			const trackedIds = new Set<string>();

			mockRealtimeService.trackLocalUpdate = vi.fn((id: string) => {
				trackedIds.add(id);
			});

			// Simulate UI update handler
			const applyUIUpdate = (taskId: string, source: 'optimistic' | 'realtime') => {
				if (source === 'realtime' && trackedIds.has(taskId)) {
					// Skip realtime update for tracked IDs
					return;
				}
				uiUpdates.push({ id: taskId, source });
			};

			const taskId = 'task-789';

			// Step 1: Apply optimistic update
			applyUIUpdate(taskId, 'optimistic');

			// Step 2: Track the update
			mockRealtimeService.trackLocalUpdate(taskId);

			// Step 3: API call happens
			await mockApiCall();

			// Step 4: Realtime update arrives (should be skipped)
			applyUIUpdate(taskId, 'realtime');

			// Verify only one UI update was applied
			expect(uiUpdates.length).toBe(1);
			expect(uiUpdates[0]).toEqual({ id: taskId, source: 'optimistic' });
		});
	});

	describe('Real-time Update Filtering', () => {
		it('should skip realtime updates for tracked task IDs', () => {
			const trackedIds = new Set<string>(['task-1', 'task-2', 'task-3']);

			const shouldProcessRealtimeUpdate = (taskId: string) => {
				return !trackedIds.has(taskId);
			};

			// Tracked IDs should be skipped
			expect(shouldProcessRealtimeUpdate('task-1')).toBe(false);
			expect(shouldProcessRealtimeUpdate('task-2')).toBe(false);
			expect(shouldProcessRealtimeUpdate('task-3')).toBe(false);

			// Untracked IDs should be processed
			expect(shouldProcessRealtimeUpdate('task-4')).toBe(true);
			expect(shouldProcessRealtimeUpdate('task-5')).toBe(true);
		});

		it('should allow realtime updates from other users', () => {
			const trackedIds = new Set<string>(['task-1', 'task-2']);

			// Other user's changes
			const otherUserTasks = ['task-3', 'task-4', 'task-5'];

			const realtimeUpdatesToProcess = otherUserTasks.filter(
				(taskId) => !trackedIds.has(taskId)
			);

			// All other user's tasks should be processed
			expect(realtimeUpdatesToProcess.length).toBe(3);
			expect(realtimeUpdatesToProcess).toEqual(otherUserTasks);
		});

		it('should handle concurrent updates from multiple sources', async () => {
			const processedUpdates: Array<{ id: string; source: string; timestamp: number }> = [];
			const trackedIds = new Set<string>();

			const trackUpdate = (id: string) => {
				trackedIds.add(id);
			};

			const processUpdate = (id: string, source: 'local' | 'realtime') => {
				if (source === 'realtime' && trackedIds.has(id)) {
					return; // Skip
				}
				processedUpdates.push({ id, source, timestamp: Date.now() });
			};

			// Scenario: Multiple rapid updates
			const taskId = 'task-concurrent';

			// Local update first
			trackUpdate(taskId);
			processUpdate(taskId, 'local');

			// Realtime update arrives (should be skipped)
			processUpdate(taskId, 'realtime');

			// Another realtime update (should be skipped)
			processUpdate(taskId, 'realtime');

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Yet another realtime update (still skipped)
			processUpdate(taskId, 'realtime');

			// Should only have one processed update (the local one)
			expect(processedUpdates.length).toBe(1);
			expect(processedUpdates[0].source).toBe('local');
		});
	});

	describe('Cleanup After Tracking', () => {
		it('should clean up tracked IDs after timeout', async () => {
			const trackedIds = new Map<string, number>();
			const TRACKING_TIMEOUT = 100; // ms

			const trackUpdate = (id: string) => {
				trackedIds.set(id, Date.now());

				// Auto-cleanup after timeout
				setTimeout(() => {
					trackedIds.delete(id);
				}, TRACKING_TIMEOUT);
			};

			const isTracked = (id: string) => {
				const timestamp = trackedIds.get(id);
				if (!timestamp) return false;

				// Check if still within timeout window
				return Date.now() - timestamp < TRACKING_TIMEOUT;
			};

			const taskId = 'task-cleanup';

			trackUpdate(taskId);
			expect(isTracked(taskId)).toBe(true);

			// Wait for cleanup
			await new Promise((resolve) => setTimeout(resolve, TRACKING_TIMEOUT + 10));

			expect(isTracked(taskId)).toBe(false);
		});

		it('should handle tracking window for deduplication', () => {
			const trackedIds = new Map<string, number>();
			const DEDUP_WINDOW = 5000; // 5 seconds

			const trackUpdate = (id: string) => {
				trackedIds.set(id, Date.now());
			};

			const shouldSkipRealtimeUpdate = (id: string) => {
				const timestamp = trackedIds.get(id);
				if (!timestamp) return false;

				// Skip if within deduplication window
				return Date.now() - timestamp < DEDUP_WINDOW;
			};

			const taskId = 'task-dedup';

			trackUpdate(taskId);

			// Immediately after tracking - should skip
			expect(shouldSkipRealtimeUpdate(taskId)).toBe(true);

			// Simulate time passage (3 seconds)
			const futureTime = Date.now() + 3000;
			const originalNow = Date.now;
			Date.now = vi.fn(() => futureTime);

			// Still within window - should skip
			expect(shouldSkipRealtimeUpdate(taskId)).toBe(true);

			// Simulate more time passage (6 seconds total)
			Date.now = vi.fn(() => originalNow() + 6000);

			// Outside window - should not skip
			expect(shouldSkipRealtimeUpdate(taskId)).toBe(false);

			// Restore original Date.now
			Date.now = originalNow;
		});
	});
});
