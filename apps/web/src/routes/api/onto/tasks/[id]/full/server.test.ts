// apps/web/src/routes/api/onto/tasks/[id]/full/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveLinkedEntities: vi.fn(),
	fetchTaskAssigneesMap: vi.fn(),
	loadTaskDocumentSummaries: vi.fn(),
	logOntologyApiError: vi.fn()
}));

vi.mock('../../task-linked-helpers', () => ({
	resolveLinkedEntities: mocks.resolveLinkedEntities
}));

vi.mock('$lib/server/task-assignment.service', () => ({
	fetchTaskAssigneesMap: mocks.fetchTaskAssigneesMap,
	attachAssigneesToTask: (task: Record<string, unknown>) => ({ ...task, assignees: [] })
}));

vi.mock('$lib/server/task-document-summaries', () => ({
	loadTaskDocumentSummaries: mocks.loadTaskDocumentSummaries
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: mocks.logOntologyApiError
}));

import { GET } from './+server';

function request(search: string) {
	const single = vi.fn().mockResolvedValue({
		data: {
			id: 'task-1',
			project_id: 'project-1',
			title: 'Task',
			project: { id: 'project-1', name: 'Project' }
		},
		error: null
	});
	const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), single };
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.is.mockReturnValue(query);
	const rpc = vi
		.fn()
		.mockResolvedValueOnce({ data: 'actor-1', error: null })
		.mockResolvedValueOnce({ data: true, error: null });
	const locals = {
		safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
		supabase: { rpc, from: vi.fn().mockReturnValue(query) }
	};
	return {
		query,
		response: GET({
			params: { id: 'task-1' },
			locals,
			url: new URL(`http://localhost/api/onto/tasks/task-1/full${search}`)
		} as never)
	};
}

describe('GET /api/onto/tasks/[id]/full', () => {
	beforeEach(() => {
		mocks.resolveLinkedEntities.mockReset().mockResolvedValue(null);
		mocks.fetchTaskAssigneesMap.mockReset().mockResolvedValue(new Map());
		mocks.loadTaskDocumentSummaries
			.mockReset()
			.mockResolvedValue([
				{ id: 'doc-1', title: 'Notes', state_key: 'draft', type_key: null }
			]);
		mocks.logOntologyApiError.mockReset().mockResolvedValue(undefined);
	});

	it("includes the task's doc list when the reader asks, in the same response", async () => {
		const { query, response } = request('?include_linked=false&include_task_documents=true');
		const body = await (await response).json();

		expect(body.data.task_documents).toEqual([
			{ id: 'doc-1', title: 'Notes', state_key: 'draft', type_key: null }
		]);
		expect(mocks.loadTaskDocumentSummaries).toHaveBeenCalledWith(expect.anything(), {
			taskId: 'task-1',
			projectId: 'project-1'
		});
		expect(query.select.mock.calls[0]?.[0]).not.toContain('*');
	});

	it('leaves the doc list out for callers that do not ask', async () => {
		const { response } = request('?include_linked=false');
		const body = await (await response).json();

		expect(body.data.task_documents).toBeUndefined();
		expect(mocks.loadTaskDocumentSummaries).not.toHaveBeenCalled();
	});

	it('still returns the task when the doc list fails', async () => {
		mocks.loadTaskDocumentSummaries.mockRejectedValue(new Error('edges down'));
		const { response } = request('?include_linked=false&include_task_documents=true');
		const result = await response;
		const body = await result.json();

		expect(result.status).toBe(200);
		expect(body.data.task.id).toBe('task-1');
		expect(body.data.task_documents).toBeUndefined();
	});
});
