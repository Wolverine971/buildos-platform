// apps/web/src/lib/stores/__tests__/notification.store.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

type NotificationStoreModule = typeof import('../notification.store');

const STORAGE_KEY = 'buildos_notifications_v2';

vi.mock('$app/environment', () => ({
	browser: true
}));

class MemorySessionStorage implements Storage {
	private store = new Map<string, string>();

	clear(): void {
		this.store.clear();
	}

	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null;
	}

	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}

	get length(): number {
		return this.store.size;
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

describe('notification.store persistence', () => {
	let createNotificationStore: NotificationStoreModule['createNotificationStore'];
	let registerNotificationAction: NotificationStoreModule['registerNotificationAction'];

	beforeEach(async () => {
		vi.resetModules();

		const sessionStorage = new MemorySessionStorage();
		Object.defineProperty(globalThis, 'sessionStorage', {
			value: sessionStorage,
			configurable: true,
			writable: true
		});

		Object.defineProperty(globalThis, 'window', {
			value: { sessionStorage } as typeof globalThis,
			configurable: true,
			writable: true
		});

		({ createNotificationStore, registerNotificationAction } = await import(
			'../notification.store'
		));
	});

	it('serializes and hydrates actions with registry round-trip', () => {
		const store1 = createNotificationStore();

		const initialView = vi.fn();
		const initialDismiss = vi.fn();

		const notificationId = store1.add({
			type: 'generic',
			status: 'processing',
			isMinimized: true,
			isPersistent: false,
			autoCloseMs: null,
			data: {
				title: 'Test Notification'
			},
			progress: {
				type: 'binary',
				message: 'Working'
			},
			actions: {
				view: initialView,
				dismiss: initialDismiss
			}
		});

		store1.persist();

		const rawPersisted = globalThis.sessionStorage.getItem(STORAGE_KEY);
		expect(rawPersisted).not.toBeNull();
		const parsedPersisted = JSON.parse(rawPersisted!);

		expect(Array.isArray(parsedPersisted.notifications)).toBe(true);
		expect(parsedPersisted.notifications[0].actions[0]).toMatchObject({
			name: 'view'
		});
		expect(parsedPersisted.notifications[0].actions[0].key).toContain(notificationId);

		const rehydratedView = vi.fn();
		const rehydratedDismiss = vi.fn();

		const store2 = createNotificationStore();

		registerNotificationAction(`${notificationId}:view`, rehydratedView);
		registerNotificationAction(`${notificationId}:dismiss`, rehydratedDismiss);

		const state = get(store2);
		expect(state.notifications).toBeInstanceOf(Map);

		const hydratedNotification = state.notifications.get(notificationId);
		expect(hydratedNotification).toBeTruthy();
		expect(typeof hydratedNotification?.actions.view).toBe('function');
		expect(typeof hydratedNotification?.actions.dismiss).toBe('function');

		hydratedNotification?.actions.view?.();
		hydratedNotification?.actions.dismiss?.();

		expect(rehydratedView).toHaveBeenCalledTimes(1);
		expect(rehydratedDismiss).toHaveBeenCalledTimes(1);
	});
});
