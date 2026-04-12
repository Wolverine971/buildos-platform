// apps/web/src/lib/server/agent-call/agent-call-service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	AgentCallSessionRecord,
	ExternalAgentCallerRecord,
	UserBuildosAgentRecord
} from '@buildos/shared-types';
import { BUILDOS_AGENT_READ_OPS } from '@buildos/shared-types';

const authenticateExternalAgentCallerMock = vi.fn();
const resolveCalleeForCallerMock = vi.fn();
const ensureActorIdMock = vi.fn();
const fetchProjectSummariesMock = vi.fn();
const executeBuildosAgentGatewayToolMock = vi.fn();
const getBuildosAgentGatewayToolsMock = vi.fn();

vi.mock('./caller-auth', () => ({
	AgentCallAuthError: class AgentCallAuthError extends Error {
		constructor(
			message: string,
			public readonly status = 401,
			public readonly code = -32001,
			public readonly data?: unknown
		) {
			super(message);
		}
	},
	authenticateExternalAgentCaller: authenticateExternalAgentCallerMock
}));

vi.mock('./callee-resolution', () => ({
	AgentCallCalleeError: class AgentCallCalleeError extends Error {
		constructor(
			message: string,
			public readonly status = 403,
			public readonly code = -32004,
			public readonly reason = 'callee_not_allowed'
		) {
			super(message);
		}
	},
	resolveCalleeForCaller: resolveCalleeForCallerMock
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

vi.mock('./external-tool-gateway', () => ({
	executeBuildosAgentGatewayTool: executeBuildosAgentGatewayToolMock,
	getBuildosAgentGatewayTools: getBuildosAgentGatewayToolsMock
}));

type SessionState = {
	sessions: Record<string, AgentCallSessionRecord>;
	nextId: number;
};

class AgentCallSessionsQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private filters = new Map<string, unknown>();
	private insertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;

	constructor(private readonly state: SessionState) {}

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
		this.filters.set(field, value);
		return this;
	}

	maybeSingle() {
		return Promise.resolve(this.executeSingle(false));
	}

	single() {
		return Promise.resolve(this.executeSingle(true));
	}

	private applyFilters(rows: AgentCallSessionRecord[]): AgentCallSessionRecord[] {
		return rows.filter((row) =>
			Array.from(this.filters.entries()).every(
				([field, value]) => row[field as keyof AgentCallSessionRecord] === value
			)
		);
	}

	private executeSingle(requireRow: boolean) {
		if (this.action === 'insert' && this.insertPayload) {
			const id = `00000000-0000-0000-0000-${String(this.state.nextId).padStart(12, '0')}`;
			this.state.nextId += 1;
			const now = '2026-04-28T00:00:00.000Z';
			const row: AgentCallSessionRecord = {
				id,
				user_id: String(this.insertPayload.user_id),
				user_buildos_agent_id: String(this.insertPayload.user_buildos_agent_id),
				external_agent_caller_id: String(this.insertPayload.external_agent_caller_id),
				direction: this.insertPayload.direction as AgentCallSessionRecord['direction'],
				status: this.insertPayload.status as AgentCallSessionRecord['status'],
				requested_scope: (this.insertPayload.requested_scope ?? {}) as Record<
					string,
					unknown
				>,
				granted_scope: (this.insertPayload.granted_scope ?? {}) as Record<string, unknown>,
				rejection_reason:
					typeof this.insertPayload.rejection_reason === 'string'
						? this.insertPayload.rejection_reason
						: null,
				started_at: now,
				ended_at:
					typeof this.insertPayload.ended_at === 'string'
						? this.insertPayload.ended_at
						: null,
				metadata: (this.insertPayload.metadata ?? {}) as Record<string, unknown>,
				updated_at: now
			};
			this.state.sessions[id] = row;
			return { data: row, error: null };
		}

		if (this.action === 'update' && this.updatePayload) {
			const matches = this.applyFilters(Object.values(this.state.sessions));
			const updated = matches[0];

			if (!updated) {
				return { data: null, error: requireRow ? new Error('Row not found') : null };
			}

			const row: AgentCallSessionRecord = {
				...updated,
				...(this.updatePayload as Partial<AgentCallSessionRecord>),
				updated_at: '2026-04-28T00:01:00.000Z'
			};
			this.state.sessions[row.id] = row;

			return { data: row, error: null };
		}

		const matches = this.applyFilters(Object.values(this.state.sessions));
		return { data: matches[0] ?? null, error: null };
	}
}

function createAdminMock(state: SessionState) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'agent_call_sessions') {
				return new AgentCallSessionsQueryBuilderMock(state);
			}

			throw new Error(`Unexpected table ${table}`);
		})
	};
}

function createCaller(
	overrides: Partial<ExternalAgentCallerRecord> = {}
): ExternalAgentCallerRecord {
	return {
		id: '11111111-1111-1111-1111-111111111111',
		user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		provider: 'openclaw',
		caller_key: 'openclaw:workspace:test',
		token_prefix: 'ocw_',
		token_hash: 'hash',
		status: 'trusted',
		policy: {},
		metadata: {},
		last_used_at: null,
		created_at: '2026-04-28T00:00:00.000Z',
		updated_at: '2026-04-28T00:00:00.000Z',
		...overrides
	};
}

function createBuildosAgent(
	overrides: Partial<UserBuildosAgentRecord> = {}
): UserBuildosAgentRecord {
	return {
		id: '22222222-2222-2222-2222-222222222222',
		user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		agent_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		status: 'active',
		default_policy: {},
		metadata: {},
		created_at: '2026-04-28T00:00:00.000Z',
		updated_at: '2026-04-28T00:00:00.000Z',
		...overrides
	};
}

function createSessionRow(overrides: Partial<AgentCallSessionRecord> = {}): AgentCallSessionRecord {
	return {
		id: '33333333-3333-3333-3333-333333333333',
		user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		user_buildos_agent_id: '22222222-2222-2222-2222-222222222222',
		external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
		direction: 'inbound',
		status: 'accepted',
		requested_scope: { mode: 'read_only' },
		granted_scope: {
			mode: 'read_only',
			project_ids: ['44444444-4444-4444-4444-444444444444'],
			allowed_ops: [...BUILDOS_AGENT_READ_OPS]
		},
		rejection_reason: null,
		started_at: '2026-04-28T00:00:00.000Z',
		ended_at: null,
		metadata: {},
		updated_at: '2026-04-28T00:00:00.000Z',
		...overrides
	};
}

describe('BuildosAgentCallService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authenticateExternalAgentCallerMock.mockResolvedValue(createCaller());
		resolveCalleeForCallerMock.mockResolvedValue(createBuildosAgent());
		ensureActorIdMock.mockResolvedValue('actor-1');
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Project One'
			}
		]);
		getBuildosAgentGatewayToolsMock.mockReturnValue([
			{
				name: 'tool_schema',
				description: 'Inspect a BuildOS tool schema.',
				inputSchema: { type: 'object', properties: { op: { type: 'string' } } }
			},
			{
				name: 'list_onto_projects',
				description: 'List visible BuildOS projects.',
				inputSchema: { type: 'object', properties: {} }
			}
		]);
		executeBuildosAgentGatewayToolMock.mockResolvedValue({
			ok: true
		});
	});

	it('accepts a call and persists the granted project scope', async () => {
		const state: SessionState = { sessions: {}, nextId: 1 };
		const admin = createAdminMock(state);
		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.dial(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				callee_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				requested_scope: {
					mode: 'read_only',
					project_ids: ['44444444-4444-4444-4444-444444444444']
				}
			}
		);

		expect(response.call.status).toBe('accepted');
		expect(response.call).toMatchObject({
			callee_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			granted_scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			}
		});
		expect(Object.values(state.sessions)).toHaveLength(1);
		expect(Object.values(state.sessions)[0]).toMatchObject({
			status: 'accepted',
			granted_scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			}
		});
	});

	it('rejects a call when the requested project is outside the granted scope', async () => {
		const state: SessionState = { sessions: {}, nextId: 1 };
		const admin = createAdminMock(state);
		authenticateExternalAgentCallerMock.mockResolvedValue(
			createCaller({
				policy: {
					allowed_project_ids: ['44444444-4444-4444-4444-444444444444']
				}
			})
		);

		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.dial(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				callee_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				requested_scope: {
					mode: 'read_only',
					project_ids: ['55555555-5555-5555-5555-555555555555']
				}
			}
		);

		expect(response.call).toEqual({
			id: '00000000-0000-0000-0000-000000000001',
			status: 'rejected',
			reason: 'scope_not_allowed',
			details: expect.objectContaining({
				disallowed_project_ids: ['55555555-5555-5555-5555-555555555555']
			})
		});
		expect(Object.values(state.sessions)[0]).toMatchObject({
			status: 'rejected',
			rejection_reason: 'scope_not_allowed'
		});
	});

	it('reports the effective project intersection in scope rejection details', async () => {
		const state: SessionState = { sessions: {}, nextId: 1 };
		const admin = createAdminMock(state);
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Project One'
			},
			{
				id: '55555555-5555-5555-5555-555555555555',
				name: 'Project Two'
			}
		]);
		authenticateExternalAgentCallerMock.mockResolvedValue(
			createCaller({
				policy: {
					allowed_project_ids: ['44444444-4444-4444-4444-444444444444']
				}
			})
		);
		resolveCalleeForCallerMock.mockResolvedValue(
			createBuildosAgent({
				default_policy: {
					allowed_project_ids: ['55555555-5555-5555-5555-555555555555']
				}
			})
		);

		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.dial(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				callee_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				requested_scope: {
					mode: 'read_only'
				}
			}
		);

		expect(response.call).toMatchObject({
			status: 'rejected',
			reason: 'scope_not_allowed',
			details: expect.objectContaining({
				allowed_project_ids: []
			})
		});
	});

	it('rejects a read_write call when the caller token is read only', async () => {
		const state: SessionState = { sessions: {}, nextId: 1 };
		const admin = createAdminMock(state);
		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.dial(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				callee_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				requested_scope: {
					mode: 'read_write'
				}
			}
		);

		expect(response.call).toEqual({
			id: '00000000-0000-0000-0000-000000000001',
			status: 'rejected',
			reason: 'scope_not_allowed',
			details: expect.objectContaining({
				max_scope_mode: 'read_only',
				requested_scope: expect.objectContaining({ mode: 'read_write' })
			})
		});
	});

	it('grants read_write when caller and agent policy allow it', async () => {
		const state: SessionState = { sessions: {}, nextId: 1 };
		const admin = createAdminMock(state);
		authenticateExternalAgentCallerMock.mockResolvedValue(
			createCaller({
				policy: {
					scope_mode: 'read_write',
					allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create', 'onto.task.update']
				}
			})
		);
		resolveCalleeForCallerMock.mockResolvedValue(
			createBuildosAgent({
				default_policy: {
					scope_mode: 'read_write',
					allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
				}
			})
		);

		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.dial(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				callee_handle: 'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				requested_scope: {
					mode: 'read_write'
				}
			}
		);

		expect(response.call).toMatchObject({
			status: 'accepted',
			granted_scope: {
				mode: 'read_write',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			}
		});
	});

	it('activates an accepted session when listing tools', async () => {
		const state: SessionState = {
			sessions: {
				'33333333-3333-3333-3333-333333333333': createSessionRow()
			},
			nextId: 1
		};
		const admin = createAdminMock(state);
		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.listTools(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				call_id: '33333333-3333-3333-3333-333333333333'
			}
		);

		expect(response.tools).toHaveLength(2);
		expect(state.sessions['33333333-3333-3333-3333-333333333333']?.status).toBe('active');
	});

	it('executes a direct BuildOS tool against an active session', async () => {
		const state: SessionState = {
			sessions: {
				'33333333-3333-3333-3333-333333333333': createSessionRow({
					status: 'active'
				})
			},
			nextId: 1
		};
		const admin = createAdminMock(state);
		const { BuildosAgentCallService } = await import('./agent-call-service');
		const service = new BuildosAgentCallService(admin);

		const response = await service.callTool(
			new Request('https://example.com', {
				headers: { authorization: 'Bearer token' }
			}),
			{
				call_id: '33333333-3333-3333-3333-333333333333',
				name: 'list_onto_projects',
				arguments: {
					limit: 10
				}
			}
		);

		expect(executeBuildosAgentGatewayToolMock).toHaveBeenCalledWith({
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '33333333-3333-3333-3333-333333333333',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'list_onto_projects',
			arguments: {
				limit: 10
			}
		});
		expect(response.structuredContent).toEqual({ ok: true });
		expect(response.content[0]?.type).toBe('text');
	});
});
