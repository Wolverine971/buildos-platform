// apps/web/src/routes/api/onto/projects/[id]/cleanup/undo/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectMemberAccess: vi.fn(),
	undoAutoAppliedCleanup: vi.fn(),
	refreshCleanupCard: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('$lib/config/project-loops', () => ({ PROJECT_LOOPS_ENABLED: true }));
vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));
vi.mock('$lib/server/project-cleanup-undo.service', () => ({
	undoAutoAppliedCleanup: mocks.undoAutoAppliedCleanup
}));
vi.mock('$lib/server/project-cleanup-decisions.service', () => ({
	refreshCleanupCard: mocks.refreshCleanupCard
}));
vi.mock('$lib/server/posthog', () => ({ captureServerEvent: mocks.captureServerEvent }));
vi.mock('$lib/server/background', () => ({ runAfterResponse: vi.fn() }));

import { POST } from './+server';

const userSupabase = { from: vi.fn() };
const view = { project_id: 'project-1', items: [], auto_applied: [] };

function call(body: unknown) {
	return POST({
		params: { id: 'project-1' },
		locals: { supabase: userSupabase },
		request: new Request('http://localhost/api/onto/projects/project-1/cleanup/undo', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireProjectMemberAccess.mockResolvedValue({
		ok: true,
		projectId: 'project-1',
		userId: 'user-1',
		actorId: 'actor-1'
	});
	mocks.refreshCleanupCard.mockResolvedValue(view);
});

describe('POST /api/onto/projects/[id]/cleanup/undo', () => {
	it('undoes as the member with write access and returns the fresh card', async () => {
		mocks.undoAutoAppliedCleanup.mockResolvedValue({
			ok: true,
			suggestion: { id: 'sug-1' },
			undoneSteps: 1
		});
		const response = await call({ suggestion_id: 'sug-1' });
		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data).toEqual({ ok: true, view });
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'project-1', requiredAccess: 'write' })
		);
		expect(mocks.undoAutoAppliedCleanup).toHaveBeenCalledWith({
			supabase: userSupabase,
			userId: 'user-1',
			actorId: 'actor-1',
			projectId: 'project-1',
			suggestionId: 'sug-1'
		});
		expect(mocks.refreshCleanupCard).toHaveBeenCalledWith('project-1');
	});

	it('maps refusals to API errors without resyncing for a clean refusal', async () => {
		mocks.undoAutoAppliedCleanup.mockResolvedValue({
			ok: false,
			status: 409,
			message: 'This change was already undone.'
		});
		const response = await call({ suggestion_id: 'sug-1' });
		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('already undone');
		expect(mocks.refreshCleanupCard).not.toHaveBeenCalled();
	});

	it('rejects a bad body and a reader without write access', async () => {
		// parseJsonRequest answers a schema failure with 422.
		expect((await call({ suggestion_id: '' })).status).toBe(422);
		expect((await call({ suggestion_id: 'sug-1', extra: true })).status).toBe(422);
		mocks.requireProjectMemberAccess.mockResolvedValueOnce({
			ok: false,
			response: new Response('no', { status: 403 })
		});
		expect((await call({ suggestion_id: 'sug-1' })).status).toBe(403);
		expect(mocks.undoAutoAppliedCleanup).not.toHaveBeenCalled();
	});
});
