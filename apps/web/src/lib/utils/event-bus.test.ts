// apps/web/src/lib/utils/event-bus.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus, PROJECT_EVENTS, type LocalUpdatePayload } from './event-bus';

describe('EventBus', () => {
	beforeEach(() => {
		// Clear all listeners before each test
		eventBus.clear();
	});

	afterEach(() => {
		// Clean up after each test
		eventBus.clear();
	});

	describe('Basic functionality', () => {
		it('should emit and receive events', () => {
			const callback = vi.fn();
			eventBus.on('test-event', callback);

			eventBus.emit('test-event', { data: 'test' });

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith({ data: 'test' });
		});

		it('should support multiple listeners for same event', () => {
			const callback1 = vi.fn();
			const callback2 = vi.fn();

			eventBus.on('test-event', callback1);
			eventBus.on('test-event', callback2);

			eventBus.emit('test-event', { data: 'test' });

			expect(callback1).toHaveBeenCalledWith({ data: 'test' });
			expect(callback2).toHaveBeenCalledWith({ data: 'test' });
		});

		it('should emit events without data', () => {
			const callback = vi.fn();
			eventBus.on('test-event', callback);

			eventBus.emit('test-event');

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(undefined);
		});

		it('should not error when emitting event with no listeners', () => {
			expect(() => {
				eventBus.emit('non-existent-event', { data: 'test' });
			}).not.toThrow();
		});
	});

	describe('Unsubscribing', () => {
		it('should unsubscribe using returned function', () => {
			const callback = vi.fn();
			const unsubscribe = eventBus.on('test-event', callback);

			// Emit before unsubscribe
			eventBus.emit('test-event', { data: 'test1' });
			expect(callback).toHaveBeenCalledTimes(1);

			// Unsubscribe
			unsubscribe();

			// Emit after unsubscribe
			eventBus.emit('test-event', { data: 'test2' });
			expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
		});

		it('should unsubscribe using off method', () => {
			const callback = vi.fn();
			eventBus.on('test-event', callback);

			eventBus.emit('test-event', { data: 'test1' });
			expect(callback).toHaveBeenCalledTimes(1);

			eventBus.off('test-event', callback);

			eventBus.emit('test-event', { data: 'test2' });
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should only remove the specific callback', () => {
			const callback1 = vi.fn();
			const callback2 = vi.fn();

			const unsub1 = eventBus.on('test-event', callback1);
			eventBus.on('test-event', callback2);

			unsub1(); // Remove only callback1

			eventBus.emit('test-event', { data: 'test' });

			expect(callback1).not.toHaveBeenCalled();
			expect(callback2).toHaveBeenCalledWith({ data: 'test' });
		});
	});

	describe('Error handling', () => {
		it('should catch errors in listeners and continue', () => {
			const errorCallback = vi.fn(() => {
				throw new Error('Listener error');
			});
			const successCallback = vi.fn();

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			eventBus.on('test-event', errorCallback);
			eventBus.on('test-event', successCallback);

			eventBus.emit('test-event', { data: 'test' });

			expect(errorCallback).toHaveBeenCalled();
			expect(successCallback).toHaveBeenCalled(); // Should still be called
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('Clear functionality', () => {
		it('should remove all listeners when cleared', () => {
			const callback1 = vi.fn();
			const callback2 = vi.fn();

			eventBus.on('event1', callback1);
			eventBus.on('event2', callback2);

			eventBus.clear();

			eventBus.emit('event1', { data: 'test' });
			eventBus.emit('event2', { data: 'test' });

			expect(callback1).not.toHaveBeenCalled();
			expect(callback2).not.toHaveBeenCalled();
		});
	});

	describe('Listener count', () => {
		it('should return correct listener count', () => {
			expect(eventBus.listenerCount('test-event')).toBe(0);

			const unsub1 = eventBus.on('test-event', vi.fn());
			expect(eventBus.listenerCount('test-event')).toBe(1);

			eventBus.on('test-event', vi.fn());
			expect(eventBus.listenerCount('test-event')).toBe(2);

			unsub1();
			expect(eventBus.listenerCount('test-event')).toBe(1);
		});

		it('should clean up empty listener sets', () => {
			const callback = vi.fn();
			const unsubscribe = eventBus.on('test-event', callback);

			expect(eventBus.listenerCount('test-event')).toBe(1);

			unsubscribe();

			expect(eventBus.listenerCount('test-event')).toBe(0);
		});
	});

	describe('Type-safe project events', () => {
		it('should emit and receive LOCAL_UPDATE events', () => {
			const callback = vi.fn();
			eventBus.on<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, callback);

			const payload: LocalUpdatePayload = {
				entityId: 'task-123',
				entityType: 'task',
				timestamp: Date.now()
			};

			eventBus.emit(PROJECT_EVENTS.LOCAL_UPDATE, payload);

			expect(callback).toHaveBeenCalledWith(payload);
		});

		it('should emit and receive REALTIME_CHANGE events', () => {
			const callback = vi.fn();
			eventBus.on(PROJECT_EVENTS.REALTIME_CHANGE, callback);

			const payload = {
				table: 'tasks',
				eventType: 'INSERT' as const,
				new: { id: 'task-123', name: 'Test Task' },
				old: null
			};

			eventBus.emit(PROJECT_EVENTS.REALTIME_CHANGE, payload);

			expect(callback).toHaveBeenCalledWith(payload);
		});

		it('should emit and receive SYNC_STATUS_CHANGED events', () => {
			const callback = vi.fn();
			eventBus.on(PROJECT_EVENTS.SYNC_STATUS_CHANGED, callback);

			const payload = {
				projectId: 'project-123',
				isActive: true
			};

			eventBus.emit(PROJECT_EVENTS.SYNC_STATUS_CHANGED, payload);

			expect(callback).toHaveBeenCalledWith(payload);
		});
	});

	describe('Real-world scenarios', () => {
		it('should handle rapid sequential events', () => {
			const callback = vi.fn();
			eventBus.on('test-event', callback);

			for (let i = 0; i < 100; i++) {
				eventBus.emit('test-event', { count: i });
			}

			expect(callback).toHaveBeenCalledTimes(100);
		});

		it('should handle subscribe/unsubscribe cycles', () => {
			const callback = vi.fn();

			// Subscribe and unsubscribe multiple times
			for (let i = 0; i < 10; i++) {
				const unsub = eventBus.on('test-event', callback);
				eventBus.emit('test-event', { data: i });
				unsub();
			}

			// Each iteration should call callback once (10 total)
			expect(callback).toHaveBeenCalledTimes(10);

			// After all unsubscribes, no more calls
			eventBus.emit('test-event', { data: 'final' });
			expect(callback).toHaveBeenCalledTimes(10); // Still 10
		});

		it('should handle unsubscribing during event emission', () => {
			const callbacks: Array<() => void> = [];
			const callOrder: number[] = [];

			// Create 3 callbacks, where #2 unsubscribes itself
			const callback1 = vi.fn(() => callOrder.push(1));
			const callback3 = vi.fn(() => callOrder.push(3));

			let unsub2: (() => void) | undefined;
			const callback2 = vi.fn(() => {
				callOrder.push(2);
				unsub2?.(); // Unsubscribe during emission
			});

			eventBus.on('test-event', callback1);
			unsub2 = eventBus.on('test-event', callback2);
			eventBus.on('test-event', callback3);

			// First emission - all three called
			eventBus.emit('test-event');
			expect(callOrder).toEqual([1, 2, 3]);

			// Second emission - callback2 shouldn't be called
			callOrder.length = 0;
			eventBus.emit('test-event');
			expect(callOrder).toEqual([1, 3]);
		});
	});
});
