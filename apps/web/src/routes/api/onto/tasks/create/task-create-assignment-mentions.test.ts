// apps/web/src/routes/api/onto/tasks/create/task-create-assignment-mentions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncTaskAssigneesMock = vi.fn();
const notifyTaskAssignmentAddedMock = vi.fn();
const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/services/ontology/task-event-sync.service', () => ({
	TaskEventSyncService: vi.fn().mockImplementation(() => ({
		syncTaskEvents: vi.fn()
	}))
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	ENTITY_TABLES: {
		project: 'onto_projects',
		plan: 'onto_plans',
		goal: 'onto_goals',
		milestone: 'onto_milestones',
		task: 'onto_tasks',
		document: 'onto_documents'
	},
	autoOrganizeConnections: vi.fn(),
	assertEntityRefsInProject: vi.fn(),
	toParentRefs: vi.fn(() => [])
}));

vi.mock('$lib/server/ontology-classification.service', () => ({
	classifyOntologyEntity: vi.fn()
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/server/task-assignment.service', () => ({
	TaskAssignmentValidationError: class TaskAssignmentValidationError extends Error {
		status: number;
		constructor(message: string, status = 400) {
			super(message);
			this.status = status;
		}
	},
	parseAssigneeActorIds: vi.fn(() => ({
		hasInput: true,
		assigneeActorIds: ['actor-assignee']
	})),
	validateAssigneesAreProjectEligible: vi.fn(async () => {}),
	syncTaskAssignees: syncTaskAssigneesMock,
	notifyTaskAssignmentAdded: notifyTaskAssignmentAddedMock,
	fetchTaskAssigneesMap: vi.fn(async () => new Map()),
	attachAssigneesToTask: vi.fn((task: Record<string, unknown>) => ({
		...task,
		assignees: []
	}))
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

class QueryBuilderMock {
	private action: 'select' | 'insert' | null = null;
	private insertPayload: Record<string, unknown> | null = null;

	constructor(private readonly table: string) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	async single() {
		if (this.table === 'onto_projects' && this.action === 'select') {
			return {
				data: {
					id: 'project-1',
					name: 'Project One',
					created_by: 'actor-owner'
				},
				error: null
			};
		}

		if (this.table === 'onto_tasks' && this.action === 'insert') {
			return {
				data: {
					id: 'task-1',
					project_id: this.insertPayload?.project_id,
					title: this.insertPayload?.title,
					description: this.insertPayload?.description,
					type_key: 'task.default',
					state_key: this.insertPayload?.state_key ?? 'todo',
					priority: this.insertPayload?.priority ?? 3
				},
				error: null
			};
		}

		return { data: null, error: null };
	}
}

function createSupabaseMock() {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-current', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table)
	};
}

describe('POST /api/onto/tasks/create assignment + mention coalescing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		syncTaskAssigneesMock.mockResolvedValue({ addedActorIds: ['actor-assignee'] });
		notifyTaskAssignmentAddedMock.mockResolvedValue({ recipientUserIds: ['user-assignee'] });
		resolveEntityMentionUserIdsMock.mockResolvedValue(['user-assignee', 'user-mentioned']);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: ['user-mentioned'] });
	});

	it('coalesces overlapping mention recipients into assignment notifications', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('http://localhost/api/onto/tasks/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					title: 'Task with mention',
					description: '[[user:user-assignee|Sam]] [[user:user-mentioned|Jo]]'
				})
			}),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(201);
		expect(syncTaskAssigneesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				taskId: 'task-1',
				assignedByActorId: 'actor-current'
			})
		);
		expect(notifyTaskAssignmentAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				addedAssigneeActorIds: ['actor-assignee'],
				coalescedMentionUserIds: ['user-assignee', 'user-mentioned']
			})
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				mentionedUserIds: ['user-assignee', 'user-mentioned'],
				skipUserIds: ['user-assignee']
			})
		);
	});
});
