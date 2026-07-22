// apps/web/src/lib/utils/client-route-recovery.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
	isRecoverableRouteLoadError,
	recoverFromRouteLoadError,
	type RouteLoadRecoveryContext
} from './client-route-recovery';

function createStorage(initialValue: string | null = null) {
	let value = initialValue;
	return {
		getItem: vi.fn(() => value),
		setItem: vi.fn((_key: string, nextValue: string) => {
			value = nextValue;
		})
	};
}

function createContext(
	overrides: Partial<RouteLoadRecoveryContext> = {}
): RouteLoadRecoveryContext {
	return {
		route: '/projects/project-1/tasks/task-1',
		storage: createStorage(),
		reload: vi.fn(),
		now: 100_000,
		...overrides
	};
}

describe('client route recovery', () => {
	it.each([
		new TypeError(
			'Failed to fetch dynamically imported module: https://build-os.com/_app/immutable/nodes/102.hash.js'
		),
		new TypeError("Cannot read properties of undefined (reading 'universal')"),
		Object.assign(new Error('Loading chunk 42 failed'), { name: 'ChunkLoadError' }),
		new Error('Importing a module script failed')
	])('recognizes recoverable deployment-skew errors', (error) => {
		expect(isRecoverableRouteLoadError(error)).toBe(true);
	});

	it('does not treat ordinary application errors as deployment skew', () => {
		expect(isRecoverableRouteLoadError(new Error('Task save failed'))).toBe(false);
	});

	it('marks the route and reloads once for a recoverable error', () => {
		const context = createContext();

		expect(
			recoverFromRouteLoadError(new Error('Importing a module script failed'), context)
		).toBe(true);
		expect(context.storage.setItem).toHaveBeenCalledWith(
			'buildos:route-load-recovery',
			JSON.stringify({ route: context.route, attemptedAt: context.now, moduleUrl: null })
		);
		expect(context.reload).toHaveBeenCalledOnce();
	});

	it('refreshes a failed immutable module before reloading', async () => {
		const refreshModule = vi.fn().mockResolvedValue(undefined);
		const context = createContext({ refreshModule });
		const moduleUrl = 'https://build-os.com/_app/immutable/nodes/102.CD3qat8H.js';

		expect(
			recoverFromRouteLoadError(
				new TypeError(`Failed to fetch dynamically imported module: ${moduleUrl}`),
				context
			)
		).toBe(true);
		expect(refreshModule).toHaveBeenCalledWith(moduleUrl);

		await vi.waitFor(() => expect(context.reload).toHaveBeenCalledOnce());
	});

	it('prevents a reload loop for the same route during the recovery window', () => {
		const route = '/projects/project-1/tasks/task-1';
		const storage = createStorage(JSON.stringify({ route, attemptedAt: 90_000 }));
		const context = createContext({ route, storage, now: 100_000 });

		expect(
			recoverFromRouteLoadError(new Error('Importing a module script failed'), context)
		).toBe(false);
		expect(context.reload).not.toHaveBeenCalled();
	});

	it('allows a new recovery attempt after the guard window expires', () => {
		const route = '/projects/project-1/tasks/task-1';
		const storage = createStorage(JSON.stringify({ route, attemptedAt: 10_000 }));
		const context = createContext({ route, storage, now: 100_000 });

		expect(
			recoverFromRouteLoadError(
				new TypeError('Failed to fetch dynamically imported module: /nodes/102.js'),
				context
			)
		).toBe(true);
		expect(context.reload).toHaveBeenCalledOnce();
	});

	it('upgrades a generic recovery to a module refresh without creating a reload loop', async () => {
		const route = '/projects/project-1/tasks/task-1';
		const storage = createStorage(
			JSON.stringify({ route, attemptedAt: 90_000, moduleUrl: null })
		);
		const refreshModule = vi.fn().mockResolvedValue(undefined);
		const context = createContext({ route, storage, refreshModule, now: 100_000 });
		const moduleUrl = 'https://build-os.com/_app/immutable/nodes/102.hash.js';

		expect(
			recoverFromRouteLoadError(
				new TypeError(`Failed to fetch dynamically imported module: ${moduleUrl}`),
				context
			)
		).toBe(true);
		expect(refreshModule).toHaveBeenCalledWith(moduleUrl);
		await vi.waitFor(() => expect(context.reload).toHaveBeenCalledOnce());
	});

	it('does not reload if the loop guard cannot be persisted', () => {
		const storage = createStorage();
		storage.setItem.mockImplementation(() => {
			throw new Error('Storage disabled');
		});
		const context = createContext({ storage });

		expect(
			recoverFromRouteLoadError(new Error('Importing a module script failed'), context)
		).toBe(false);
		expect(context.reload).not.toHaveBeenCalled();
	});
});
