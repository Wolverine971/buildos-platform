// apps/web/src/lib/utils/event-bus.ts
/**
 * Lightweight Event Bus for decoupling store and service communication
 *
 * This event bus breaks the circular dependency between project.store.ts and
 * realtimeProject.service.ts by providing a pub/sub mechanism for events.
 *
 * @example
 * ```typescript
 * // Emit an event
 * eventBus.emit(PROJECT_EVENTS.LOCAL_UPDATE, { entityId: 'task-123' });
 *
 * // Listen for events
 * const unsubscribe = eventBus.on(PROJECT_EVENTS.LOCAL_UPDATE, (data) => {
 *   console.log('Local update:', data.entityId);
 * });
 *
 * // Clean up
 * unsubscribe();
 * ```
 */

type EventCallback<T = any> = (data: T) => void;

/**
 * Generic event bus for pub/sub pattern
 */
class EventBus {
	private listeners = new Map<string, Set<EventCallback>>();

	/**
	 * Subscribe to an event
	 * @param event - Event name to listen for
	 * @param callback - Function to call when event is emitted
	 * @returns Unsubscribe function
	 */
	on<T = any>(event: string, callback: EventCallback<T>): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback as EventCallback);

		// Return unsubscribe function for cleanup
		return () => this.off(event, callback);
	}

	/**
	 * Unsubscribe from an event
	 * @param event - Event name
	 * @param callback - Callback to remove
	 */
	off(event: string, callback: EventCallback): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.delete(callback);
			// Clean up empty sets
			if (callbacks.size === 0) {
				this.listeners.delete(event);
			}
		}
	}

	/**
	 * Emit an event to all listeners
	 * @param event - Event name to emit
	 * @param data - Data to pass to listeners
	 */
	emit<T = any>(event: string, data?: T): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback(data);
				} catch (error) {
					console.error(`[EventBus] Error in event listener for "${event}":`, error);
				}
			});
		}
	}

	/**
	 * Remove all event listeners
	 * Useful for cleanup in tests
	 */
	clear(): void {
		this.listeners.clear();
	}

	/**
	 * Get count of listeners for an event (useful for debugging)
	 */
	listenerCount(event: string): number {
		return this.listeners.get(event)?.size ?? 0;
	}
}

// Singleton instance
export const eventBus = new EventBus();

/**
 * Type-safe event names for project-related events
 */
export const PROJECT_EVENTS = {
	/**
	 * Emitted when a local optimistic update occurs
	 * Payload: { entityId: string, entityType?: string }
	 */
	LOCAL_UPDATE: 'project:local-update',

	/**
	 * Emitted when a real-time database change arrives
	 * Payload: Supabase RealtimePayload
	 */
	REALTIME_CHANGE: 'project:realtime-change',

	/**
	 * Emitted when real-time sync status changes
	 * Payload: { projectId: string, isActive: boolean }
	 */
	SYNC_STATUS_CHANGED: 'project:sync-status-changed'
} as const;

/**
 * Type definitions for event payloads
 */
export interface LocalUpdatePayload {
	entityId: string;
	entityType?: 'task' | 'note' | 'phase' | 'project';
	timestamp?: number;
}

export interface RealtimeChangePayload {
	table: string;
	eventType: 'INSERT' | 'UPDATE' | 'DELETE';
	new: any;
	old: any;
}

export interface SyncStatusPayload {
	projectId: string;
	isActive: boolean;
}
