// apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILDOS_AGENT_READ_OPS } from '@buildos/shared-types';

const ensureActorIdMock = vi.fn();
const fetchProjectSummariesMock = vi.fn();

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

type DocumentRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	content: string;
	state_key: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

type TaskRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	state_key: string;
	priority: number | null;
	start_at: string | null;
	due_at: string | null;
	completed_at: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	created_by?: string | null;
};

type State = {
	documents: DocumentRow[];
	tasks: TaskRow[];
	nextTaskId: number;
};

class OntoDocumentsQueryBuilderMock {
	private idFilter: string | null = null;
	private projectIdsFilter: string[] | null = null;
	private deletedAtFilterApplied = false;

	constructor(private readonly state: State) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}

		return this;
	}

	in(field: string, value: unknown) {
		if (field === 'project_id' && Array.isArray(value)) {
			this.projectIdsFilter = value.filter(
				(entry): entry is string => typeof entry === 'string'
			);
		}

		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}

		return this;
	}

	maybeSingle() {
		const row =
			this.state.documents.find((document) => {
				if (this.idFilter !== null && document.id !== this.idFilter) {
					return false;
				}

				if (
					this.projectIdsFilter !== null &&
					!this.projectIdsFilter.includes(document.project_id)
				) {
					return false;
				}

				if (this.deletedAtFilterApplied && document.deleted_at !== null) {
					return false;
				}

				return true;
			}) ?? null;

		return Promise.resolve({
			data: row
				? {
						id: row.id,
						project_id: row.project_id,
						title: row.title,
						description: row.description,
						type_key: row.type_key,
						content: row.content,
						state_key: row.state_key,
						created_at: row.created_at,
						updated_at: row.updated_at
					}
				: null,
			error: null
		});
	}
}

class OntoTasksQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private idFilter: string | null = null;
	private projectIdsFilter: string[] | null = null;
	private deletedAtFilterApplied = false;
	private insertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;

	constructor(private readonly state: State) {}

	select() {
		if (!this.action) {
			this.action = 'select';
		}

		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}

		return this;
	}

	in(field: string, value: unknown) {
		if (field === 'project_id' && Array.isArray(value)) {
			this.projectIdsFilter = value.filter(
				(entry): entry is string => typeof entry === 'string'
			);
		}

		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}

		return this;
	}

	private matches(row: TaskRow): boolean {
		if (this.idFilter !== null && row.id !== this.idFilter) {
			return false;
		}

		if (this.projectIdsFilter !== null && !this.projectIdsFilter.includes(row.project_id)) {
			return false;
		}

		if (this.deletedAtFilterApplied && row.deleted_at !== null) {
			return false;
		}

		return true;
	}

	maybeSingle() {
		const row = this.state.tasks.find((task) => this.matches(task)) ?? null;
		return Promise.resolve({ data: row, error: null });
	}

	single() {
		if (this.action === 'insert' && this.insertPayload) {
			const id = `77777777-7777-7777-7777-${String(this.state.nextTaskId).padStart(12, '0')}`;
			this.state.nextTaskId += 1;
			const row: TaskRow = {
				id,
				project_id: String(this.insertPayload.project_id),
				title: String(this.insertPayload.title),
				description:
					typeof this.insertPayload.description === 'string'
						? this.insertPayload.description
						: null,
				type_key: String(this.insertPayload.type_key),
				state_key: String(this.insertPayload.state_key),
				priority:
					typeof this.insertPayload.priority === 'number'
						? this.insertPayload.priority
						: null,
				start_at:
					typeof this.insertPayload.start_at === 'string'
						? this.insertPayload.start_at
						: null,
				due_at:
					typeof this.insertPayload.due_at === 'string'
						? this.insertPayload.due_at
						: null,
				completed_at:
					typeof this.insertPayload.completed_at === 'string'
						? this.insertPayload.completed_at
						: null,
				props: ((this.insertPayload.props ?? {}) as Record<string, unknown>) ?? {},
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z',
				deleted_at: null,
				created_by:
					typeof this.insertPayload.created_by === 'string'
						? this.insertPayload.created_by
						: null
			};
			this.state.tasks.push(row);
			return Promise.resolve({ data: row, error: null });
		}

		if (this.action === 'update' && this.updatePayload) {
			const index = this.state.tasks.findIndex((task) => this.matches(task));
			if (index < 0) {
				return Promise.resolve({ data: null, error: new Error('Task not found') });
			}

			const current = this.state.tasks[index]!;
			const updated: TaskRow = {
				...current,
				...(this.updatePayload as Partial<TaskRow>),
				updated_at: '2026-04-28T00:05:00.000Z'
			};
			this.state.tasks[index] = updated;
			return Promise.resolve({ data: updated, error: null });
		}

		const row = this.state.tasks.find((task) => this.matches(task)) ?? null;
		return Promise.resolve({
			data: row,
			error: row ? null : new Error('Task not found')
		});
	}
}

function createAdminMock(state: State) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_documents') {
				return new OntoDocumentsQueryBuilderMock(state);
			}

			if (table === 'onto_tasks') {
				return new OntoTasksQueryBuilderMock(state);
			}

			throw new Error(`Unexpected table ${table}`);
		}),
		rpc: vi.fn()
	};
}

describe('external tool gateway', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-1');
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Allowed Project',
				description: 'Main workspace',
				type_key: 'project.internal',
				state_key: 'active',
				updated_at: '2026-04-28T00:00:00.000Z',
				task_count: 7,
				goal_count: 1,
				plan_count: 2,
				document_count: 4,
				access_role: 'owner',
				access_level: 'write'
			}
		]);
	});

	it('returns only gateway primitives for external tools', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
		});

		expect(tools.map((tool) => tool.name)).toEqual(['tool_help', 'tool_exec']);
	});

	it('returns filtered root help instead of the flat public tool list', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({ documents: [], tasks: [], nextTaskId: 1 }),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'tool_help',
			arguments: { path: 'root' }
		});

		expect(result.type).toBe('directory');
		expect(result.path).toBe('root');
		expect(JSON.stringify(result)).not.toContain('list_projects');
		expect(JSON.stringify(result)).toContain('onto.task');
		expect(JSON.stringify(result)).not.toContain('onto.task.update');
	});

	it('returns FORBIDDEN for write ops outside the granted scope', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({ documents: [], tasks: [], nextTaskId: 1 }),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'tool_exec',
			arguments: {
				op: 'onto.task.create',
				args: {
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Write something'
				}
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.create',
			ok: false,
			error: {
				code: 'FORBIDDEN',
				details: {
					granted_scope_mode: 'read_only',
					required_scope_mode: 'read_write'
				}
			}
		});
	});

	it('creates a task through tool_exec when read_write access is granted', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = { documents: [], tasks: [], nextTaskId: 1 };

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'tool_exec',
			arguments: {
				op: 'onto.task.create',
				args: {
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Draft launch checklist',
					state_key: 'todo'
				}
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.create',
			ok: true,
			result: {
				task: {
					title: 'Draft launch checklist',
					project_name: 'Allowed Project'
				}
			}
		});
		expect(state.tasks).toHaveLength(1);
		expect(state.tasks[0]?.created_by).toBe('actor-1');
	});

	it('updates a task through tool_exec when read_write access is granted', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing task',
					description: 'Old description',
					type_key: 'task.execute',
					state_key: 'todo',
					priority: 3,
					start_at: null,
					due_at: null,
					completed_at: null,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null
				}
			],
			nextTaskId: 2
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_write',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.update']
			},
			toolName: 'tool_exec',
			arguments: {
				op: 'onto.task.update',
				args: {
					task_id: '55555555-5555-5555-5555-555555555555',
					state_key: 'done',
					title: 'Existing task (done)'
				}
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.update',
			ok: true,
			result: {
				task: {
					id: '55555555-5555-5555-5555-555555555555',
					state_key: 'done',
					title: 'Existing task (done)'
				}
			}
		});
		expect(state.tasks[0]?.state_key).toBe('done');
		expect(state.tasks[0]?.completed_at).toBeTruthy();
	});

	it('does not reveal the existence of scoped-out documents through canonical ops', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [
					{
						id: '55555555-5555-5555-5555-555555555555',
						project_id: '66666666-6666-6666-6666-666666666666',
						title: 'Hidden Doc',
						description: null,
						type_key: 'document.context.project',
						content: 'Top secret',
						state_key: 'active',
						created_at: '2026-04-28T00:00:00.000Z',
						updated_at: '2026-04-28T00:00:00.000Z',
						deleted_at: null
					}
				],
				tasks: [],
				nextTaskId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'tool_exec',
			arguments: {
				op: 'onto.document.get',
				args: {
					document_id: '55555555-5555-5555-5555-555555555555'
				}
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.get',
			ok: false,
			error: {
				code: 'INTERNAL',
				message: 'Document not found'
			}
		});
	});
});
