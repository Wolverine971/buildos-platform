// apps/worker/tests/dailyBriefEligibility.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: rpcMock
	}
}));

import { getDailyBriefEligibleUserIds } from '../src/workers/brief/dailyBriefEligibility';

describe('getDailyBriefEligibleUserIds', () => {
	beforeEach(() => {
		rpcMock.mockReset();
	});

	it('deduplicates the request and returns only requested eligible users', async () => {
		rpcMock.mockResolvedValue({
			data: [{ user_id: 'user-2' }, { user_id: 'unexpected-user' }],
			error: null
		});

		const result = await getDailyBriefEligibleUserIds(['user-1', 'user-2', 'user-2']);

		expect(rpcMock).toHaveBeenCalledWith('get_daily_brief_eligible_user_ids', {
			user_ids: ['user-1', 'user-2']
		});
		expect(result).toEqual(new Set(['user-2']));
	});

	it('does not query for an empty user list', async () => {
		await expect(getDailyBriefEligibleUserIds([])).resolves.toEqual(new Set());
		expect(rpcMock).not.toHaveBeenCalled();
	});

	it('fails closed when eligibility cannot be resolved', async () => {
		rpcMock.mockResolvedValue({
			data: null,
			error: { message: 'database unavailable' }
		});

		await expect(getDailyBriefEligibleUserIds(['user-1'])).rejects.toThrow(
			'Failed to resolve daily brief project eligibility: database unavailable'
		);
	});
});
