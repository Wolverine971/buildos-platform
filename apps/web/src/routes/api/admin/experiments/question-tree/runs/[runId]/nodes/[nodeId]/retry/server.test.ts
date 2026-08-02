// apps/web/src/routes/api/admin/experiments/question-tree/runs/[runId]/nodes/[nodeId]/retry/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, getAdminUserIdMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	getAdminUserIdMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/question-tree-admin', () => ({
	getAdminUserId: getAdminUserIdMock
}));

import { POST } from './+server';

describe('POST Question Tree node retry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAdminUserIdMock.mockResolvedValue('admin-1');
	});

	it('atomically retries one failed node through the service-role RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: { node_id: 'node-7', node_status: 'queued' },
			error: null
		});
		createAdminSupabaseClientMock.mockReturnValue({ rpc });

		const response = await POST({
			params: { runId: 'run-1', nodeId: 'node-7' },
			locals: { supabase: {}, safeGetSession: vi.fn() }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(rpc).toHaveBeenCalledWith('retry_question_tree_node', {
			p_run_id: 'run-1',
			p_node_id: 'node-7'
		});
	});

	it('rejects non-admin callers before creating a service-role client', async () => {
		getAdminUserIdMock.mockResolvedValue(null);
		const response = await POST({
			params: { runId: 'run-1', nodeId: 'node-7' },
			locals: { supabase: {}, safeGetSession: vi.fn() }
		} as any);

		expect(response.status).toBe(403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
