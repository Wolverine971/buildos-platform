// apps/web/src/routes/api/onto/projects/[id]/logs/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { requireProjectMemberAccessMock, enrichLogsForDisplayMock } = vi.hoisted(() => ({
	requireProjectMemberAccessMock: vi.fn(),
	enrichLogsForDisplayMock: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: requireProjectMemberAccessMock
}));

vi.mock('$lib/server/project-logs-enrich', () => ({
	enrichLogsForDisplay: enrichLogsForDisplayMock
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function createLogsQuery() {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		neq: vi.fn(),
		order: vi.fn(),
		range: vi.fn()
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.neq.mockReturnValue(query);
	query.order.mockReturnValue(query);
	query.range.mockResolvedValue({
		data: [{ id: 'log-1', entity_type: 'document' }],
		error: null,
		count: 1
	});
	return query;
}

describe('GET /api/onto/projects/[id]/logs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireProjectMemberAccessMock.mockResolvedValue({
			ok: true,
			projectId: PROJECT_ID,
			userId: 'user-1',
			actorId: 'actor-1'
		});
		enrichLogsForDisplayMock.mockImplementation(async (_supabase, logs) => logs);
	});

	it('excludes structural edge rows before pagination and counting', async () => {
		const query = createLogsQuery();
		const supabase = { from: vi.fn(() => query) };
		const { GET } = await import('./+server');

		const response = await GET({
			params: { id: PROJECT_ID },
			url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/logs?limit=12&offset=0`),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(200);
		expect(query.neq).toHaveBeenCalledWith('entity_type', 'edge');
		expect(query.neq.mock.invocationCallOrder[0]).toBeLessThan(
			query.range.mock.invocationCallOrder[0]!
		);
	});
});
