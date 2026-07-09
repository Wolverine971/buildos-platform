// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import {
	buildPreparedPromptKey,
	buildPreparedPromptSurface,
	type PreparedPromptRow
} from './prepared-prompt-cache';
import { consumePreparedPrompt } from './prepared-prompt-consumer';

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
}) {
	const updatePatches: Record<string, unknown>[] = [];
	const builders: Array<{
		select: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		eq: ReturnType<typeof vi.fn>;
		is: ReturnType<typeof vi.fn>;
		maybeSingle: ReturnType<typeof vi.fn>;
	}> = [];

	const from = vi.fn((table: string) => {
		if (table !== 'agentic_chat_prepared_prompts') {
			throw new Error(`Unexpected table: ${table}`);
		}
		let mode: 'select' | 'update' = 'select';
		const builder = {
			select: vi.fn(() => builder),
			update: vi.fn((patch: Record<string, unknown>) => {
				mode = 'update';
				updatePatches.push(patch);
				return builder;
			}),
			eq: vi.fn(() => builder),
			is: vi.fn(() => builder),
			maybeSingle: vi.fn(async () => {
				if (mode === 'update') {
					return params.updateResult ?? { data: { id: params.row?.id }, error: null };
				}
				return params.selectResult ?? { data: params.row ?? null, error: null };
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
});
