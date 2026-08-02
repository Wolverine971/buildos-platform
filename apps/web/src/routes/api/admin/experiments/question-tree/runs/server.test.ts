// apps/web/src/routes/api/admin/experiments/question-tree/runs/server.test.ts
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

describe('POST /api/admin/experiments/question-tree/runs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAdminUserIdMock.mockResolvedValue('admin-1');
	});

	it('creates the run and initial queue job through the atomic RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: { run: { id: 'run-1', root_question: 'How should the experiment work?' } },
			error: null
		});
		createAdminSupabaseClientMock.mockReturnValue({ rpc });
		const response = await POST({
			request: new Request('http://localhost/api/admin/experiments/question-tree/runs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					question: 'How should the experiment work?',
					model_policy: 'paid_floor_strict',
					node_limit: 100
				})
			}),
			locals: { supabase: {}, safeGetSession: vi.fn() }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.success).toBe(true);
		expect(rpc).toHaveBeenCalledWith('create_question_tree_run_with_job', {
			p_created_by: 'admin-1',
			p_root_question: 'How should the experiment work?',
			p_model_policy: 'paid_floor_strict',
			p_node_limit: 100,
			p_config: {}
		});
	});

	it('rejects non-admin callers before creating a service-role client', async () => {
		getAdminUserIdMock.mockResolvedValue(null);
		const response = await POST({
			request: new Request('http://localhost/api/admin/experiments/question-tree/runs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ question: 'Unauthorized question' })
			}),
			locals: { supabase: {}, safeGetSession: vi.fn() }
		} as any);

		expect(response.status).toBe(403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
