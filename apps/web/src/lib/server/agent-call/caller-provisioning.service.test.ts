// apps/web/src/lib/server/agent-call/caller-provisioning.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalAgentCallerRecord, UserBuildosAgentRecord } from '@buildos/shared-types';

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

function createAdminMock(state: State) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'external_agent_callers') {
				return new ExternalAgentCallersQueryBuilderMock(state);
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
		const state: State = { callerRows: [] };
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
			allowed_project_ids: ['44444444-4444-4444-4444-444444444444']
		});
		expect(response.credentials.auth_scheme).toBe('Bearer');
		expect(response.credentials.bearer_token.startsWith('boca_')).toBe(true);
		expect(hashAgentCallerTokenMock).toHaveBeenCalledWith(response.credentials.bearer_token);
	});

	it('rejects provisioning when allowed projects are outside the user workspace', async () => {
		const state: State = { callerRows: [] };
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
		const state: State = { callerRows: [] };
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
			]
		};
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(createAdminMock(state));

		const response = await service.listForUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

		expect(response.callers).toEqual([
			expect.objectContaining({
				provider: 'openclaw',
				caller_key: 'openclaw:workspace:test',
				token_prefix: 'boca_123456'
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
			]
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
});
