// apps/web/src/lib/utils/invalidate-keeping-state.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate, refreshAll } from '$app/navigation';
import { invalidateKeepingState } from './invalidate-keeping-state';

const state = vi.hoisted(() => ({ page: { state: {} as Record<string, unknown> } }));

vi.mock('$app/navigation', () => ({
	invalidate: vi.fn(async () => undefined),
	refreshAll: vi.fn(async () => undefined)
}));
vi.mock('$app/state', () => state);

describe('invalidateKeepingState', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.page.state = {};
	});

	it('re-runs only the named loads when the page has nothing open', async () => {
		await invalidateKeepingState('app:invites');

		expect(invalidate).toHaveBeenCalledWith('app:invites');
		expect(refreshAll).not.toHaveBeenCalled();
	});

	it('never calls invalidate, which would close it, while a project card is open', async () => {
		state.page.state = { desktopCard: 'project-1' };

		await invalidateKeepingState('app:invites');

		expect(invalidate).not.toHaveBeenCalled();
		expect(refreshAll).toHaveBeenCalledTimes(1);
	});
});
