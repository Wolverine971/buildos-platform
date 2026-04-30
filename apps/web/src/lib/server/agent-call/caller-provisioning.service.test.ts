// apps/web/src/lib/server/agent-call/caller-provisioning.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	AgentCallBootstrapLinkRecord,
	ExternalAgentCallerRecord,
	UserBuildosAgentRecord
} from '@buildos/shared-types';
import { BUILDOS_AGENT_READ_OPS } from '@buildos/shared-types';

const ensureUserBuildosAgentMock = vi.fn();
const ensureActorIdMock = vi.fn();
const fetchProjectSummariesMock = vi.fn();
const hashAgentCallerTokenMock = vi.fn();

vi.mock('./callee-resolution', () => ({
	ensureUserBuildosAgent: ensureUserBuildosAgentMock
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

vi.mock('./caller-auth', () => ({
	hashAgentCallerToken: hashAgentCallerTokenMock
}));

type State = {
	callerRows: ExternalAgentCallerRecord[];
	bootstrapRows: AgentCallBootstrapLinkRecord[];
	sessionRows?: Array<Record<string, unknown>>;
	executionRows?: Array<Record<string, unknown>>;
};

class ExternalAgentCallersQueryBuilderMock {
	private action: 'select' | 'upsert' | 'update' | null = null;
	private filters = new Map<string, unknown>();
	private upsertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;

	constructor(private readonly state: State) {}

	select() {
		if (!this.action) {
			this.action = 'select';
		}

		return this;
	}

	upsert(payload: Record<string, unknown>) {
		this.action = 'upsert';
		this.upsertPayload = payload;
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

	order() {
		return Promise.resolve({
			data: this.state.callerRows.filter((row) =>
				Array.from(this.filters.entries()).every(
					([field, value]) => row[field as keyof ExternalAgentCallerRecord] === value
				)
			),
			error: null
		});
	}

	single() {
		if (this.action === 'upsert' && this.upsertPayload) {
			const existingIndex = this.state.callerRows.findIndex(
				(row) =>
					row.user_id === this.upsertPayload?.user_id &&
					row.provider === this.upsertPayload?.provider &&
					row.caller_key === this.upsertPayload?.caller_key
			);

			const row: ExternalAgentCallerRecord = {
				id:
					existingIndex >= 0
						? this.state.callerRows[existingIndex]!.id
						: '11111111-1111-1111-1111-111111111111',
				user_id: String(this.upsertPayload.user_id),
				provider: String(this.upsertPayload.provider),
				caller_key: String(this.upsertPayload.caller_key),
				token_prefix: String(this.upsertPayload.token_prefix),
				token_hash: String(this.upsertPayload.token_hash),
				status: 'trusted',
				policy: (this.upsertPayload.policy ?? {}) as Record<string, unknown>,
				metadata: (this.upsertPayload.metadata ?? {}) as Record<string, unknown>,
				last_used_at: null,
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z'
			};

			if (existingIndex >= 0) {
				this.state.callerRows[existingIndex] = row;
			} else {
				this.state.callerRows.push(row);
			}

			return Promise.resolve({ data: row, error: null });
		}

		return Promise.resolve({ data: null, error: null });
	}

	maybeSingle() {
		if (this.action === 'update' && this.updatePayload) {
			const existingIndex = this.state.callerRows.findIndex((row) =>
				Array.from(this.filters.entries()).every(
					([field, value]) => row[field as keyof ExternalAgentCallerRecord] === value
				)
			);

			if (existingIndex < 0) {
				return Promise.resolve({ data: null, error: null });
			}

			const current = this.state.callerRows[existingIndex]!;
			const row: ExternalAgentCallerRecord = {
				...current,
				...(this.updatePayload as Partial<ExternalAgentCallerRecord>)
			};
			this.state.callerRows[existingIndex] = row;
			return Promise.resolve({ data: row, error: null });
		}

		return Promise.resolve({ data: null, error: null });
	}
}

class AgentCallBootstrapLinksQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | 'delete' | null = null;
	private filters = new Map<string, unknown>();
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

	delete() {
		this.action = 'delete';
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.set(field, value);
		return this;
	}

	maybeSingle() {
		if (this.action === 'select') {
			const row =
				this.state.bootstrapRows.find((entry) =>
					Array.from(this.filters.entries()).every(
						([field, value]) =>
							entry[field as keyof AgentCallBootstrapLinkRecord] === value
					)
				) ?? null;

			return Promise.resolve({ data: row, error: null });
		}

		return Promise.resolve({ data: null, error: null });
	}

	then(resolve: (value: { data: unknown; error: null }) => unknown) {
		if (this.action === 'delete') {
			this.state.bootstrapRows = this.state.bootstrapRows.filter(
				(entry) =>
					!Array.from(this.filters.entries()).every(
						([field, value]) =>
							entry[field as keyof AgentCallBootstrapLinkRecord] === value
					)
			);

			return Promise.resolve(resolve({ data: null, error: null }));
		}

		if (this.action === 'insert' && this.insertPayload) {
			this.state.bootstrapRows.push({
				id: '99999999-9999-9999-9999-999999999999',
				user_id: String(this.insertPayload.user_id),
				external_agent_caller_id: String(this.insertPayload.external_agent_caller_id),
				setup_token_hash: String(this.insertPayload.setup_token_hash),
				payload: (this.insertPayload.payload ?? {}) as Record<string, unknown>,
				expires_at: String(this.insertPayload.expires_at),
				last_accessed_at: null,
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z'
			});

			return Promise.resolve(resolve({ data: null, error: null }));
		}

		if (this.action === 'update' && this.updatePayload) {
			const row = this.state.bootstrapRows.find((entry) =>
				Array.from(this.filters.entries()).every(
					([field, value]) => entry[field as keyof AgentCallBootstrapLinkRecord] === value
				)
			);

			if (row) {
				Object.assign(row, this.updatePayload);
			}
		}

		return Promise.resolve(resolve({ data: null, error: null }));
	}
}

class AgentCallUsageQueryBuilderMock {
	private filters = new Map<string, unknown>();
	private inFilters = new Map<string, unknown[]>();
	private rowLimit: number | null = null;

	constructor(private readonly rows: Array<Record<string, unknown>>) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.set(field, value);
		return this;
	}

	in(field: string, values: unknown[]) {
		this.inFilters.set(field, values);
		return this;
	}

	order() {
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
		let rows = this.rows.filter((row) =>
			Array.from(this.filters.entries()).every(([field, value]) => row[field] === value)
		);

		rows = rows.filter((row) =>
			Array.from(this.inFilters.entries()).every(([field, values]) =>
				values.includes(row[field])
			)
		);

		if (this.rowLimit !== null) {
			rows = rows.slice(0, this.rowLimit);
		}

		return Promise.resolve(resolve({ data: rows, error: null }));
	}
}

function createAdminMock(state: State) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'external_agent_callers') {
				return new ExternalAgentCallersQueryBuilderMock(state);
			}

			if (table === 'agent_call_bootstrap_links') {
				return new AgentCallBootstrapLinksQueryBuilderMock(state);
			}

			if (table === 'agent_call_sessions') {
				return new AgentCallUsageQueryBuilderMock(state.sessionRows ?? []);
			}

			if (table === 'agent_call_tool_executions') {
				return new AgentCallUsageQueryBuilderMock(state.executionRows ?? []);
			}

			throw new Error(`Unexpected table ${table}`);
		})
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

describe('CallerProvisioningService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureUserBuildosAgentMock.mockResolvedValue(createBuildosAgent());
		ensureActorIdMock.mockResolvedValue('actor-1');
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Project One'
			}
		]);
		hashAgentCallerTokenMock.mockReturnValue('hashed-token');
	});

	it('provisions a trusted caller and returns bearer credentials', async () => {
		const state: State = { callerRows: [], bootstrapRows: [] };
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.provisionForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
			provider: 'openclaw',
			caller_key: 'openclaw:workspace:test',
			allowed_project_ids: ['44444444-4444-4444-4444-444444444444'],
			metadata: { workspace_name: 'Test Workspace' }
		});

		expect(response.buildos_agent.handle).toBe(
			'buildos:user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		);
		expect(response.caller).toMatchObject({
			provider: 'openclaw',
			caller_key: 'openclaw:workspace:test',
			status: 'trusted',
			scope_mode: 'read_only',
			allowed_ops: BUILDOS_AGENT_READ_OPS,
			allowed_project_ids: ['44444444-4444-4444-4444-444444444444']
		});
		expect(response.credentials.auth_scheme).toBe('Bearer');
		expect(response.credentials.bearer_token.startsWith('boca_')).toBe(true);
		expect(hashAgentCallerTokenMock).toHaveBeenCalledWith(response.credentials.bearer_token);
	});

	it('rejects provisioning when allowed projects are outside the user workspace', async () => {
		const state: State = { callerRows: [], bootstrapRows: [] };
		const { CallerProvisioningService, CallerProvisioningError } = await import(
			'./caller-provisioning.service'
		);
		const service = new CallerProvisioningService(createAdminMock(state));

		await expect(
			service.provisionForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
				provider: 'openclaw',
				caller_key: 'openclaw:workspace:test',
				allowed_project_ids: ['55555555-5555-5555-5555-555555555555']
			})
		).rejects.toBeInstanceOf(CallerProvisioningError);
	});

	it('rejects provisioning when provider is not a safe slug', async () => {
		const state: State = { callerRows: [], bootstrapRows: [] };
		const { CallerProvisioningService, CallerProvisioningError } = await import(
			'./caller-provisioning.service'
		);
		const service = new CallerProvisioningService(createAdminMock(state));

		await expect(
			service.provisionForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
				provider: 'OpenClaw Main',
				caller_key: 'openclaw:workspace:test'
			})
		).rejects.toBeInstanceOf(CallerProvisioningError);
	});

	it('rejects write ops when the caller scope is read only', async () => {
		const state: State = { callerRows: [], bootstrapRows: [] };
		const { CallerProvisioningService, CallerProvisioningError } = await import(
			'./caller-provisioning.service'
		);
		const service = new CallerProvisioningService(createAdminMock(state));

		await expect(
			service.provisionForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
				provider: 'openclaw',
				caller_key: 'openclaw:workspace:test',
				scope_mode: 'read_only',
				allowed_ops: ['onto.task.update']
			})
		).rejects.toBeInstanceOf(CallerProvisioningError);
	});

	it('provisions read_write callers with explicit allowed ops', async () => {
		const state: State = { callerRows: [], bootstrapRows: [] };
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.provisionForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
			provider: 'openclaw',
			caller_key: 'openclaw:workspace:test',
			scope_mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create', 'onto.task.update']
		});

		expect(response.caller.scope_mode).toBe('read_write');
		expect(response.caller.allowed_ops).toEqual([
			...BUILDOS_AGENT_READ_OPS,
			'onto.task.create',
			'onto.task.update'
		]);
	});

	it('lists existing callers without returning bearer tokens', async () => {
		const state: State = {
			callerRows: [
				{
					id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					provider: 'openclaw',
					caller_key: 'openclaw:workspace:test',
					token_prefix: 'boca_123456',
					token_hash: 'hashed-token',
					status: 'trusted',
					policy: {
						allowed_project_ids: ['44444444-4444-4444-4444-444444444444']
					},
					metadata: {},
					last_used_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			],
			bootstrapRows: []
		};
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.listForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

		expect(response.callers).toEqual([
			expect.objectContaining({
				provider: 'openclaw',
				caller_key: 'openclaw:workspace:test',
				token_prefix: 'boca_123456',
				scope_mode: 'read_only',
				allowed_ops: BUILDOS_AGENT_READ_OPS
			})
		]);
		expect(response.available_projects).toEqual([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Project One',
				description: null
			}
		]);
		expect(JSON.stringify(response)).not.toContain('bearer_token');
	});

	it('includes usage summaries and recent write activity for callers', async () => {
		const state: State = {
			callerRows: [
				{
					id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					provider: 'openclaw',
					caller_key: 'openclaw:workspace:test',
					token_prefix: 'boca_123456',
					token_hash: 'hashed-token',
					status: 'trusted',
					policy: {},
					metadata: {},
					last_used_at: '2026-04-28T00:05:00.000Z',
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			],
			bootstrapRows: [],
			sessionRows: [
				{
					id: '22222222-2222-2222-2222-222222222222',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
					status: 'active',
					started_at: new Date().toISOString(),
					ended_at: null,
					updated_at: new Date().toISOString()
				}
			],
			executionRows: [
				{
					id: '33333333-3333-3333-3333-333333333333',
					agent_call_session_id: '22222222-2222-2222-2222-222222222222',
					external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					op: 'onto.task.create',
					status: 'succeeded',
					args: {
						project_id: '44444444-4444-4444-4444-444444444444',
						title: 'Draft launch plan'
					},
					response_payload: {
						result: {
							task: {
								id: '55555555-5555-5555-5555-555555555555',
								project_id: '44444444-4444-4444-4444-444444444444',
								project_name: 'Project One',
								title: 'Draft launch plan'
							}
						}
					},
					error_payload: null,
					entity_kind: 'task',
					entity_id: '55555555-5555-5555-5555-555555555555',
					started_at: new Date().toISOString(),
					completed_at: new Date().toISOString(),
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			]
		};
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.listForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

		expect(response.callers[0]?.usage).toMatchObject({
			total_session_count: 1,
			total_write_count: 1,
			successful_write_count: 1,
			project_count: 1
		});
		expect(response.callers[0]?.usage?.recent_activity[0]).toMatchObject({
			op: 'onto.task.create',
			action: 'created',
			status: 'succeeded',
			project_name: 'Project One',
			entity_kind: 'task',
			entity_title: 'Draft launch plan'
		});
		expect(
			response.callers[0]?.usage?.trends.find((trend) => trend.period === 'day')
		).toMatchObject({
			session_count: 1,
			write_count: 1,
			successful_write_count: 1,
			project_count: 1
		});
	});

	it('marks stored caller project scopes that are no longer visible to the user', async () => {
		const state: State = {
			callerRows: [
				{
					id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					provider: 'openclaw',
					caller_key: 'openclaw:workspace:test',
					token_prefix: 'boca_123456',
					token_hash: 'hashed-token',
					status: 'trusted',
					policy: {
						allowed_project_ids: [
							'44444444-4444-4444-4444-444444444444',
							'55555555-5555-5555-5555-555555555555'
						]
					},
					metadata: {},
					last_used_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			],
			bootstrapRows: []
		};
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.listForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

		expect(response.callers[0]).toMatchObject({
			allowed_project_ids: ['44444444-4444-4444-4444-444444444444'],
			unavailable_project_count: 1
		});
	});

	it('revokes a caller for the user', async () => {
		const state: State = {
			callerRows: [
				{
					id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					provider: 'openclaw',
					caller_key: 'openclaw:workspace:test',
					token_prefix: 'boca_123456',
					token_hash: 'hashed-token',
					status: 'trusted',
					policy: {},
					metadata: {},
					last_used_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			],
			bootstrapRows: []
		};
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.revokeForUser(
			'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			'11111111-1111-1111-1111-111111111111'
		);

		expect(response.caller.status).toBe('revoked');
		expect(state.callerRows[0]?.status).toBe('revoked');
	});

	it('returns a bootstrap setup prompt and URL when a base URL is provided', async () => {
		const state: State = { callerRows: [], bootstrapRows: [] };
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.provisionForUser(
			'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			{
				provider: 'openclaw',
				caller_key: 'openclaw:workspace:test',
				metadata: { installation_name: 'Test Workspace' }
			},
			{
				baseUrl: 'https://build-os.com'
			}
		);

		expect(response.bootstrap?.instructions_url).toMatch(
			/^https:\/\/build-os\.com\/api\/agent-call\/bootstrap\/bocs_/
		);
		expect(response.bootstrap?.paste_prompt).toContain(
			response.bootstrap?.instructions_url ?? ''
		);
		expect(state.bootstrapRows).toHaveLength(1);
		expect(state.bootstrapRows[0]?.payload).toMatchObject({
			bearer_token: response.credentials.bearer_token
		});
	});
});
