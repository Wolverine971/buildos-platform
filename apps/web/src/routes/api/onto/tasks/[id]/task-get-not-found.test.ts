// apps/web/src/routes/api/onto/tasks/[id]/task-get-not-found.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logOntologyApiErrorMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: logOntologyApiErrorMock
}));

vi.mock('$lib/server/task-assignment.service', () => ({
	TaskAssignmentValidationError: class TaskAssignmentValidationError extends Error {
		status = 400;
	},
	parseAssigneeActorIds: vi.fn(() => ({ hasInput: false, assigneeActorIds: [] })),
	validateAssigneesAreProjectEligible: vi.fn(async () => {}),
	syncTaskAssignees: vi.fn(async () => ({ addedActorIds: [] })),
	notifyTaskAssignmentAdded: vi.fn(async () => ({ recipientUserIds: [] })),
	fetchTaskAssigneesMap: vi.fn(async () => new Map()),
	attachAssigneesToTask: vi.fn((task: Record<string, unknown>) => ({
		...task,
		assignees: []
	}))
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn(async () => ({ notifiedUserIds: [] }))
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	ENTITY_TABLES: {},
	assertEntityRefsInProject: vi.fn(),
	prepareRelationshipMutationPlan: vi.fn(),
	relationshipMutationErrorFromDatabase: vi.fn(() => null),
	toParentRefs: vi.fn(() => [])
}));

function createSupabaseMock(taskResult: { data: unknown; error: unknown }) {
	const maybeSingle = vi.fn(async () => taskResult);
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		maybeSingle
	};

	return {
		maybeSingle,
		supabase: {
			rpc: vi.fn(async (fn: string) => {
				if (fn === 'ensure_actor_for_user') {
					return { data: 'actor-1', error: null };
				}
				return { data: null, error: null };
			}),
			from: vi.fn(() => query)
		}
	};
}

describe('GET /api/onto/tasks/[id] not-found behavior', () => {
	beforeEach(() => {
		logOntologyApiErrorMock.mockReset();
	});

	it('returns 404 without logging a database error when the task is absent', async () => {
		const { supabase, maybeSingle } = createSupabaseMock({ data: null, error: null });
		const { GET } = await import('./+server');
		const taskId = 'f544b10d-c28f-4309-8952-18cefc33be8a';

		const response = await GET({
			params: { id: taskId },
			request: new Request(`http://localhost/api/onto/tasks/${taskId}`),
			locals: {
				supabase,
				safeGetSession: async () => ({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(404);
		expect(maybeSingle).toHaveBeenCalledOnce();
		expect(logOntologyApiErrorMock).not.toHaveBeenCalled();
	});

	it('still logs and returns 500 for an actual database failure', async () => {
		const databaseError = {
			code: 'XX000',
			message: 'database unavailable',
			details: null,
			hint: null
		};
		const { supabase } = createSupabaseMock({ data: null, error: databaseError });
		const { GET } = await import('./+server');

		const response = await GET({
			params: { id: 'f544b10d-c28f-4309-8952-18cefc33be8a' },
			request: new Request('http://localhost/api/onto/tasks/test'),
			locals: {
				supabase,
				safeGetSession: async () => ({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(500);
		expect(logOntologyApiErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({ error: databaseError, operation: 'task_fetch' })
		);
	});
});
