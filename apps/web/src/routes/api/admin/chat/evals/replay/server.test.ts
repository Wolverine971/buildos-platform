// apps/web/src/routes/api/admin/chat/evals/replay/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replayAndEvaluatePromptScenarioMock } = vi.hoisted(() => ({
	replayAndEvaluatePromptScenarioMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-v2/prompt-replay-runner', () => ({
	replayAndEvaluatePromptScenario: replayAndEvaluatePromptScenarioMock
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

describe('POST /api/admin/chat/evals/replay', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		replayAndEvaluatePromptScenarioMock.mockResolvedValue({
			scenario: {
				slug: 'project.named_status',
				version: '1',
				title: 'Named Project Status Overview',
				description: 'Uses the project overview lane.',
				category: 'overview'
			},
			replayRequest: {
				message: "What's going on with 9takes?",
				contextType: 'global'
			},
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			sessionId: 'session-1',
			turnRun: {
				id: 'turn-run-1',
				session_id: 'session-1',
				source: 'admin_replay'
			},
			streamSummary: {
				sessionId: 'session-1',
				assistantText: 'I checked 9takes.',
				errorMessages: [],
				finishedReason: 'stop',
				eventTypes: ['session', 'text_delta', 'done']
			},
			eval: {
				evalRun: { id: 'eval-1', status: 'passed' },
				assertions: [
					{ id: 'assert-1', assertion_key: 'first_lane_matches', status: 'passed' }
				],
				result: {
					summary: {
						assertion_counts: {
							passed: 4,
							failed: 0
						}
					}
				}
			}
		});
	});

	it('replays and evaluates a scenario for admin users', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/evals/replay', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scenario_slug: 'project.named_status' })
			}),
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			},
			fetch: vi.fn()
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(replayAndEvaluatePromptScenarioMock).toHaveBeenCalledWith(
			expect.objectContaining({
				scenarioSlug: 'project.named_status',
				userId: 'admin-1',
				source: 'admin_replay'
			})
		);
		expect(payload.data.turn_run).toMatchObject({
			id: 'turn-run-1'
		});
		expect(payload.data.eval_run).toMatchObject({
			id: 'eval-1',
			status: 'passed'
		});
	});

	it('rejects missing scenario slugs', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/evals/replay', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({})
			}),
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			},
			fetch: vi.fn()
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.success).toBe(false);
		expect(payload.message).toContain('scenario_slug is required');
	});
});
