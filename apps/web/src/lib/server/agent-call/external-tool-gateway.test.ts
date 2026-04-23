// apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILDOS_AGENT_READ_OPS } from '@buildos/shared-types';

const ensureActorIdMock = vi.fn();
const fetchProjectSummariesMock = vi.fn();
const logCreateAsyncMock = vi.fn();
const logUpdateAsyncMock = vi.fn();
const syncTaskEventsMock = vi.fn();
const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();
const addDocumentToTreeMock = vi.fn();
const createOrMergeDocumentVersionMock = vi.fn();

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: logCreateAsyncMock,
	logUpdateAsync: logUpdateAsyncMock
}));

vi.mock('$lib/services/ontology/task-event-sync.service', () => ({
	TaskEventSyncService: class TaskEventSyncService {
		syncTaskEvents = syncTaskEventsMock;
	}
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	addDocumentToTree: addDocumentToTreeMock
}));

vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: createOrMergeDocumentVersionMock,
	toDocumentSnapshot: (document: Record<string, unknown>) => ({
		title: typeof document.title === 'string' ? document.title : null,
		content: typeof document.content === 'string' ? document.content : null,
		description: typeof document.description === 'string' ? document.description : null,
		props:
			document.props && typeof document.props === 'object' && !Array.isArray(document.props)
				? (document.props as Record<string, unknown>)
				: {},
		state_key: typeof document.state_key === 'string' ? document.state_key : null,
		type_key: typeof document.type_key === 'string' ? document.type_key : null,
		project_id: typeof document.project_id === 'string' ? document.project_id : null
	})
}));

type DocumentRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	content: string | null;
	state_key: string;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	created_by?: string | null;
	children?: Record<string, unknown> | null;
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
	toolExecutions: Array<Record<string, unknown>>;
	nextTaskId: number;
	nextToolExecutionId: number;
};

class OntoDocumentsQueryBuilderMock {
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

	private matches(row: DocumentRow): boolean {
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

	private serialize(row: DocumentRow) {
		return {
			id: row.id,
			project_id: row.project_id,
			title: row.title,
			description: row.description,
			type_key: row.type_key,
			content: row.content,
			state_key: row.state_key,
			props: row.props,
			created_at: row.created_at,
			updated_at: row.updated_at,
			deleted_at: row.deleted_at,
			created_by: row.created_by ?? null,
			children: row.children ?? null
		};
	}

	maybeSingle() {
		const row = this.state.documents.find((document) => this.matches(document)) ?? null;

		return Promise.resolve({
			data: row ? this.serialize(row) : null,
			error: null
		});
	}

	single() {
		if (this.action === 'insert' && this.insertPayload) {
			const id = `66666666-6666-6666-6666-${String(this.state.documents.length + 1).padStart(12, '0')}`;
			const row: DocumentRow = {
				id,
				project_id: String(this.insertPayload.project_id),
				title: String(this.insertPayload.title),
				description:
					typeof this.insertPayload.description === 'string'
						? this.insertPayload.description
						: null,
				type_key: String(this.insertPayload.type_key),
				content:
					typeof this.insertPayload.content === 'string'
						? this.insertPayload.content
						: null,
				state_key: String(this.insertPayload.state_key),
				props:
					this.insertPayload.props &&
					typeof this.insertPayload.props === 'object' &&
					!Array.isArray(this.insertPayload.props)
						? (this.insertPayload.props as Record<string, unknown>)
						: {},
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z',
				deleted_at: null,
				created_by:
					typeof this.insertPayload.created_by === 'string'
						? this.insertPayload.created_by
						: null,
				children: null
			};
			this.state.documents.push(row);
			return Promise.resolve({ data: this.serialize(row), error: null });
		}

		if (this.action === 'update' && this.updatePayload) {
			const index = this.state.documents.findIndex((document) => this.matches(document));
			if (index < 0) {
				return Promise.resolve({ data: null, error: new Error('Document not found') });
			}

			const current = this.state.documents[index]!;
			const updated: DocumentRow = {
				...current,
				...(this.updatePayload as Partial<DocumentRow>),
				updated_at: '2026-04-28T00:05:00.000Z'
			};
			this.state.documents[index] = updated;
			return Promise.resolve({ data: this.serialize(updated), error: null });
		}

		const row = this.state.documents.find((document) => this.matches(document)) ?? null;
		return Promise.resolve({
			data: row ? this.serialize(row) : null,
			error: row ? null : new Error('Document not found')
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

class AgentCallToolExecutionsQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private filters = new Map<string, unknown>();
	private insertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private rowLimit: number | null = null;
	private shouldReturnSelection = false;

	constructor(private readonly state: State) {}

	select() {
		this.shouldReturnSelection = true;
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
		this.filters.set(field, value);
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	maybeSingle() {
		return Promise.resolve(this.executeSingle(false));
	}

	single() {
		return Promise.resolve(this.executeSingle(true));
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown> | null;
					error: any;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeSingle(false)).then(onfulfilled, onrejected);
	}

	private matches(row: Record<string, unknown>): boolean {
		return Array.from(this.filters.entries()).every(([field, value]) => row[field] === value);
	}

	private executeSingle(requireRow: boolean) {
		if (this.action === 'insert' && this.insertPayload) {
			const idempotencyKey = this.insertPayload.idempotency_key;
			if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
				const duplicate = this.state.toolExecutions.find(
					(row) =>
						row.external_agent_caller_id ===
							this.insertPayload?.external_agent_caller_id &&
						row.op === this.insertPayload?.op &&
						row.idempotency_key === idempotencyKey &&
						(row.status === 'pending' || row.status === 'succeeded')
				);
				if (duplicate) {
					return {
						data: null,
						error: {
							code: '23505',
							message: 'duplicate key value violates unique constraint'
						}
					};
				}
			}

			const id = `99999999-9999-9999-9999-${String(this.state.nextToolExecutionId).padStart(12, '0')}`;
			this.state.nextToolExecutionId += 1;
			const now = '2026-04-28T00:00:00.000Z';
			const row = {
				id,
				agent_call_session_id: String(this.insertPayload.agent_call_session_id),
				external_agent_caller_id: String(this.insertPayload.external_agent_caller_id),
				user_id: String(this.insertPayload.user_id),
				op: String(this.insertPayload.op),
				idempotency_key:
					typeof this.insertPayload.idempotency_key === 'string'
						? this.insertPayload.idempotency_key
						: null,
				status:
					typeof this.insertPayload.status === 'string'
						? this.insertPayload.status
						: 'pending',
				args: ((this.insertPayload.args ?? {}) as Record<string, unknown>) ?? {},
				response_payload:
					this.insertPayload.response_payload &&
					typeof this.insertPayload.response_payload === 'object'
						? (this.insertPayload.response_payload as Record<string, unknown>)
						: null,
				error_payload:
					this.insertPayload.error_payload &&
					typeof this.insertPayload.error_payload === 'object'
						? (this.insertPayload.error_payload as Record<string, unknown>)
						: null,
				entity_kind:
					typeof this.insertPayload.entity_kind === 'string'
						? this.insertPayload.entity_kind
						: null,
				entity_id:
					typeof this.insertPayload.entity_id === 'string'
						? this.insertPayload.entity_id
						: null,
				started_at:
					typeof this.insertPayload.started_at === 'string'
						? this.insertPayload.started_at
						: now,
				completed_at:
					typeof this.insertPayload.completed_at === 'string'
						? this.insertPayload.completed_at
						: null,
				created_at: now,
				updated_at:
					typeof this.insertPayload.updated_at === 'string'
						? this.insertPayload.updated_at
						: now
			};
			this.state.toolExecutions.push(row);
			return { data: this.shouldReturnSelection ? row : null, error: null };
		}

		if (this.action === 'update' && this.updatePayload) {
			const index = this.state.toolExecutions.findIndex((row) => this.matches(row));
			if (index < 0) {
				return { data: null, error: requireRow ? new Error('Execution not found') : null };
			}

			const updated = {
				...this.state.toolExecutions[index],
				...this.updatePayload
			};
			this.state.toolExecutions[index] = updated;
			return { data: this.shouldReturnSelection ? updated : null, error: null };
		}

		let rows = this.state.toolExecutions.filter((row) => this.matches(row));
		if (this.orderBy) {
			rows = [...rows].sort((a, b) => {
				const left = String(a[this.orderBy?.field] ?? '');
				const right = String(b[this.orderBy?.field] ?? '');
				return this.orderBy?.ascending
					? left.localeCompare(right)
					: right.localeCompare(left);
			});
		}
		if (typeof this.rowLimit === 'number') {
			rows = rows.slice(0, this.rowLimit);
		}

		return {
			data: rows[0] ?? null,
			error: rows[0] || !requireRow ? null : new Error('Row not found')
		};
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

			if (table === 'agent_call_tool_executions') {
				return new AgentCallToolExecutionsQueryBuilderMock(state);
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
		addDocumentToTreeMock.mockResolvedValue({ version: 2, root: [] });
		createOrMergeDocumentVersionMock.mockResolvedValue({
			status: 'created',
			versionNumber: 1,
			versionId: 'version-1'
		});
		resolveEntityMentionUserIdsMock.mockResolvedValue([]);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: [] });
		syncTaskEventsMock.mockResolvedValue(undefined);
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
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			}
		]);
	});

	it('returns discovery tools plus scoped direct tools for external callers', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
		});

		expect(tools.map((tool) => tool.name)).toEqual(
			expect.arrayContaining([
				'skill_load',
				'tool_search',
				'tool_schema',
				'list_onto_projects',
				'search_onto_projects',
				'get_onto_project_details',
				'list_onto_tasks',
				'search_onto_tasks',
				'get_onto_task_details',
				'list_onto_documents',
				'search_onto_documents',
				'get_onto_document_details',
				'search_ontology',
				'create_onto_task'
			])
		);
		expect(tools.map((tool) => tool.name)).not.toContain('update_onto_task');
	});

	it('returns only discovery helpers when no scoped direct ops are available', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: []
		});

		expect(tools.map((tool) => tool.name)).toEqual([
			'skill_load',
			'tool_search',
			'tool_schema'
		]);
	});

	it('returns direct tool metadata from tool_schema', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'tool_schema',
			arguments: { op: 'onto.task.list', include_schema: true }
		});

		expect(result).toMatchObject({
			type: 'tool_schema',
			op: 'onto.task.list',
			tool_name: 'list_onto_tasks',
			callable_tool: 'list_onto_tasks',
			example_tool_call: {
				name: 'list_onto_tasks'
			}
		});
	});

	it('returns FORBIDDEN for direct write tools outside the granted scope', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'create_onto_task',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Write something'
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

	it('creates a task through a direct tool when read_write access is granted', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Draft launch checklist',
				state_key: 'todo'
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
		expect(state.tasks[0]?.type_key).toBe('task.default');
		expect(syncTaskEventsMock).toHaveBeenCalledTimes(1);
		expect(logCreateAsyncMock).toHaveBeenCalledTimes(1);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledTimes(1);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('exposes placement and legacy content aliases on external document create tools', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
		});
		const createDocumentTool = tools.find((tool) => tool.name === 'create_onto_document');

		expect(createDocumentTool?.inputSchema).toMatchObject({
			properties: {
				body_markdown: expect.any(Object),
				parent_document_id: expect.any(Object),
				parent_id: expect.any(Object),
				position: expect.any(Object)
			}
		});
	});

	it('exposes content strategy fields on external document update tools', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
		});
		const updateDocumentTool = tools.find((tool) => tool.name === 'update_onto_document');

		expect(updateDocumentTool?.inputSchema).toMatchObject({
			properties: {
				body_markdown: expect.any(Object),
				update_strategy: expect.any(Object),
				merge_instructions: expect.any(Object)
			}
		});
	});

	it('creates a document through a direct tool and places it in the doc tree', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		const parentDocumentId = '99999999-9999-9999-9999-999999999999';

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
			},
			toolName: 'create_onto_document',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Launch brief',
				description: 'External agent brief',
				body_markdown: '# Brief',
				parent_document_id: parentDocumentId,
				position: 2
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.create',
			ok: true,
			result: {
				document: {
					title: 'Launch brief',
					project_name: 'Allowed Project'
				},
				structure: {
					version: 2,
					root: []
				},
				structure_error: null
			}
		});
		expect(state.documents).toHaveLength(1);
		expect(state.documents[0]?.props).toMatchObject({
			origin: 'external_agent',
			body_markdown: '# Brief'
		});
		expect(createOrMergeDocumentVersionMock).toHaveBeenCalledTimes(1);
		expect(addDocumentToTreeMock).toHaveBeenCalledWith(
			expect.anything(),
			'44444444-4444-4444-4444-444444444444',
			state.documents[0]?.id,
			{
				parentId: parentDocumentId,
				position: 2,
				title: 'Launch brief',
				description: 'External agent brief'
			},
			'actor-1'
		);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('accepts parent_id as a legacy alias for external document creates', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		const parentDocumentId = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
			},
			toolName: 'create_onto_document',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Alias test',
				description: 'Uses parent_id',
				parent_id: parentDocumentId
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.create',
			ok: true
		});
		expect(addDocumentToTreeMock).toHaveBeenCalledWith(
			expect.anything(),
			'44444444-4444-4444-4444-444444444444',
			state.documents[0]?.id,
			{
				parentId: parentDocumentId,
				position: undefined,
				title: 'Alias test',
				description: 'Uses parent_id'
			},
			'actor-1'
		);
	});

	it('appends content through external document updates and keeps body_markdown in props', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing doc',
					description: 'Doc summary',
					type_key: 'document.context.project',
					content: '# Existing',
					state_key: 'draft',
					props: { body_markdown: '# Existing', origin: 'external_agent' },
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
			},
			toolName: 'update_onto_document',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555',
				body_markdown: '## Update',
				update_strategy: 'append'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.update',
			ok: true,
			result: {
				document: {
					id: '55555555-5555-5555-5555-555555555555',
					content: '# Existing\n\n## Update'
				}
			}
		});
		expect(state.documents[0]?.content).toBe('# Existing\n\n## Update');
		expect(state.documents[0]?.props).toMatchObject({
			body_markdown: '# Existing\n\n## Update',
			origin: 'external_agent'
		});
		expect(createOrMergeDocumentVersionMock).toHaveBeenCalledTimes(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('rejects append document updates without content on the external gateway', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing doc',
					description: 'Doc summary',
					type_key: 'document.context.project',
					content: '# Existing',
					state_key: 'draft',
					props: { body_markdown: '# Existing', origin: 'external_agent' },
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
			},
			toolName: 'update_onto_document',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555',
				update_strategy: 'append',
				merge_instructions: 'Append under progress.'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.update',
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'update_onto_document append requires non-empty content.'
			}
		});
		expect(state.documents[0]?.content).toBe('# Existing');
	});

	it('updates a task through a direct tool when read_write access is granted', async () => {
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
			toolExecutions: [],
			nextTaskId: 2,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.update']
			},
			toolName: 'update_onto_task',
			arguments: {
				task_id: '55555555-5555-5555-5555-555555555555',
				state_key: 'done',
				title: 'Existing task (done)'
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
		expect(syncTaskEventsMock).toHaveBeenCalledTimes(1);
		expect(logUpdateAsyncMock).toHaveBeenCalledTimes(1);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledTimes(1);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('normalizes blank task descriptions to null on external writes', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Whitespace description',
				description: '   '
			}
		});

		expect(state.tasks[0]?.description).toBeNull();
	});

	it('replays a prior idempotent write response instead of duplicating the task', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		const request = {
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write' as const,
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task' as const,
			arguments: {
				idempotency_key: 'task-create-1',
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Idempotent task'
			}
		};

		const first = await executeBuildosAgentGatewayTool(request);
		const second = await executeBuildosAgentGatewayTool(request);

		expect(first).toMatchObject({ ok: true });
		expect(second).toMatchObject({
			ok: true,
			meta: {
				replayed: true
			}
		});
		expect(state.tasks).toHaveLength(1);
		expect(state.toolExecutions).toHaveLength(1);
	});

	it('returns CONFLICT when a matching idempotent write is still pending', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [
				{
					id: '99999999-9999-9999-9999-000000000001',
					agent_call_session_id: '22222222-2222-2222-2222-222222222222',
					external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					op: 'onto.task.create',
					idempotency_key: 'task-create-pending',
					status: 'pending',
					args: {},
					response_payload: null,
					error_payload: null,
					entity_kind: null,
					entity_id: null,
					started_at: '2026-04-28T00:00:00.000Z',
					completed_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			],
			nextTaskId: 1,
			nextToolExecutionId: 2
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task',
			arguments: {
				idempotency_key: 'task-create-pending',
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Pending task'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.create',
			ok: false,
			error: {
				code: 'CONFLICT'
			}
		});
		expect(state.tasks).toHaveLength(0);
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
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'get_onto_document_details',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.get',
			ok: false,
			error: {
				code: 'NOT_FOUND',
				message: 'Document not found'
			}
		});
	});
});
