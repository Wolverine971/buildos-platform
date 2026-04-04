// apps/web/src/routes/api/admin/chat/evals/scenarios/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listAvailablePromptEvalScenariosMock } = vi.hoisted(() => ({
	listAvailablePromptEvalScenariosMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-v2/prompt-eval-runner', () => ({
	listAvailablePromptEvalScenarios: listAvailablePromptEvalScenariosMock
}));

import { GET } from './+server';

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

describe('GET /api/admin/chat/evals/scenarios', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listAvailablePromptEvalScenariosMock.mockReturnValue([
			{
				slug: 'project.named_status',
				version: '1',
				title: 'Named Project Status Overview',
				description: 'Uses the project overview lane.',
				category: 'overview'
			}
		]);
	});

	it('returns available prompt eval scenarios for admin users', async () => {
		const response = await GET({
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.scenarios).toHaveLength(1);
		expect(payload.data.scenarios[0]).toMatchObject({
			slug: 'project.named_status'
		});
	});

	it('rejects non-admin users', async () => {
		const response = await GET({
			locals: {
				supabase: createSupabase({ isAdmin: false }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.success).toBe(false);
		expect(payload.message).toContain('Admin access required');
	});
});
