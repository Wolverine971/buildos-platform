// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import {
	buildPreparedPromptKey,
	buildPreparedPromptSurface,
	type PreparedPromptRow
} from './prepared-prompt-cache';
import {
	consumePreparedPrompt,
	inspectPreparedPromptAdmissionLineage,
	inspectPreparedPromptForWorkerAdmission
} from './prepared-prompt-consumer.server';

type QueryResult = {
	data: unknown;
	error: unknown;
};

function tool(name: string, description: string): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	};
}

function buildPreparedPromptRow(params: {
	tools: ChatToolDefinition[];
	overrides?: Partial<PreparedPromptRow>;
}): { key: string; row: PreparedPromptRow } {
	const id = params.overrides?.id ?? '11111111-1111-4111-8111-111111111111';
	const createdAt = params.overrides?.created_at ?? new Date(Date.now() - 5_000).toISOString();
	const contextPayload = params.overrides?.context_payload ?? {
		contextType: 'global',
		data: {}
	};
	const conversationSummary = params.overrides?.conversation_summary ?? null;
	const { key, nonceSha256 } = buildPreparedPromptKey(id);
	const surface = buildPreparedPromptSurface({
		surfaceProfile: 'global_basic',
		contextType: 'global',
		contextPayload,
		conversationSummary,
		tools: params.tools,
		envelope: {
			promptVariant: 'lite',
			systemPrompt: 'System prompt',
			sections: [],
			contextInventory: null,
			toolsSummary: null
		} as any,
		createdAt
	});

	return {
		key,
		row: {
			id,
			user_id: 'user-1',
			session_id: 'session-1',
			cache_key: 'v2|global|none|none|none',
			context_type: 'global',
			context_payload: contextPayload,
			conversation_summary: conversationSummary,
			prepared_surfaces: {
				global_basic: surface
			},
			default_surface_profile: 'global_basic',
			prompt_variant: 'lite',
			history_for_model: [],
			history_compressed: false,
			history_strategy: 'raw_history',
			raw_history_count: 0,
			nonce_sha256: nonceSha256,
			expires_at: '2099-01-01T00:00:00.000Z',
			consumed_at: null,
			created_at: createdAt,
			updated_at: createdAt,
			...params.overrides
		} as PreparedPromptRow
	};
}

function createSupabaseMock(params: {
	row?: PreparedPromptRow | null;
	selectResult?: QueryResult;
	updateResult?: QueryResult;
	historyRows?: Array<{ id: string; created_at: string }>;
	historyResult?: QueryResult;
}) {
	const updatePatches: Record<string, unknown>[] = [];
	const builders: Array<{
		select: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		eq: ReturnType<typeof vi.fn>;
		is: ReturnType<typeof vi.fn>;
		order: ReturnType<typeof vi.fn>;
		limit: ReturnType<typeof vi.fn>;
		maybeSingle: ReturnType<typeof vi.fn>;
		then: ReturnType<typeof vi.fn>;
	}> = [];

	const from = vi.fn((table: string) => {
		if (table !== 'agentic_chat_prepared_prompts' && table !== 'chat_messages') {
			throw new Error(`Unexpected table: ${table}`);
		}
		let mode: 'select' | 'update' = 'select';
		let limitCount = 1;
		const builder = {
			select: vi.fn(() => builder),
			update: vi.fn((patch: Record<string, unknown>) => {
				mode = 'update';
				updatePatches.push(patch);
				return builder;
			}),
			eq: vi.fn(() => builder),
			is: vi.fn(() => builder),
			order: vi.fn(() => builder),
			limit: vi.fn((count: number) => {
				limitCount = count;
				return builder;
			}),
			maybeSingle: vi.fn(async () => {
				if (table === 'chat_messages') {
					return (
						params.historyResult ?? {
							data: params.historyRows?.[0] ?? null,
							error: null
						}
					);
				}
				if (mode === 'update') {
					return params.updateResult ?? { data: { id: params.row?.id }, error: null };
				}
				return params.selectResult ?? { data: params.row ?? null, error: null };
			}),
			then: vi.fn((onfulfilled) => {
				const result =
					table === 'chat_messages'
						? (params.historyResult ?? {
								data: (params.historyRows ?? []).slice(0, limitCount),
								error: null
							})
						: (params.selectResult ?? { data: params.row ?? null, error: null });
				return Promise.resolve(result).then(onfulfilled);
			})
		};
		builders.push(builder);
		return builder;
	});

	return {
		supabase: { from },
		from,
		updatePatches,
		builders
	};
}

describe('consumePreparedPrompt', () => {
	afterEach(() => {
		delete process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED;
	});

	it('returns missing_key without querying when key is absent', async () => {
		const mock = createSupabaseMock({});

		await expect(
			consumePreparedPrompt({
				supabase: mock.supabase as any,
				key: null,
				userId: 'user-1',
				sessionId: 'session-1',
				cacheKey: 'v2|global|none|none|none',
				surfaceProfile: 'global_basic',
				contextType: 'global',
				tools: []
			})
		).resolves.toEqual({ hit: false, reason: 'missing_key' });
		expect(mock.from).not.toHaveBeenCalled();
	});

	it('consumes a valid prepared prompt and marks it consumed', async () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const preparedPrompt = buildPreparedPromptRow({ tools });
		const mock = createSupabaseMock({ row: preparedPrompt.row });

		const result = await consumePreparedPrompt({
			supabase: mock.supabase as any,
			key: preparedPrompt.key,
			userId: 'user-1',
			sessionId: 'session-1',
			cacheKey: 'v2|global|none|none|none',
			surfaceProfile: 'global_basic',
			contextType: 'global',
			tools
		});

		expect(result.hit).toBe(true);
		if (!result.hit) return;
		expect(result.row.consumed_at).toEqual(expect.any(String));
		expect(result.surface.surface_profile).toBe('global_basic');
		expect(result.ageSeconds).toBeGreaterThanOrEqual(0);
		expect(mock.updatePatches).toEqual([
			{
				consumed_at: expect.any(String),
				updated_at: expect.any(String)
			}
		]);
	});

	it('rejects stale harness when tool definitions no longer match', async () => {
		const preparedTools = [tool('get_workspace_overview', 'Old description.')];
		const currentTools = [tool('get_workspace_overview', 'New description.')];
		const preparedPrompt = buildPreparedPromptRow({ tools: preparedTools });
		const mock = createSupabaseMock({ row: preparedPrompt.row });

		const result = await consumePreparedPrompt({
			supabase: mock.supabase as any,
			key: preparedPrompt.key,
			userId: 'user-1',
			sessionId: 'session-1',
			cacheKey: 'v2|global|none|none|none',
			surfaceProfile: 'global_basic',
			contextType: 'global',
			tools: currentTools
		});

		expect(result).toMatchObject({
			hit: false,
			reason: 'stale_harness',
			diagnostics: {
				prepared_prompt_id: preparedPrompt.row.id,
				requested_surface_profile: 'global_basic',
				default_surface_profile: 'global_basic',
				prepared_surface_profiles: ['global_basic'],
				surface_available: true,
				prepared_tool_names: ['get_workspace_overview'],
				actual_tool_names: ['get_workspace_overview'],
				harness_match: false,
				tool_names_match: true,
				tool_definitions_match: false
			}
		});
		if (result.hit) return;
		expect(result.diagnostics?.prepared_harness_sha256).toEqual(expect.any(String));
		expect(result.diagnostics?.actual_harness_sha256).toEqual(expect.any(String));
		expect(result.diagnostics?.prepared_tool_definitions_sha256).not.toBe(
			result.diagnostics?.actual_tool_definitions_sha256
		);
		expect(mock.updatePatches).toEqual([]);
	});

	it('inspects stable nonce-protected admission lineage without consuming the prompt', async () => {
		const preparedPrompt = buildPreparedPromptRow({
			tools: [],
			overrides: {
				consumed_at: '2026-07-31T11:00:00.000Z',
				expires_at: '2026-07-31T11:01:00.000Z'
			}
		});
		const mock = createSupabaseMock({ row: preparedPrompt.row });

		await expect(
			inspectPreparedPromptAdmissionLineage({
				supabase: mock.supabase as any,
				key: preparedPrompt.key,
				userId: 'user-1',
				sessionId: 'session-1',
				cacheKey: 'v2|global|none|none|none',
				surfaceProfile: 'global_basic'
			})
		).resolves.toEqual({
			id: preparedPrompt.row.id,
			acceptedSurfaceProfile: 'global_basic'
		});
		expect(mock.updatePatches).toEqual([]);
	});

	it('validates a worker prepared copy without claiming it', async () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const preparedPrompt = buildPreparedPromptRow({ tools });
		const mock = createSupabaseMock({ row: preparedPrompt.row });

		const result = await inspectPreparedPromptForWorkerAdmission({
			supabase: mock.supabase as any,
			key: preparedPrompt.key,
			userId: 'user-1',
			sessionId: 'session-1',
			cacheKey: 'v2|global|none|none|none',
			surfaceProfile: 'global_basic',
			contextType: 'global',
			tools
		});

		expect(result).toMatchObject({
			hit: true,
			row: { id: preparedPrompt.row.id },
			surface: { surface_profile: 'global_basic' }
		});
		expect(mock.updatePatches).toEqual([]);
		expect(mock.builders[0]?.update).not.toHaveBeenCalled();
	});

	it('rejects worker prepared history when a session message landed after prewarm', async () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const preparedPrompt = buildPreparedPromptRow({
			tools,
			overrides: { created_at: '2026-08-11T10:00:00.000Z' }
		});
		const mock = createSupabaseMock({
			row: preparedPrompt.row,
			historyRows: [
				{
					id: '22222222-2222-4222-8222-222222222222',
					created_at: '2026-08-11T10:00:01.000Z'
				}
			]
		});

		const result = await inspectPreparedPromptForWorkerAdmission({
			supabase: mock.supabase as any,
			key: preparedPrompt.key,
			userId: 'user-1',
			sessionId: 'session-1',
			cacheKey: 'v2|global|none|none|none',
			surfaceProfile: 'global_basic',
			contextType: 'global',
			tools,
			nowMs: Date.parse('2026-08-11T10:00:02.000Z')
		});

		expect(result).toMatchObject({
			hit: false,
			reason: 'stale_history',
			diagnostics: {
				prepared_prompt_id: preparedPrompt.row.id,
				prepared_history_created_at: '2026-08-11T10:00:00.000Z',
				latest_session_message_id: '22222222-2222-4222-8222-222222222222',
				latest_session_message_created_at: '2026-08-11T10:00:01.000Z',
				prepared_history_current: false
			}
		});
		expect(mock.updatePatches).toEqual([]);
	});

	it('legacy consumption ignores the newly admitted message but rejects an earlier mid-draft message', async () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const preparedPrompt = buildPreparedPromptRow({
			tools,
			overrides: { created_at: '2026-08-11T10:00:00.000Z' }
		});
		const mock = createSupabaseMock({
			row: preparedPrompt.row,
			historyRows: [
				{
					id: '33333333-3333-4333-8333-333333333333',
					created_at: '2026-08-11T10:00:02.000Z'
				},
				{
					id: '22222222-2222-4222-8222-222222222222',
					created_at: '2026-08-11T10:00:01.000Z'
				}
			]
		});

		await expect(
			consumePreparedPrompt({
				supabase: mock.supabase as any,
				key: preparedPrompt.key,
				userId: 'user-1',
				sessionId: 'session-1',
				cacheKey: 'v2|global|none|none|none',
				surfaceProfile: 'global_basic',
				contextType: 'global',
				tools
			})
		).resolves.toMatchObject({
			hit: false,
			reason: 'stale_history',
			diagnostics: {
				latest_session_message_id: '22222222-2222-4222-8222-222222222222'
			}
		});
		expect(mock.updatePatches).toEqual([]);
	});

	it('fails closed when prepared-history currency cannot be established', async () => {
		const tools = [tool('get_workspace_overview', 'Get a workspace overview.')];
		const preparedPrompt = buildPreparedPromptRow({ tools });
		const mock = createSupabaseMock({
			row: preparedPrompt.row,
			historyResult: { data: null, error: { message: 'history unavailable' } }
		});

		await expect(
			inspectPreparedPromptForWorkerAdmission({
				supabase: mock.supabase as any,
				key: preparedPrompt.key,
				userId: 'user-1',
				sessionId: 'session-1',
				cacheKey: 'v2|global|none|none|none',
				surfaceProfile: 'global_basic',
				contextType: 'global',
				tools
			})
		).resolves.toMatchObject({ hit: false, reason: 'history_check_failed' });
		expect(mock.updatePatches).toEqual([]);
	});

	it('returns empty admission lineage when the nonce or immutable scope does not match', async () => {
		const preparedPrompt = buildPreparedPromptRow({ tools: [] });
		const mock = createSupabaseMock({ row: preparedPrompt.row });

		await expect(
			inspectPreparedPromptAdmissionLineage({
				supabase: mock.supabase as any,
				key: `${preparedPrompt.key}-forged`,
				userId: 'user-1',
				sessionId: 'session-1',
				cacheKey: 'v2|global|none|none|none',
				surfaceProfile: 'global_basic'
			})
		).resolves.toBeNull();
	});
});
