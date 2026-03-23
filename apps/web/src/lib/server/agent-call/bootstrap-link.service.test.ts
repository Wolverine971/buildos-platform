// apps/web/src/lib/server/agent-call/bootstrap-link.service.test.ts
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	AgentCallBootstrapLinkRecord,
	ExternalAgentCallerRecord,
	UserBuildosAgentRecord
} from '@buildos/shared-types';

const ensureUserBuildosAgentMock = vi.fn();

vi.mock('./callee-resolution', () => ({
	ensureUserBuildosAgent: ensureUserBuildosAgentMock
}));

type State = {
	callerRows: ExternalAgentCallerRecord[];
	bootstrapRows: AgentCallBootstrapLinkRecord[];
};

class ExternalAgentCallersQueryBuilderMock {
	private filters = new Map<string, unknown>();

	constructor(private readonly state: State) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.set(field, value);
		return this;
	}

	maybeSingle() {
		const row =
			this.state.callerRows.find((entry) =>
				Array.from(this.filters.entries()).every(
					([field, value]) => entry[field as keyof ExternalAgentCallerRecord] === value
				)
			) ?? null;

		return Promise.resolve({ data: row, error: null });
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

function createAdminMock(state: State) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'external_agent_callers') {
				return new ExternalAgentCallersQueryBuilderMock(state);
			}

			if (table === 'agent_call_bootstrap_links') {
				return new AgentCallBootstrapLinksQueryBuilderMock(state);
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
		token_prefix: 'boca_123456',
		token_hash: 'hashed-token',
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

describe('AgentCallBootstrapLinkService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureUserBuildosAgentMock.mockResolvedValue(createBuildosAgent());
	});

	it('creates a bootstrap link and returns a pasteable prompt', async () => {
		const state: State = {
			callerRows: [createCaller()],
			bootstrapRows: []
		};
		const { AgentCallBootstrapLinkService } = await import('./bootstrap-link.service');
		const service = new AgentCallBootstrapLinkService(createAdminMock(state));

		const response = await service.createBootstrap({
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			baseUrl: 'https://build-os.com',
			caller: createCaller(),
			bearerToken: 'boca_test_secret'
		});

		expect(response.instructions_url).toMatch(
			/^https:\/\/build-os\.com\/api\/agent-call\/bootstrap\/bocs_/
		);
		expect(response.paste_prompt).toContain(response.instructions_url);
		expect(state.bootstrapRows).toHaveLength(1);
		expect(state.bootstrapRows[0]?.payload).toMatchObject({
			bearer_token: 'boca_test_secret'
		});
	});

	it('loads a bootstrap document with env instructions and fallback call flow', async () => {
		const setupToken = 'bocs_test_token';
		const state: State = {
			callerRows: [createCaller()],
			bootstrapRows: [
				{
					id: '99999999-9999-9999-9999-999999999999',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
					setup_token_hash: createHash('sha256').update(setupToken).digest('hex'),
					payload: {
						bearer_token: 'boca_test_secret'
					},
					expires_at: '2099-04-28T00:00:00.000Z',
					last_accessed_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			]
		};
		const { AgentCallBootstrapLinkService, serializeBootstrapDocumentAsText } = await import(
			'./bootstrap-link.service'
		);
		const service = new AgentCallBootstrapLinkService(createAdminMock(state));

		const document = await service.loadBootstrapDocument({
			setupToken,
			baseUrl: 'https://build-os.com'
		});

		expect(document.buildos.agent_token).toBe('boca_test_secret');
		expect(document.buildos.dial_url).toBe('https://build-os.com/api/agent-call/buildos');
		expect(document.openclaw.env_block).toContain('BUILDOS_AGENT_TOKEN=boca_test_secret');
		expect(document.openclaw.setup_steps).toContain(
			'If no connector exists, use exec plus curl to POST to the BuildOS gateway.'
		);
		expect(serializeBootstrapDocumentAsText(document)).toContain(
			'BuildOS OpenClaw Bootstrap Instructions'
		);
		expect(state.bootstrapRows[0]?.last_accessed_at).toBeDefined();
	});
});
