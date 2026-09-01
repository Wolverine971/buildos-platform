// apps/web/src/lib/server/time-block-runtime.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasActiveTarget: vi.fn(),
	timeBlockConstructor: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: vi.fn(() => ({}))
}));

vi.mock('$lib/server/google-calendar-write.service', () => ({
	GoogleCalendarWriteService: vi.fn().mockImplementation(() => ({
		hasActiveTarget: mocks.hasActiveTarget
	}))
}));

vi.mock('$lib/services/calendar-service', () => ({
	CalendarService: vi.fn()
}));

vi.mock('$lib/services/time-block.service', () => ({
	TimeBlockService: vi.fn().mockImplementation((...args) => {
		mocks.timeBlockConstructor(...args);
		return { kind: 'time-block-service' };
	})
}));

import { createTimeBlockRuntimeService } from './time-block-runtime.service';

describe('createTimeBlockRuntimeService', () => {
	beforeEach(() => vi.clearAllMocks());

	it('uses source-aware writes for a source-only user without relying on a rollout flag', async () => {
		mocks.hasActiveTarget.mockResolvedValue(true);

		await createTimeBlockRuntimeService({} as any, 'user-1');

		expect(mocks.hasActiveTarget).toHaveBeenCalledWith('user-1', 'write');
		expect(mocks.timeBlockConstructor).toHaveBeenCalledWith(
			{},
			'user-1',
			expect.anything(),
			expect.objectContaining({
				sourceAwareCalendar: expect.objectContaining({
					hasActiveTarget: mocks.hasActiveTarget
				})
			})
		);
	});

	it('falls back to legacy routing if no writable source target is available', async () => {
		mocks.hasActiveTarget.mockResolvedValue(false);

		await createTimeBlockRuntimeService({} as any, 'user-1');

		expect(mocks.timeBlockConstructor).toHaveBeenCalledWith({}, 'user-1', expect.anything(), {
			sourceAwareCalendar: undefined
		});
	});
});
