// apps/web/src/routes/api/admin/chat/evals/run/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateAndPersistPromptEvalMock } = vi.hoisted(() => ({
	evaluateAndPersistPromptEvalMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-v2/prompt-eval-runner', () => ({
	evaluateAndPersistPromptEval: evaluateAndPersistPromptEvalMock
}));

import { POST } from './+server';

function createSupabase({ isAdmin = true } = {}) {
	return {
		from: vi.fn().mockImplementation((table: string) => {
			if (table !== 'admin_users') throw new Error(`Unexpected table: ${table}`);
			return {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				single: vi.fn().mockResolvedValue({
					data: isAdmin ? { user_id: 'admin-1' } : null,
					error: isAdmin ? null : { message: 'not found' }
				})
			};
		})
	};
}

describe('POST /api/admin/chat/evals/run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		evaluateAndPersistPromptEvalMock.mockResolvedValue({
			scenario: {
				slug: 'project.named_status',
				version: '1',
				title: 'Named Project Status Overview',
				description: 'Uses the project overview lane.',
				category: 'overview'
			},
			evalRun: {
				id: 'eval-1',
				turn_run_id: 'run-1',
				scenario_slug: 'project.named_status',
				status: 'passed'
			},
			assertions: [{ id: 'assert-1', assertion_key: 'first_lane_matches', status: 'passed' }],
			result: {
				summary: {
					assertion_counts: {
						passed: 4,
						failed: 0
					}
				}
			}
		});
	});

	it('runs and returns a prompt evaluation for admin users', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/evals/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					turn_run_id: 'run-1',
					scenario_slug: 'project.named_status'
				})
			}),
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(evaluateAndPersistPromptEvalMock).toHaveBeenCalledWith(
			expect.objectContaining({
				turnRunId: 'run-1',
				scenarioSlug: 'project.named_status',
				createdByUserId: 'admin-1'
			})
		);
		expect(payload.data.eval_run).toMatchObject({
			id: 'eval-1',
			status: 'passed'
		});
	});

	it('rejects requests missing required identifiers', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/evals/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({})
			}),
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.success).toBe(false);
		expect(payload.message).toContain('turn_run_id and scenario_slug are required');
	});
});
