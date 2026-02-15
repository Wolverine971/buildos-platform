// apps/web/src/lib/stores/notification.store.ts

/**
 * Generic Stackable Notification Store
 *
 * Manages a stack of notifications for async operations (brain dumps, phase generation, etc.)
 * - Multiple notifications can exist simultaneously
 * - Only one notification can be expanded at a time
 * - Notifications persist across page navigation (session storage)
 *
 * 📚 Documentation:
 * - API Reference: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#api-reference
 * - Architecture: /generic-stackable-notification-system-spec.md#4-store-structure
 *
 * ⚠️ CRITICAL: This store uses Svelte 5 reactivity patterns with Maps.
 * All update functions create NEW Map instances to trigger reactivity.
 * See: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#4-svelte-5-map-reactivity-issue-critical-fix
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type {
	Notification,
	NotificationStoreState,
	NotificationConfig,
	NotificationStatus,
	NotificationProgress,
	CreateNotificationInput,
	UpdateNotificationInput
} from '$lib/types/notification.types';

// Serialized shape stored in sessionStorage (functions stripped, metadata retained)
type NotificationActionHandler = () => void;

const ACTION_KEY_SYMBOL = Symbol('notificationActionKey');

type RegisteredNotificationAction = NotificationActionHandler & {
	[ACTION_KEY_SYMBOL]?: string;
	__notificationInvoker__?: true;
};

interface StoredNotificationActionMetadata {
	name: string;
	key: string;
}

interface StoredNotificationEntry {
	id: string;
	notification: Omit<Notification, 'actions'>;
	actions: StoredNotificationActionMetadata[];
	/**
	 * @deprecated Legacy action key array retained for backward compatibility.
	 */
	actionKeys?: string[];
}

const actionRegistry = new Map<string, NotificationActionHandler>();
const notificationActionKeyMap = new Map<string, Record<string, string>>();

export function registerNotificationAction(key: string, handler: NotificationActionHandler): void {
	actionRegistry.set(key, handler);
}

export function unregisterNotificationAction(key: string): void {
	actionRegistry.delete(key);
}

function recordActionKeys(notificationId: string, keyMap: Record<string, string>): void {
	if (Object.keys(keyMap).length === 0) {
		notificationActionKeyMap.delete(notificationId);
		return;
	}
	notificationActionKeyMap.set(notificationId, keyMap);
}

function cleanupNotificationActions(notificationId: string): void {
	const keyMap = notificationActionKeyMap.get(notificationId);
	if (!keyMap) return;

	for (const key of Object.values(keyMap)) {
		actionRegistry.delete(key);
	}
	notificationActionKeyMap.delete(notificationId);
}

function cleanupNotificationActionsBulk(notificationIds: Iterable<string>): void {
	for (const id of notificationIds) {
		cleanupNotificationActions(id);
	}
}

function createActionInvoker(
	actionKey: string,
	context: { notificationId: string; name: string }
): RegisteredNotificationAction {
	const invoker: RegisteredNotificationAction = () => {
		const handler = actionRegistry.get(actionKey);
		if (!handler) {
			console.warn(
				`[NotificationStore] Action "${context.name}" (${actionKey}) triggered for ${context.notificationId} before handler was registered`
			);
			return;
		}
		handler();
	};

	Object.defineProperty(invoker, ACTION_KEY_SYMBOL, {
		value: actionKey,
		enumerable: false,
		writable: false
	});

	Object.defineProperty(invoker, '__notificationInvoker__', {
		value: true,
		enumerable: false,
		writable: false
	});

	return invoker;
}

function getActionMetadataFromHandlers(
	notificationId: string,
	actions: Notification['actions']
): StoredNotificationActionMetadata[] {
	const cached = notificationActionKeyMap.get(notificationId);
	if (cached) {
		return Object.entries(cached).map(([name, key]) => ({ name, key }));
	}

	const metadata: StoredNotificationActionMetadata[] = [];
	const keyMap: Record<string, string> = {};

	for (const [name, handler] of Object.entries(actions ?? {})) {
		if (typeof handler !== 'function') continue;
		const registered = handler as RegisteredNotificationAction;
		const key = registered[ACTION_KEY_SYMBOL] ?? `${notificationId}:${name}`;
		metadata.push({ name, key });
		keyMap[name] = key;
	}

	if (metadata.length > 0) {
		recordActionKeys(notificationId, keyMap);
	}

	return metadata;
}

function serializeNotificationEntry(notification: Notification): StoredNotificationEntry {
	const { actions, ...notificationWithoutActions } = notification;
	const actionMetadata = getActionMetadataFromHandlers(
		notification.id,
		(actions ?? {}) as Notification['actions']
	);

	return {
		id: notification.id,
		notification: notificationWithoutActions as Omit<Notification, 'actions'>,
		actions: actionMetadata
	};
}

function serializeNotificationMap(
	notifications: Map<string, Notification>
): StoredNotificationEntry[] {
	return Array.from(notifications.values()).map(serializeNotificationEntry);
}

function hydrateStoredNotification(entry: StoredNotificationEntry): Notification {
	const id = entry.notification.id ?? entry.id;

	const actionsMetadata = entry.actions?.length
		? entry.actions
		: Array.isArray(entry.actionKeys)
			? entry.actionKeys.map((name) => ({ name, key: `${id}:${name}` }))
			: [];

	const keyMap: Record<string, string> = {};
	const hydratedActions: Notification['actions'] = {};

	for (const { name, key } of actionsMetadata) {
		keyMap[name] = key;
		hydratedActions[name] = createActionInvoker(key, { notificationId: id, name });
	}

	recordActionKeys(id, keyMap);

	return {
		...entry.notification,
		id,
		actions: hydratedActions
	} as Notification;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'buildos_notifications_v2';
const STORAGE_VERSION = 2;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: NotificationConfig = {
	maxStackSize: 5,
	defaultAutoCloseMs: 5000,
	stackPosition: 'bottom-right',
	stackSpacing: 8,
	enableSounds: false,
	enableHistory: true
};

// ============================================================================
// Initial State
// ============================================================================

function createInitialState(): NotificationStoreState {
	return {
		notifications: new Map(),
		stack: [],
		expandedId: null,
		history: [],
		config: { ...DEFAULT_CONFIG }
	};
}

// ============================================================================
// Store Implementation
// ============================================================================

export function createNotificationStore() {
	const { subscribe, set, update } = writable<NotificationStoreState>(createInitialState());

	// Auto-close timers
	const autoCloseTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// Track if hydration has completed to prevent race conditions
	let isHydrating = false;
	let hydrationComplete = false;

	function prepareActions(
		id: string,
		actions?: Notification['actions']
	): Notification['actions'] | undefined {
		if (actions === undefined) {
			cleanupNotificationActions(id);
			return undefined;
		}

		const previousKeys = notificationActionKeyMap.get(id);
		const prepared: Notification['actions'] = {};
		const keyMap: Record<string, string> = {};

		for (const [name, handler] of Object.entries(actions)) {
			if (typeof handler !== 'function') continue;

			const registered = handler as RegisteredNotificationAction;
			const key = registered[ACTION_KEY_SYMBOL] ?? `${id}:${name}`;

			if (!registered.__notificationInvoker__) {
				registerNotificationAction(key, registered);
			}

			const invoker =
				registered.__notificationInvoker__ && registered[ACTION_KEY_SYMBOL] === key
					? registered
					: createActionInvoker(key, { notificationId: id, name });

			prepared[name] = invoker;
			keyMap[name] = key;
		}

		if (previousKeys) {
			const nextKeySet = new Set(Object.values(keyMap));
			for (const key of Object.values(previousKeys)) {
				if (!nextKeySet.has(key)) {
					actionRegistry.delete(key);
				}
			}
		}

		recordActionKeys(id, keyMap);

		return prepared;
	}

	/**
	 * Generate unique notification ID
	 */
	function generateId(): string {
		return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Start auto-close timer for notification
	 */
	function startAutoCloseTimer(id: string, durationMs: number): void {
		if (!browser || typeof window === 'undefined') return;

		// Clear existing timer
		const existing = autoCloseTimers.get(id);
		if (existing) {
			clearTimeout(existing);
		}

		// Set new timer
		const timer = setTimeout(() => {
			console.log(`[NotificationStore] Auto-closing notification ${id}`);
			remove(id);
			autoCloseTimers.delete(id);
		}, durationMs);

		autoCloseTimers.set(id, timer);
	}

	/**
	 * Clear auto-close timer
	 */
	function clearAutoCloseTimer(id: string): void {
		const timer = autoCloseTimers.get(id);
		if (timer) {
			clearTimeout(timer);
			autoCloseTimers.delete(id);
		}
	}

	/**
	 * Add a new notification to the stack
	 *
	 * @returns Notification ID for future updates
	 * @see /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#store-methods for usage examples
	 */
	function add(input: CreateNotificationInput<Notification>): string {
		const id = generateId();
		const now = Date.now();

		const preparedActions = prepareActions(id, input.actions);

		const notification: Notification = {
			...input,
			id,
			createdAt: now,
			updatedAt: now,
			actions: preparedActions ?? {}
		} as Notification;

		update((state) => {
			// Create new Map for reactivity
			const newNotifications = new Map(state.notifications);
			newNotifications.set(id, notification);

			console.log(`[NotificationStore] Added notification ${id} (${notification.type})`);

			// Auto-close if configured
			if (notification.autoCloseMs && notification.autoCloseMs > 0) {
				startAutoCloseTimer(id, notification.autoCloseMs);
			}

			return {
				...state,
				notifications: newNotifications,
				stack: [...state.stack, id] // Also create new array
			};
		});

		// Persist to session storage
		persist();

		return id;
	}

	/**
	 * Update an existing notification
	 */
	function updateNotification(id: string, updates: UpdateNotificationInput): void {
		update((state) => {
			const notification = state.notifications.get(id);
			if (!notification) {
				console.warn(`[NotificationStore] Cannot update - notification ${id} not found`);
				return state;
			}

			const hasActionsUpdate = Object.prototype.hasOwnProperty.call(updates, 'actions');
			const preparedActions = hasActionsUpdate
				? (prepareActions(id, updates.actions as Notification['actions'] | undefined) ?? {})
				: notification.actions;

			const updated: Notification = {
				...notification,
				...updates,
				actions: preparedActions,
				updatedAt: Date.now()
			} as Notification;

			// Create new Map for reactivity
			const newNotifications = new Map(state.notifications);
			newNotifications.set(id, updated);

			console.log(`[NotificationStore] Updated notification ${id}`, updates);

			return {
				...state,
				notifications: newNotifications
			};
		});

		// Persist changes
		persist();
	}

	/**
	 * Remove a notification from the stack
	 */
	function remove(id: string): void {
		update((state) => {
			const notification = state.notifications.get(id);
			if (!notification) {
				console.warn(`[NotificationStore] Cannot remove - notification ${id} not found`);
				return state;
			}

			// Create new Map and remove notification
			const newNotifications = new Map(state.notifications);
			newNotifications.delete(id);

			// Create new stack array without this id
			const newStack = state.stack.filter((stackId) => stackId !== id);

			// Update history
			const newHistory = state.config.enableHistory
				? [...state.history, notification].slice(-50) // Keep max 50
				: state.history;

			console.log(`[NotificationStore] Removed notification ${id}`);

			// Clear auto-close timer
			clearAutoCloseTimer(id);
			cleanupNotificationActions(id);

			return {
				...state,
				notifications: newNotifications,
				stack: newStack,
				expandedId: state.expandedId === id ? null : state.expandedId,
				history: newHistory
			};
		});

		// Persist changes
		persist();
	}

	/**
	 * Expand a notification (minimizes any currently expanded)
	 *
	 * NOTE: Only one notification can be expanded at a time (single modal constraint).
	 * If another notification is currently expanded, it will be minimized automatically.
	 *
	 * @see /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#expanded-state-modal for behavior details
	 */
	function expand(id: string): void {
		update((state) => {
			const notification = state.notifications.get(id);
			if (!notification) {
				console.warn(`[NotificationStore] Cannot expand - notification ${id} not found`);
				return state;
			}

			// Create new Map for reactivity (CRITICAL for Svelte 5)
			const newNotifications = new Map(state.notifications);

			// Minimize currently expanded notification (if different)
			if (state.expandedId && state.expandedId !== id) {
				const current = state.notifications.get(state.expandedId);
				if (current) {
					newNotifications.set(state.expandedId, {
						...current,
						isMinimized: true,
						updatedAt: Date.now()
					});
				}
			}

			// Expand requested notification
			newNotifications.set(id, {
				...notification,
				isMinimized: false,
				updatedAt: Date.now()
			});

			console.log(`[NotificationStore] Expanded notification ${id}`);

			return {
				...state,
				notifications: newNotifications,
				expandedId: id
			};
		});

		persist();
	}

	/**
	 * Minimize a notification
	 */
	function minimize(id: string): void {
		update((state) => {
			const notification = state.notifications.get(id);
			if (!notification) {
				console.warn(`[NotificationStore] Cannot minimize - notification ${id} not found`);
				return state;
			}

			// Create new Map for reactivity
			const newNotifications = new Map(state.notifications);
			newNotifications.set(id, {
				...notification,
				isMinimized: true,
				updatedAt: Date.now()
			});

			console.log(`[NotificationStore] Minimized notification ${id}`);

			return {
				...state,
				notifications: newNotifications,
				expandedId: state.expandedId === id ? null : state.expandedId
			};
		});

		persist();
	}

	/**
	 * Minimize all notifications
	 */
	function minimizeAll(): void {
		update((state) => {
			const now = Date.now();

			// Create new Map with all notifications minimized
			const newNotifications = new Map();
			for (const [id, notification] of state.notifications) {
				newNotifications.set(id, {
					...notification,
					isMinimized: true,
					updatedAt: now
				});
			}

			console.log('[NotificationStore] Minimized all notifications');

			return {
				...state,
				notifications: newNotifications,
				expandedId: null
			};
		});

		persist();
	}

	/**
	 * Update notification status
	 */
	function setStatus(id: string, status: NotificationStatus): void {
		updateNotification(id, { status });

		// Auto-close on success if configured
		const state = get({ subscribe });
		const notification = state.notifications.get(id);

		if (notification && status === 'success' && notification.autoCloseMs) {
			startAutoCloseTimer(id, notification.autoCloseMs);
		}
	}

	/**
	 * Update notification progress
	 */
	function setProgress(id: string, progress: NotificationProgress): void {
		updateNotification(id, { progress });
	}

	/**
	 * Set notification error
	 */
	function setError(id: string, error: string): void {
		update((state) => {
			const notification = state.notifications.get(id);
			if (!notification) return state;

			const updated = {
				...notification,
				status: 'error' as NotificationStatus,
				updatedAt: Date.now()
			};

			// Add error to data based on type
			if (updated.type === 'brain-dump') {
				updated.data.error = error;
			} else if (updated.type === 'calendar-analysis') {
				updated.data.error = error;
			} else if (updated.type === 'generic') {
				updated.data.error = error;
			}

			// Create new Map for reactivity
			const newNotifications = new Map(state.notifications);
			newNotifications.set(id, updated);

			console.log(`[NotificationStore] Set error for notification ${id}:`, error);

			return {
				...state,
				notifications: newNotifications
			};
		});

		persist();
	}

	/**
	 * Clear all notifications
	 */
	function clear(): void {
		update((state) => {
			// Clear all auto-close timers
			for (const timer of autoCloseTimers.values()) {
				clearTimeout(timer);
			}
			autoCloseTimers.clear();

			cleanupNotificationActionsBulk(state.notifications.keys());

			// Move all to history
			if (state.config.enableHistory) {
				state.history.push(...Array.from(state.notifications.values()));
			}

			return createInitialState();
		});

		persist();

		console.log('[NotificationStore] Cleared all notifications');
	}

	/**
	 * Clear only completed notifications
	 */
	function clearCompleted(): void {
		update((state) => {
			const completed = Array.from(state.notifications.entries()).filter(
				([_, notif]) => notif.status === 'success' || notif.status === 'error'
			);

			// Create new Map without completed notifications
			const newNotifications = new Map(state.notifications);
			const completedIds = new Set<string>();

			for (const [id, _] of completed) {
				newNotifications.delete(id);
				completedIds.add(id);
				clearAutoCloseTimer(id);
			}

			cleanupNotificationActionsBulk(completedIds);

			// Create new stack without completed ids
			const newStack = state.stack.filter((id) => !completedIds.has(id));

			console.log(`[NotificationStore] Cleared ${completed.length} completed notifications`);

			return {
				...state,
				notifications: newNotifications,
				stack: newStack
			};
		});

		persist();
	}

	/**
	 * Clear notification history
	 */
	function clearHistory(): void {
		update((state) => {
			console.log('[NotificationStore] Cleared history');
			return {
				...state,
				history: []
			};
		});

		persist();
	}

	/**
	 * Persist state to session storage
	 */
	function persist(): void {
		if (!browser || typeof window === 'undefined' || typeof sessionStorage === 'undefined')
			return;

		try {
			const state = get({ subscribe });

			const serialized = {
				version: STORAGE_VERSION,
				timestamp: Date.now(),
				notifications: serializeNotificationMap(state.notifications),
				stack: state.stack,
				expandedId: state.expandedId,
				history: state.history.map(serializeNotificationEntry),
				config: state.config
			};

			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
		} catch (error) {
			console.warn('[NotificationStore] Failed to persist to session storage:', error);
		}
	}

	/**
	 * Hydrate state from session storage
	 */
	function hydrate(): void {
		if (!browser || typeof window === 'undefined' || typeof sessionStorage === 'undefined')
			return;

		// Prevent duplicate hydration
		if (isHydrating || hydrationComplete) {
			console.warn('[NotificationStore] Hydration already in progress or complete, skipping');
			return;
		}

		isHydrating = true;

		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (!stored) {
				console.log('[NotificationStore] No stored state to hydrate');
				hydrationComplete = true;
				isHydrating = false;
				return;
			}

			const data = JSON.parse(stored);

			const storedNotifications: StoredNotificationEntry[] = Array.isArray(data.notifications)
				? data.notifications
				: [];
			const hydratedNotifications = new Map<string, Notification>();
			for (const entry of storedNotifications) {
				hydratedNotifications.set(entry.id, hydrateStoredNotification(entry));
			}

			const hydratedHistory: Notification[] = Array.isArray(data.history)
				? (data.history as StoredNotificationEntry[]).map(hydrateStoredNotification)
				: [];

			// Check version compatibility
			if (data.version !== STORAGE_VERSION) {
				console.warn('[NotificationStore] Storage version mismatch, clearing');
				sessionStorage.removeItem(STORAGE_KEY);
				hydrationComplete = true;
				isHydrating = false;
				return;
			}

			// Check if session is too old
			const age = Date.now() - data.timestamp;
			if (age > SESSION_TIMEOUT_MS) {
				console.warn('[NotificationStore] Session expired, clearing');
				sessionStorage.removeItem(STORAGE_KEY);
				hydrationComplete = true;
				isHydrating = false;
				return;
			}

			// Restore state - use update instead of set to preserve any notifications added during hydration
			update((currentState) => {
				// Only restore if current state is empty (initial state)
				// This prevents overwriting notifications added during hydration
				if (currentState.notifications.size > 0) {
					console.log(
						'[NotificationStore] Notifications already exist, merging with hydrated state'
					);

					// Merge hydrated notifications with current ones
					const mergedNotifications = new Map(hydratedNotifications);

					// Add any current notifications that aren't in hydrated state
					for (const [id, notification] of currentState.notifications) {
						if (!mergedNotifications.has(id)) {
							mergedNotifications.set(id, notification);
						}
					}

					const mergedStackSource = Array.isArray(data.stack) ? data.stack : [];

					return {
						notifications: mergedNotifications,
						stack: [...new Set([...mergedStackSource, ...currentState.stack])],
						expandedId: currentState.expandedId || data.expandedId,
						history: hydratedHistory.length ? hydratedHistory : currentState.history,
						config: data.config
					};
				}

				// No current notifications, safe to restore hydrated state completely
				return {
					notifications: hydratedNotifications,
					stack: Array.isArray(data.stack) ? data.stack : [],
					expandedId: data.expandedId,
					history: hydratedHistory,
					config: data.config
				};
			});

			console.log('[NotificationStore] Hydrated from session storage');
		} catch (error) {
			console.warn('[NotificationStore] Failed to hydrate from session storage:', error);
			if (typeof sessionStorage !== 'undefined') {
				sessionStorage.removeItem(STORAGE_KEY);
			}
		} finally {
			hydrationComplete = true;
			isHydrating = false;
		}
	}

	// Hydrate on initialization (only in browser)
	if (browser && typeof window !== 'undefined') {
		hydrate();
	}

	return {
		subscribe,
		add,
		update: updateNotification,
		remove,
		expand,
		minimize,
		minimizeAll,
		setStatus,
		setProgress,
		setError,
		clear,
		clearCompleted,
		clearHistory,
		persist,
		hydrate
	};
}

// ============================================================================
// Store Instance & Exports
// ============================================================================

export const notificationStore = createNotificationStore();

// ============================================================================
// Derived Stores (for convenience)
// ============================================================================

/**
 * Get notifications as array (sorted by creation time)
 */
export const notificationsArray = derived(notificationStore, ($state) =>
	Array.from($state.notifications.values()).sort((a, b) => a.createdAt - b.createdAt)
);

/**
 * Get currently expanded notification
 */
export const expandedNotification = derived(notificationStore, ($state) =>
	$state.expandedId ? $state.notifications.get($state.expandedId) : null
);

/**
 * Get count of processing notifications
 */
export const processingCount = derived(
	notificationStore,
	($state) =>
		Array.from($state.notifications.values()).filter((n) => n.status === 'processing').length
);

/**
 * Get visible stack (max 5 notifications)
 */
export const visibleStack = derived(notificationStore, ($state) => {
	const maxVisible = $state.config.maxStackSize;
	return $state.stack.slice(-maxVisible);
});

/**
 * Get hidden notification count
 */
export const hiddenCount = derived(notificationStore, ($state) => {
	const maxVisible = $state.config.maxStackSize;
	return Math.max(0, $state.stack.length - maxVisible);
});
