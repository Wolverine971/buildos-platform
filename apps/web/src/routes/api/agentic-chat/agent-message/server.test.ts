import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mockGenerateText = vi.fn();
const mockLogError = vi.fn();

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(() => ({
		generateText: mockGenerateText
	}))
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logError: mockLogError
		}))
	}
}));

vi.mock('$lib/services/agentic-chat/prompts/actionable-insight-agent', () => ({
	buildActionableInsightSystemPrompt: vi.fn(() => 'system-prompt')
}));

type MockSupabaseOptions = {
	actorData?: unknown;
	actorError?: unknown;
	accessData?: unknown;
	accessError?: unknown;
	projectData?: unknown;
	projectError?: unknown;
};

function createSupabase(options: MockSupabaseOptions = {}) {
	const {
		actorData = 'actor-1',
		actorError = null,
		accessData = true,
		accessError = null,
		projectData = { id: 'project-1', name: 'Project', props: { description: 'desc' } },
		projectError = null
	} = options;

	const projectQuery = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: projectData, error: projectError })
	};

	return {
		rpc: vi.fn().mockImplementation((fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return Promise.resolve({ data: actorData, error: actorError });
			}
			if (fn === 'current_actor_has_project_access') {
				return Promise.resolve({ data: accessData, error: accessError });
			}
			return Promise.resolve({ data: null, error: null });
		}),
		from: vi.fn().mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return projectQuery;
			}
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createEvent(params: { body: string; supabase: ReturnType<typeof createSupabase> }) {
	return {
		request: new Request('http://localhost/api/agentic-chat/agent-message', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: params.body
		}),
		locals: {
			supabase: params.supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as RequestEvent;
}

describe('POST /api/agentic-chat/agent-message', () => {
	beforeEach(() => {
		mockGenerateText.mockReset();
		mockLogError.mockReset();
	});

	it('logs invalid JSON parse failures', async () => {
		const { POST } = await import('./+server');
		const response = await POST(
			createEvent({
				body: '{"goal":"test"',
				supabase: createSupabase()
			})
		);

		expect(response.status).toBe(400);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				operationType: 'agent_message_parse',
				endpoint: '/api/agentic-chat/agent-message',
				httpMethod: 'POST',
				userId: 'user-1'
			}),
			'warning'
		);
	});

	it('logs actor resolution failures', async () => {
		const { POST } = await import('./+server');
		const response = await POST(
			createEvent({
				body: JSON.stringify({
					goal: 'Ship feature',
					projectId: 'project-1',
					agentId: 'actionable_insight_agent'
				}),
				supabase: createSupabase({
					actorData: null,
					actorError: { message: 'actor missing', code: 'P0001' }
				})
			})
		);

		expect(response.status).toBe(500);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				operationType: 'agent_message_actor_resolution',
				projectId: 'project-1',
				userId: 'user-1'
			}),
			undefined
		);
	});

	it('logs LLM generation failures', async () => {
		mockGenerateText.mockRejectedValueOnce(new Error('LLM unavailable'));

		const { POST } = await import('./+server');
		const response = await POST(
			createEvent({
				body: JSON.stringify({
					goal: 'Ship feature',
					projectId: 'project-1',
					agentId: 'actionable_insight_agent',
					history: [{ role: 'agent', content: 'test' }]
				}),
				supabase: createSupabase()
			})
		);

		expect(response.status).toBe(500);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				operationType: 'agent_message_generate',
				projectId: 'project-1',
				userId: 'user-1'
			}),
			undefined
		);
	});
});
