// apps/web/src/routes/api/onto/projects/[id]/suggestions/[suggestion_id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectMemberAccess: vi.fn(),
	decideProjectSuggestion: vi.fn(),
	decideProjectSuggestionWithClarification: vi.fn()
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('$lib/server/project-suggestion-actions.service', () => ({
	decideProjectSuggestion: mocks.decideProjectSuggestion
}));

vi.mock('$lib/server/clarified-decision.service', () => ({
	decideProjectSuggestionWithClarification: mocks.decideProjectSuggestionWithClarification
}));

import { POST } from './+server';

const access = {
	ok: true,
	projectId: 'project-1',
	userId: 'user-1',
	actorId: 'actor-1'
};

function request(body: Record<string, unknown>) {
	return new Request('http://localhost/api/test', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function callPost(body: Record<string, unknown>) {
	return POST({
		params: { id: 'project-1', suggestion_id: 'suggestion-1' },
		locals: { supabase: { from: vi.fn() } },
		request: request(body)
	} as any);
}

describe('POST /api/onto/projects/[id]/suggestions/[suggestion_id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue(access);
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'applied' },
			result: { ok: true, applied_operations: 1 }
		});
		mocks.decideProjectSuggestionWithClarification.mockResolvedValue({
			ok: true,
			suggestion: { id: 'suggestion-1', status: 'delegated' },
			agent_run_id: 'agent-run-1',
			delegated: true
		});
	});

	it('uses the clarified-decision flow when clarification is supplied', async () => {
		const response = await callPost({
			action: 'approve',
			clarification: 'Apply this, but keep the existing launch task.'
		});
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			agent_run_id: 'agent-run-1',
			delegated: true
		});
		expect(mocks.decideProjectSuggestionWithClarification).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				projectId: 'project-1',
				suggestionId: 'suggestion-1',
				action: 'approve',
				clarification: 'Apply this, but keep the existing launch task.'
			})
		);
		expect(mocks.decideProjectSuggestion).not.toHaveBeenCalled();
	});

	it('keeps the direct decision path when no clarification is supplied', async () => {
		const response = await callPost({ action: 'dismiss', reason: 'not_relevant' });
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.result).toMatchObject({ ok: true, applied_operations: 1 });
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'dismiss',
				feedback: { reason: 'not_relevant', note: undefined }
			})
		);
		expect(mocks.decideProjectSuggestionWithClarification).not.toHaveBeenCalled();
	});
});
