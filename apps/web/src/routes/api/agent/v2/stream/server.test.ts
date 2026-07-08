// apps/web/src/routes/api/agent/v2/stream/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	attachVoiceNoteGroup: vi.fn(),
	loadPromptContext: vi.fn(),
	loadRecentMessages: vi.fn(),
	logError: vi.fn(),
	persistMessage: vi.fn(),
	persistMessageAttachments: vi.fn(),
	reconcile: vi.fn(),
	resolveSession: vi.fn(),
	selectFastChatTools: vi.fn(),
	senseDomains: vi.fn(),
	streamFastChat: vi.fn(),
	applyActiveDomainSignalsOverlay: vi.fn(),
	updateSessionContext: vi.fn()
}));
const runtimeEnv = vi.hoisted(() => ({
	values: {} as Record<string, string | undefined>
}));

vi.mock('$app/environment', () => ({
	dev: false,
	browser: false,
	building: false,
	version: 'test'
}));

vi.mock('$env/dynamic/private', () => ({
	env: runtimeEnv.values
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: () => ({
			logError: mocks.logError
		})
	}
}));

vi.mock('$lib/services/openrouter-v2-service', () => ({
	OpenRouterV2Service: vi.fn(() => ({}))
}));

vi.mock('$lib/services/agentic-chat/state/agent-state-reconciliation-service', () => ({
	AgentStateReconciliationService: vi.fn(() => ({
		reconcile: mocks.reconcile
	}))
}));

vi.mock('$lib/services/agentic-chat/tools/domains/domain-sensing', () => ({
	getSkillGateCandidateSkillIds: (result: Row | null | undefined) =>
		result
			? [
					...new Set(
						[
							...(result.candidate_outcome_cards ?? []).flatMap((card: Row) => [
								card.default_skill_id,
								...(card.skill_ids ?? [])
							]),
							...(result.recommended_skill_ids ?? []),
							...(result.active_domains ?? []).flatMap(
								(domain: Row) => domain.skill_ids ?? []
							)
						].filter(Boolean)
					)
				]
			: [],
	getSkillGateCandidateSkillLoadFormats: (result: Row | null | undefined) => {
		const formats: Record<string, string> = {};
		for (const card of result?.candidate_outcome_cards ?? []) {
			Object.assign(formats, card.skill_load_formats ?? {});
		}
		for (const skillId of result?.recommended_skill_ids ?? []) {
			formats[skillId] ??= 'full';
		}
		return formats;
	},
	senseDomains: mocks.senseDomains
}));

vi.mock('$lib/services/agentic-chat-lite/prompt', () => ({
	LITE_PROMPT_VARIANT: 'lite',
	buildLitePromptEnvelope: () => ({
		promptVariant: 'lite',
		systemPrompt: 'System prompt',
		sections: [],
		contextInventory: null,
		toolsSummary: null
	}),
	applyActiveDomainSignalsOverlay: mocks.applyActiveDomainSignalsOverlay
}));

vi.mock('$lib/services/agentic-chat-v2/prompt-observability', () => ({
	buildPromptSnapshotRow: () => ({
		system_prompt: 'System prompt',
		system_prompt_chars: 13,
		message_chars: 5,
		approx_prompt_tokens: 10
	}),
	buildPromptSnapshotSections: () => [],
	buildToolCallEventPayload: () => ({}),
	buildToolResultEventPayload: () => ({}),
	deriveFirstLane: () => null,
	extractFastChatToolCallMeta: () => ({})
}));

vi.mock('$lib/services/agentic-chat-v2/prompt-cost-breakdown', () => ({
	buildPromptCostBreakdown: () => ({ total_tokens: 10 })
}));

vi.mock('$lib/services/agentic-chat-v2/tool-surface-size-report', () => ({
	buildToolSurfaceSizeReport: () => ({ tool_count: 0 })
}));

vi.mock('$lib/services/agentic-chat-v2', () => ({
	appendAttachmentContextToMessage: (message: string) => message,
	assessLiveVisionImageEligibility: () => ({ eligible: false, reason: 'disabled' }),
	buildAttachmentOnlyDisplayText: () => 'Attachment',
	buildFastContextUsageSnapshot: () => ({
		estimatedTokens: 12,
		tokenBudget: 1000,
		usagePercent: 1,
		status: 'ok'
	}),
	buildLiveVisionContentParts: ({ text }: { text: string }) => text,
	composeFastChatHistory: () => ({
		historyForModel: [],
		compressed: false,
		strategy: 'raw_history',
		rawHistoryCount: 0,
		tailMessagesKept: 0,
		continuityHintUsed: false
	}),
	createChatAttachmentRefFromAsset: vi.fn(),
	createFastChatSessionService: () => ({
		attachVoiceNoteGroup: mocks.attachVoiceNoteGroup,
		loadRecentMessages: mocks.loadRecentMessages,
		persistMessage: mocks.persistMessage,
		persistMessageAttachments: mocks.persistMessageAttachments,
		resolveSession: mocks.resolveSession,
		updateSessionContext: mocks.updateSessionContext
	}),
	extractLoadedSkillIdsFromHistory: () => [],
	historyIncludesLoadedSkillsLedger: () => false,
	loadFastChatPromptContext: mocks.loadPromptContext,
	normalizeChatAttachmentRefs: () => ({ attachments: [], rejected: 0 }),
	normalizeFastAgentStreamRequest: (input: Record<string, any>) => ({
		...input,
		lastTurnContext: input?.lastTurnContext ?? input?.last_turn_context ?? null,
		voiceNoteGroupId: input?.voiceNoteGroupId ?? input?.voice_note_group_id,
		prewarmedContext: input?.prewarmedContext ?? input?.prewarmed_context ?? null,
		preparedPromptKey: input?.preparedPromptKey ?? input?.prepared_prompt_key ?? null
	}),
	normalizeFastContextType: (value?: string) => value ?? 'global',
	resolveFastChatSurfaceProfileForTurn: () => 'general',
	sanitizeAttachmentRefsForMetadata: () => [],
	selectFastChatTools: mocks.selectFastChatTools,
	shouldUseLiveVisionForTurn: () => false,
	streamFastChat: mocks.streamFastChat
}));

import { GET, POST } from './+server';
import {
	buildPreparedPromptKey,
	buildPreparedPromptSurface
} from '$lib/services/agentic-chat-v2/prepared-prompt-cache';

type Row = Record<string, any>;

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue(result)
	};
}

function createAdminOnlySupabase({ isAdmin = false } = {}) {
	const adminQuery = createQuery({
		data: isAdmin ? { user_id: 'admin-1' } : null,
		error: isAdmin ? null : { message: 'not found' }
	});

	return {
		adminQuery,
		from: vi.fn().mockImplementation((table: string) => {
			if (table === 'admin_users') return adminQuery;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createStreamingSupabase(
	initialRows: Record<string, Row[]> = {},
	options: { insertErrors?: Record<string, unknown> } = {}
) {
	const rows: Record<string, Row[]> = {
		chat_turn_runs: [],
		chat_turn_checkpoints: [],
		chat_prompt_snapshots: [],
		chat_turn_events: [],
		timing_metrics: [],
		...Object.fromEntries(
			Object.entries(initialRows).map(([table, tableRows]) => [
				table,
				tableRows.map((row) => ({ ...row }))
			])
		)
	};
	const insertedRows: Record<string, Row[]> = {};
	const updatedRows: Record<string, Row[]> = {};
	let checkpointCount = 0;

	const ensureRows = (table: string) => {
		rows[table] ??= [];
		insertedRows[table] ??= [];
		updatedRows[table] ??= [];
		return rows[table];
	};

	class QueryBuilder {
		private filters: Array<(row: Row) => boolean> = [];
		private inserted: Row[] | null = null;
		private mode: 'select' | 'insert' | 'update' = 'select';
		private orderSpec: { column: string; ascending: boolean } | null = null;
		private patch: Row | null = null;
		private rowLimit: number | null = null;

		constructor(private readonly table: string) {
			ensureRows(table);
		}

		select(_columns?: string) {
			return this;
		}

		insert(value: Row | Row[]) {
			this.mode = 'insert';
			if (options.insertErrors?.[this.table]) {
				this.inserted = [];
				return this;
			}
			const now = new Date().toISOString();
			const values = Array.isArray(value) ? value : [value];
			this.inserted = values.map((item) => {
				const row = {
					...(this.table === 'chat_turn_checkpoints' && !item.id
						? { id: `checkpoint-${++checkpointCount}` }
						: {}),
					...item,
					created_at: item.created_at ?? now,
					updated_at: item.updated_at ?? now
				};
				ensureRows(this.table).push(row);
				insertedRows[this.table].push(row);
				return row;
			});
			return this;
		}

		update(patch: Row) {
			this.mode = 'update';
			this.patch = patch;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push((row) => row[column] === value);
			return this;
		}

		lt(column: string, value: unknown) {
			this.filters.push((row) => String(row[column] ?? '') < String(value ?? ''));
			return this;
		}

		is(column: string, value: unknown) {
			this.filters.push((row) =>
				value === null
					? row[column] === null || row[column] === undefined
					: row[column] === value
			);
			return this;
		}

		in(column: string, values: unknown[]) {
			this.filters.push((row) => values.includes(row[column]));
			return this;
		}

		or(expression: string) {
			const activeCheckpointExpiryPrefix = 'expires_at.is.null,expires_at.gt.';
			if (expression.startsWith(activeCheckpointExpiryPrefix)) {
				const now = expression.slice(activeCheckpointExpiryPrefix.length);
				this.filters.push((row) => row.expires_at === null || String(row.expires_at) > now);
			}
			return this;
		}

		order(column: string, options?: { ascending?: boolean }) {
			this.orderSpec = { column, ascending: options?.ascending !== false };
			return this;
		}

		limit(count: number) {
			this.rowLimit = count;
			return this;
		}

		maybeSingle() {
			return this.execute(true);
		}

		then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
			onfulfilled?:
				| ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
				| null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.execute(false).then(onfulfilled, onrejected);
		}

		private async execute(single: true): Promise<{ data: Row | null; error: unknown | null }>;
		private async execute(single: false): Promise<{ data: Row[]; error: unknown | null }>;
		private async execute(single: boolean) {
			let data: Row[];
			if (this.mode === 'insert') {
				const insertError = options.insertErrors?.[this.table];
				if (insertError) {
					return single
						? { data: null, error: insertError }
						: { data: [], error: insertError };
				}
				data = this.inserted ?? [];
			} else {
				data = ensureRows(this.table).filter((row) =>
					this.filters.every((filter) => filter(row))
				);
				if (this.mode === 'update' && this.patch) {
					for (const row of data) {
						Object.assign(row, this.patch, { updated_at: new Date().toISOString() });
						updatedRows[this.table].push({ ...row });
					}
				}
			}

			if (this.orderSpec) {
				const { column, ascending } = this.orderSpec;
				data = [...data].sort((a, b) => {
					const left = String(a[column] ?? '');
					const right = String(b[column] ?? '');
					return ascending ? left.localeCompare(right) : right.localeCompare(left);
				});
			}
			if (this.rowLimit !== null) {
				data = data.slice(0, this.rowLimit);
			}

			return single ? { data: data[0] ?? null, error: null } : { data, error: null };
		}
	}

	return {
		insertedRows,
		updatedRows,
		from: vi.fn((table: string) => new QueryBuilder(table)),
		rpc: vi.fn().mockResolvedValue({ data: {}, error: null })
	};
}

function parseSseEvents(text: string): Row[] {
	return text
		.split('\n\n')
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => {
			const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
			if (!dataLine) throw new Error(`Missing SSE data line: ${chunk}`);
			return JSON.parse(dataLine.slice('data: '.length)) as Row;
		});
}

function buildSupervisorDigest() {
	return {
		turnRunId: 'turn-run-1',
		sessionId: 'session-1',
		userId: 'user-1',
		contextType: 'global',
		entityId: null,
		projectId: null,
		userMessage: 'Update the task',
		elapsedMs: 12000,
		msSinceVisibleText: 8000,
		assistantTextChars: 0,
		finalCandidateChars: 0,
		llmPassCount: 3,
		toolRoundCount: 2,
		toolCallCount: 2,
		validationFailureCount: 2,
		recentTools: [
			{
				sequence: 1,
				toolName: 'update_onto_task',
				success: false,
				errorClass: 'validation',
				resultSummary: 'missing task_id'
			}
		],
		progress: {
			successfulWrites: 0,
			failedWrites: 2,
			readRounds: 0,
			lowNoveltyReadRounds: 0,
			repeatedToolPatternCount: 1,
			repeatedFailureCount: 2,
			discoveredEntityCount: 0
		},
		risks: ['repeated_failures']
	};
}

function buildCheckpointRow(overrides: Row = {}): Row {
	return {
		id: 'checkpoint-1',
		turn_run_id: 'turn-previous',
		session_id: 'session-1',
		user_id: 'user-1',
		resume_turn_run_id: null,
		checkpoint_type: 'supervisor_question',
		status: 'active',
		reason: 'repeated_validation_failures',
		digest: buildSupervisorDigest(),
		resume_context: {
			missing_field: 'task_id',
			last_failed_tool: 'update_onto_task',
			instruction: 'Continue from this checkpoint after the user answers.'
		},
		supervisor_decision: {
			action: 'ask_user',
			reason: 'repeated_validation_failures',
			question: 'Which exact task should I update?'
		},
		question: 'Which exact task should I update?',
		resume_started_at: null,
		resumed_at: null,
		expires_at: '2099-01-01T00:00:00.000Z',
		created_at: '2026-05-24T00:00:00.000Z',
		updated_at: '2026-05-24T00:00:00.000Z',
		...overrides
	};
}

function buildPreparedPromptRow(overrides: Row = {}): { key: string; row: Row } {
	const id = overrides.id ?? '11111111-1111-4111-8111-111111111111';
	const createdAt = overrides.created_at ?? '2026-06-22T00:00:00.000Z';
	const contextPayload = overrides.context_payload ?? {
		contextType: 'global',
		data: {}
	};
	const conversationSummary = overrides.conversation_summary ?? null;
	const { key, nonceSha256 } = buildPreparedPromptKey(id);
	const surface = buildPreparedPromptSurface({
		surfaceProfile: 'general' as any,
		contextType: 'global',
		contextPayload,
		conversationSummary,
		tools: [],
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
				general: surface
			},
			default_surface_profile: 'general',
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
			...overrides
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	for (const key of Object.keys(runtimeEnv.values)) {
		delete runtimeEnv.values[key];
	}
	mocks.resolveSession.mockResolvedValue({
		session: {
			id: 'session-1',
			summary: null,
			agent_metadata: {}
		}
	});
	mocks.loadRecentMessages.mockResolvedValue([]);
	mocks.senseDomains.mockReturnValue(null);
	mocks.applyActiveDomainSignalsOverlay.mockImplementation((envelope: Row, input: Row) => {
		if (!input.domainSensingResult) {
			return {
				...envelope,
				sections: (envelope.sections ?? []).filter(
					(section: Row) => section.id !== 'active_domain_signals'
				)
			};
		}
		const sections = [
			...(envelope.sections ?? []).filter(
				(section: Row) => section.id !== 'active_domain_signals'
			),
			{
				id: 'active_domain_signals',
				title: 'Active Domain Signals',
				content: 'Current turn domain overlay',
				chars: 27,
				estimatedTokens: 6
			}
		];
		return {
			...envelope,
			sections,
			systemPrompt: `${envelope.systemPrompt}\n\n## Active Domain Signals\n\nCurrent turn domain overlay`
		};
	});
	mocks.loadPromptContext.mockResolvedValue({
		contextType: 'global',
		entityId: null,
		projectId: null,
		projectName: null,
		focusEntityType: null,
		focusEntityId: null,
		focusEntityName: null,
		conversationSummary: null,
		data: {}
	});
	mocks.selectFastChatTools.mockReturnValue([]);
	mocks.persistMessage.mockImplementation(
		async ({ role, content, metadata }: { role: string; content: string; metadata?: Row }) => ({
			id: `${role}-message-1`,
			role,
			content,
			metadata,
			created_at: '2026-05-24T00:00:00.000Z'
		})
	);
	mocks.updateSessionContext.mockResolvedValue(undefined);
	mocks.persistMessageAttachments.mockResolvedValue(undefined);
	mocks.attachVoiceNoteGroup.mockResolvedValue(undefined);
	mocks.reconcile.mockResolvedValue(null);
	mocks.streamFastChat.mockImplementation(async ({ onDelta }: Row) => {
		await onDelta('Hello back.');
		return {
			assistantText: 'Hello back.',
			finalAssistantText: 'Hello back.',
			usage: { total_tokens: 12 },
			finishedReason: 'stop',
			toolExecutions: [],
			llmPasses: [],
			toolRounds: 0,
			toolCallsMade: 0,
			supervisorDecisions: [],
			finalizationGuard: undefined,
			cancelled: false,
			peakPromptTokens: undefined,
			finalContextUsage: undefined
		};
	});
});

describe('/api/agent/v2/stream', () => {
	it('GET warmup authenticates and returns a no-content response', async () => {
		const safeGetSession = vi.fn().mockResolvedValue({ user: { id: 'user-1' } });
		const response = await GET({
			locals: {
				safeGetSession
			}
		} as any);

		expect(response.status).toBe(204);
		expect(response.headers.get('Cache-Control')).toContain('no-store');
		expect(response.headers.get('X-BuildOS-Agent-Stream-Warmup')).toBe('1');
		expect(safeGetSession).toHaveBeenCalledTimes(1);
	});

	it('GET warmup requires an authenticated user', async () => {
		const response = await GET({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as any);

		expect(response.status).toBe(401);
	});

	it('ignores the legacy prompt_variant request field and does not consult the admin gate', async () => {
		// Lite is the only prompt path (docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
		// The legacy `prompt_variant` field is ignored silently; every session runs lite.
		// There is no admin/dev gate anymore, so the request should not hit `admin_users`.
		// The endpoint will attempt to start streaming and fail downstream in this minimal
		// test harness, but the key assertion is that validation does NOT query admin-users.
		const supabase = createAdminOnlySupabase({ isAdmin: false });
		try {
			await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Hello',
						prompt_variant: 'anything-we-ignore'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
		} catch {
			// downstream streaming machinery is not mocked in this harness.
		}

		expect(supabase.from).not.toHaveBeenCalledWith('admin_users');
	});

	it('consumes a generated-type prepared prompt row for a valid preparedPromptKey', async () => {
		const preparedPrompt = buildPreparedPromptRow();
		const supabase = createStreamingSupabase({
			agentic_chat_prepared_prompts: [preparedPrompt.row]
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					context_type: 'global',
					stream_run_id: 'stream-run-prepared',
					client_turn_id: 'client-turn-prepared',
					preparedPromptKey: preparedPrompt.key
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const rawStream = await response.text();
		const events = parseSseEvents(rawStream);
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'done',
					finished_reason: 'stop'
				})
			])
		);
		expect(rawStream).toContain('id: stream-run-prepared:1\n');
		expect(
			events.every((event, index) => event.event_id === `stream-run-prepared:${index + 1}`)
		).toBe(true);
		expect(events.every((event, index) => event.sequence_index === index + 1)).toBe(true);
		expect(
			events.every(
				(event) =>
					event.stream_run_id === 'stream-run-prepared' &&
					event.client_turn_id === 'client-turn-prepared' &&
					event.event_type === event.type
			)
		).toBe(true);
		expect(events.find((event) => event.type === 'text_delta')).toEqual(
			expect.objectContaining({
				phase: 'llm',
				durable: true,
				turn_run_id: expect.any(String)
			})
		);
		expect(events.find((event) => event.type === 'done')).toEqual(
			expect.objectContaining({
				phase: 'finalize',
				durable: true,
				turn_run_id: expect.any(String)
			})
		);

		expect(supabase.from).toHaveBeenCalledWith('agentic_chat_prepared_prompts');
		expect(mocks.loadRecentMessages).not.toHaveBeenCalled();
		expect(supabase.updatedRows.agentic_chat_prepared_prompts?.[0]).toEqual(
			expect.objectContaining({
				id: preparedPrompt.row.id,
				user_id: 'user-1',
				consumed_at: expect.any(String)
			})
		);
		expect(
			supabase.updatedRows.chat_turn_runs?.find((row) => row.status === 'completed')
		).toEqual(
			expect.objectContaining({
				cache_source: 'prepared_prompt',
				prepared_prompt_id: preparedPrompt.row.id
			})
		);
		expect(mocks.applyActiveDomainSignalsOverlay).not.toHaveBeenCalled();
		expect(mocks.streamFastChat.mock.calls[0]?.[0]?.systemPrompt).toBe('System prompt');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(supabase.rpc).toHaveBeenCalledWith('merge_chat_session_agent_metadata', {
			p_session_id: 'session-1',
			p_patch: {
				fastchat_context_cache: expect.objectContaining({
					version: 2,
					key: 'v2|global|none|none|none',
					context: expect.objectContaining({
						contextType: 'global'
					})
				})
			}
		});
	});

	it('does not consume a prepared prompt when turn admission loses the running-turn lock', async () => {
		const preparedPrompt = buildPreparedPromptRow();
		const supabase = createStreamingSupabase(
			{
				agentic_chat_prepared_prompts: [preparedPrompt.row]
			},
			{
				insertErrors: {
					chat_turn_runs: {
						code: '23505',
						constraint: 'uq_chat_turn_runs_one_running_per_session',
						message: 'duplicate key value violates unique constraint'
					}
				}
			}
		);

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					context_type: 'global',
					stream_run_id: 'stream-run-admission-conflict',
					client_turn_id: 'client-turn-admission-conflict',
					preparedPromptKey: preparedPrompt.key
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'done',
					finished_reason: 'active_turn_running'
				})
			])
		);
		expect(supabase.updatedRows.agentic_chat_prepared_prompts ?? []).toHaveLength(0);
		expect(mocks.loadRecentMessages).not.toHaveBeenCalled();
		expect(mocks.loadPromptContext).not.toHaveBeenCalled();
		expect(mocks.streamFastChat).not.toHaveBeenCalled();
	});

	it('defers prompt snapshot persistence until after the first model delta is emitted', async () => {
		const supabase = createStreamingSupabase();
		const snapshotCountsDuringModel: number[] = [];
		mocks.streamFastChat.mockImplementationOnce(async ({ onDelta }: Row) => {
			snapshotCountsDuringModel.push(
				supabase.insertedRows.chat_prompt_snapshots?.length ?? 0
			);
			await onDelta('Hello back.');
			snapshotCountsDuringModel.push(
				supabase.insertedRows.chat_prompt_snapshots?.length ?? 0
			);
			return {
				assistantText: 'Hello back.',
				finalAssistantText: 'Hello back.',
				usage: { total_tokens: 12 },
				finishedReason: 'stop',
				toolExecutions: [],
				llmPasses: [],
				toolRounds: 0,
				toolCallsMade: 0,
				supervisorDecisions: [],
				finalizationGuard: undefined,
				cancelled: false,
				peakPromptTokens: undefined,
				finalContextUsage: undefined
			};
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					context_type: 'global',
					stream_run_id: 'stream-run-deferred-snapshot',
					client_turn_id: 'client-turn-deferred-snapshot'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		await response.text();

		expect(snapshotCountsDuringModel).toEqual([0, 0]);
		expect(supabase.insertedRows.chat_prompt_snapshots).toHaveLength(1);
		expect(
			supabase.insertedRows.chat_turn_events?.some(
				(row) => row.event_type === 'prompt_snapshot_created'
			)
		).toBe(true);
	});

	it('ignores unsigned client-carried prewarmedContext and falls back to server context', async () => {
		const supabase = createStreamingSupabase();

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					context_type: 'global',
					stream_run_id: 'stream-run-unsigned-prewarm',
					client_turn_id: 'client-turn-unsigned-prewarm',
					prewarmedContext: {
						version: 2,
						key: 'v2|global|none|none|none',
						created_at: new Date().toISOString(),
						context: {
							contextType: 'global',
							data: {
								injected: true
							}
						}
					}
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		await response.text();

		expect(mocks.loadPromptContext).toHaveBeenCalledOnce();
		expect(
			supabase.updatedRows.chat_turn_runs?.find((row) => row.status === 'completed')
		).toEqual(
			expect.objectContaining({
				cache_source: 'fresh_load',
				request_prewarmed_context: false,
				prepared_prompt_hit: false,
				prepared_prompt_miss_reason: 'missing_key'
			})
		);
	});

	it.each([
		['user_mismatch', { user_id: 'other-user' }],
		['session_mismatch', { session_id: 'other-session' }],
		['scope_mismatch', { cache_key: 'v2|project|project-1|none|none' }],
		['consumed', { consumed_at: '2026-06-22T00:00:00.000Z' }]
	])(
		'falls back cleanly when preparedPromptKey misses with %s',
		async (expectedReason, rowOverrides) => {
			const preparedPrompt = buildPreparedPromptRow(rowOverrides);
			const supabase = createStreamingSupabase({
				agentic_chat_prepared_prompts: [preparedPrompt.row]
			});

			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Hello',
						context_type: 'global',
						stream_run_id: `stream-run-${expectedReason}`,
						client_turn_id: `client-turn-${expectedReason}`,
						preparedPromptKey: preparedPrompt.key
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);

			expect(response.status).toBe(200);
			await response.text();

			expect(mocks.loadRecentMessages).toHaveBeenCalledOnce();
			expect(mocks.loadPromptContext).toHaveBeenCalledOnce();
			expect(
				supabase.updatedRows.chat_turn_runs?.find((row) => row.status === 'completed')
			).toEqual(
				expect.objectContaining({
					cache_source: 'fresh_load',
					prepared_prompt_hit: false,
					prepared_prompt_miss_reason: expectedReason
				})
			);
		}
	);

	it('overlays current turn domain signals on a prepared prompt with stale domain sections', async () => {
		const preparedPrompt = buildPreparedPromptRow();
		preparedPrompt.row.prepared_surfaces.general = {
			...preparedPrompt.row.prepared_surfaces.general,
			system_prompt: 'System prompt\n\n## Active Domain Signals\n\nStale turn signal',
			sections: [
				{
					id: 'active_domain_signals',
					title: 'Active Domain Signals',
					content: 'Stale turn signal',
					chars: 17,
					estimatedTokens: 4
				}
			]
		};
		const domainSensingResult = {
			type: 'domain_sensing',
			source: 'current_user_message',
			query: 'draft launch plan',
			active_domains: [
				{
					id: 'go-to-market',
					name: 'Go To Market',
					confidence: 0.82,
					coverage_status: 'strong',
					parent_ids: [],
					aliases_hit: ['launch'],
					skill_ids: ['gtm-plan'],
					outcome_card_ids: ['launch-plan-card'],
					recommended_skill_stack_ids: [],
					gaps: [],
					gap_skill_ids: [],
					gap_resource_ids: []
				}
			],
			candidate_outcome_cards: [
				{
					id: 'launch-plan-card',
					name: 'Launch Plan',
					confidence: 0.82,
					summary: 'Plan a product launch.',
					domain_ids: ['go-to-market'],
					buildos_capability_ids: [],
					default_skill_id: 'gtm-plan',
					skill_ids: ['gtm-plan'],
					skill_load_formats: {
						'gtm-plan': 'short'
					},
					coverage_status: 'strong',
					load_hint: 'Load for launch plans.'
				}
			],
			candidate_outcome_card_ids: ['launch-plan-card'],
			recommended_skill_ids: ['gtm-plan'],
			coverage_gap_skill_ids: [],
			coverage_gap_resource_ids: [],
			skill_load_required: false,
			next_step: 'Use the current turn domains.'
		};
		mocks.senseDomains.mockReturnValueOnce(domainSensingResult);
		mocks.applyActiveDomainSignalsOverlay.mockReturnValueOnce({
			promptVariant: 'lite',
			systemPrompt: 'System prompt\n\n## Active Domain Signals\n\nCurrent turn signal',
			sections: [
				{
					id: 'active_domain_signals',
					title: 'Active Domain Signals',
					content: 'Current turn signal',
					chars: 19,
					estimatedTokens: 4
				}
			],
			contextInventory: null,
			toolsSummary: null
		});
		const supabase = createStreamingSupabase({
			agentic_chat_prepared_prompts: [preparedPrompt.row]
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Draft the launch plan',
					context_type: 'global',
					stream_run_id: 'stream-run-domain-overlay',
					client_turn_id: 'client-turn-domain-overlay',
					preparedPromptKey: preparedPrompt.key
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());

		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'done',
					finished_reason: 'stop'
				})
			])
		);
		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.objectContaining({
				systemPrompt: expect.stringContaining('Stale turn signal'),
				sections: expect.arrayContaining([
					expect.objectContaining({
						id: 'active_domain_signals',
						content: 'Stale turn signal'
					})
				])
			}),
			expect.objectContaining({
				currentUserMessage: 'Draft the launch plan',
				domainSensingResult
			})
		);
		expect(mocks.streamFastChat).toHaveBeenCalledOnce();
		const systemPrompt = mocks.streamFastChat.mock.calls[0]?.[0]?.systemPrompt;
		expect(systemPrompt).toContain('Current turn signal');
		expect(systemPrompt).not.toContain('Stale turn signal');
		const domainEvent = supabase.insertedRows.chat_turn_events?.find(
			(row) => row.event_type === 'domain_sensing_applied'
		);
		expect(domainEvent?.payload).toMatchObject({
			skill_gate_required: false,
			expected_skill_ids: ['gtm-plan'],
			expected_skill_formats: {
				'gtm-plan': 'short'
			}
		});
		const gateEvent = supabase.insertedRows.chat_turn_events?.find(
			(row) => row.event_type === 'skill_gate_evaluated'
		);
		expect(gateEvent?.payload).toMatchObject({
			skill_gate_required: false,
			expected_skill_ids: ['gtm-plan'],
			expected_skill_format: 'short',
			loaded_skill_ids: [],
			skill_gate_satisfied: true,
			skill_gate_violation_repaired: false,
			skill_contract_present: null
		});
	});

	it('emits live tool_result payloads with search telemetry and stream events', async () => {
		const supabase = createStreamingSupabase();
		const toolCall = {
			id: 'call-search',
			type: 'function',
			function: {
				name: 'search_project',
				arguments: JSON.stringify({
					query: 'missing launch notes',
					project_id: 'project-1'
				})
			}
		};
		const toolResult = {
			tool_call_id: 'call-search',
			result: {
				results: [],
				status: 'needs_input'
			},
			success: true,
			duration_ms: 12,
			tokens_consumed: 9,
			stream_events: [
				{
					type: 'progress',
					message: 'searched project'
				}
			],
			stream_events_preview: [
				{
					type: 'untrusted_preview',
					message: 'this should not pass through'
				}
			]
		};

		mocks.streamFastChat.mockImplementationOnce(
			async ({ onToolCall, onToolResult, onDelta }: Row) => {
				await onToolCall?.(toolCall);
				await onToolResult?.({ toolCall, result: toolResult });
				await onDelta('No matches.');
				return {
					assistantText: 'No matches.',
					finalAssistantText: 'No matches.',
					usage: { total_tokens: 8 },
					finishedReason: 'stop',
					toolExecutions: [{ toolCall, result: toolResult }],
					llmPasses: [],
					toolRounds: 1,
					toolCallsMade: 0,
					supervisorDecisions: [],
					finalizationGuard: undefined,
					cancelled: false,
					peakPromptTokens: undefined,
					finalContextUsage: undefined
				};
			}
		);

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Search for launch notes',
					context_type: 'global',
					stream_run_id: 'stream-run-search',
					client_turn_id: 'client-turn-search'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());
		const liveToolResult = events.find((event) => event.type === 'tool_result');

		expect(liveToolResult?.result).toEqual(
			expect.objectContaining({
				tool_call_id: 'call-search',
				tool_name: 'search_project',
				tool_category: 'ontology',
				result_count: 0,
				zero_result: true,
				tokens_consumed: 9,
				requires_user_action: true,
				affected_entities: [],
				stream_event_count: 1,
				stream_events_preview: [
					{
						type: 'progress',
						message: '[redacted]'
					}
				]
			})
		);
		expect(liveToolResult?.result?.stream_events).toBeUndefined();
		expect(JSON.stringify(liveToolResult?.result?.stream_events_preview)).not.toContain(
			'untrusted_preview'
		);
		expect(supabase.insertedRows.chat_tool_executions?.[0]).toEqual(
			expect.objectContaining({
				tool_name: 'search_project',
				result_count: 0,
				zero_result: true,
				tokens_consumed: 9,
				requires_user_action: true
			})
		);
	});

	it('emits live tool_result payloads with affected entity refs matching persistence', async () => {
		const supabase = createStreamingSupabase();
		const toolCall = {
			id: 'call-create-task',
			type: 'function',
			function: {
				name: 'create_onto_task',
				arguments: JSON.stringify({
					title: 'Launch checklist',
					project_id: 'project-1'
				})
			}
		};
		const toolResult = {
			tool_call_id: 'call-create-task',
			result: {
				task: {
					id: 'task-1',
					title: 'Launch checklist',
					project_id: 'project-1'
				}
			},
			success: true,
			duration_ms: 20
		};

		mocks.streamFastChat.mockImplementationOnce(
			async ({ onToolCall, onToolResult, onDelta }: Row) => {
				await onToolCall?.(toolCall);
				await onToolResult?.({ toolCall, result: toolResult });
				await onDelta('Created the task.');
				return {
					assistantText: 'Created the task.',
					finalAssistantText: 'Created the task.',
					usage: { total_tokens: 8 },
					finishedReason: 'stop',
					toolExecutions: [{ toolCall, result: toolResult }],
					llmPasses: [],
					toolRounds: 1,
					toolCallsMade: 1,
					supervisorDecisions: [],
					finalizationGuard: undefined,
					cancelled: false,
					peakPromptTokens: undefined,
					finalContextUsage: undefined
				};
			}
		);

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Create a launch task',
					context_type: 'global',
					stream_run_id: 'stream-run-create',
					client_turn_id: 'client-turn-create'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());
		const liveToolResult = events.find((event) => event.type === 'tool_result');
		const expectedRef = expect.objectContaining({
			kind: 'task',
			id: 'task-1',
			title: 'Launch checklist',
			projectId: 'project-1',
			operation: 'created',
			url: '/projects/project-1?entity=task&entity_id=task-1'
		});

		expect(liveToolResult?.result?.affected_entities).toEqual([expectedRef]);
		expect(supabase.insertedRows.chat_tool_executions?.[0]?.affected_entities).toEqual([
			expectedRef
		]);
		const completedTurnRun = supabase.updatedRows.chat_turn_runs?.find(
			(row) => row.status === 'completed'
		);
		expect(completedTurnRun).toEqual(
			expect.objectContaining({
				tool_call_count: 1
			})
		);
	});

	it('passes prompt entity ownership context into tool execution', async () => {
		const supabase = createStreamingSupabase();
		const currentProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
		const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
		const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
		const updateTaskDefinition = {
			name: 'update_onto_task',
			description: 'Update task',
			parameters: {
				type: 'object',
				properties: {
					project_id: { type: 'string' },
					task_id: { type: 'string' },
					title: { type: 'string' }
				},
				required: ['task_id']
			}
		};
		let capturedToolResult: Row | null = null;

		mocks.selectFastChatTools.mockReturnValueOnce([updateTaskDefinition]);
		mocks.loadPromptContext.mockResolvedValueOnce({
			contextType: 'project',
			entityId: currentProjectId,
			projectId: currentProjectId,
			projectName: 'Current Project',
			focusEntityType: null,
			focusEntityId: null,
			focusEntityName: null,
			conversationSummary: null,
			data: {
				project: { id: currentProjectId, name: 'Current Project' },
				tasks: [
					{
						id: taskId,
						title: 'Cross-project task',
						project_id: otherProjectId
					}
				]
			}
		});
		mocks.streamFastChat.mockImplementationOnce(async ({ toolExecutor, onDelta }: Row) => {
			capturedToolResult = await toolExecutor(
				{
					id: 'call-update-task',
					name: 'update_onto_task',
					arguments: { task_id: taskId, title: 'Rename task' }
				},
				[updateTaskDefinition]
			);
			await onDelta('Checked tool context.');
			return {
				assistantText: 'Checked tool context.',
				finalAssistantText: 'Checked tool context.',
				usage: { total_tokens: 8 },
				finishedReason: 'stop',
				toolExecutions: [],
				llmPasses: [],
				toolRounds: 1,
				toolCallsMade: 1,
				supervisorDecisions: [],
				finalizationGuard: undefined,
				cancelled: false,
				peakPromptTokens: undefined,
				finalContextUsage: undefined
			};
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Update that task',
					context_type: 'project',
					entity_id: currentProjectId,
					stream_run_id: 'stream-run-tool-context',
					client_turn_id: 'client-turn-tool-context'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		await response.text();

		expect(capturedToolResult).toEqual(
			expect.objectContaining({
				success: false,
				error: expect.stringContaining('task_id belongs to a different project')
			})
		);
	});

	it('injects AI Inbox proposal context into the model history', async () => {
		const supabase = createStreamingSupabase();
		let capturedHistory: Row[] = [];

		mocks.resolveSession.mockResolvedValueOnce({
			session: {
				id: 'session-1',
				summary: 'Review proposed Start Here updates.',
				agent_metadata: {
					source: 'ai_inbox',
					source_type: 'agent_run',
					source_label: 'Agent proposal',
					source_status: 'partial',
					inbox_item_id: 'inbox-1',
					source_ref_id: 'run-1',
					project_id: 'project-1',
					project_name: 'BuildOS',
					proposal_context: {
						llm_text:
							'You are discussing an AI Inbox proposal.\n# Update project START HERE\nThe agent wanted to revise the project orientation document.'
					}
				}
			}
		});
		mocks.streamFastChat.mockImplementationOnce(async ({ history, onDelta }: Row) => {
			capturedHistory = history;
			await onDelta('We are reviewing the START HERE proposal.');
			return {
				assistantText: 'We are reviewing the START HERE proposal.',
				finalAssistantText: 'We are reviewing the START HERE proposal.',
				usage: { total_tokens: 10 },
				finishedReason: 'stop',
				toolExecutions: [],
				llmPasses: [],
				toolRounds: 0,
				toolCallsMade: 0,
				supervisorDecisions: [],
				finalizationGuard: undefined,
				cancelled: false,
				peakPromptTokens: undefined,
				finalContextUsage: undefined
			};
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'What are we trying to do?',
					context_type: 'project',
					entity_id: 'project-1',
					stream_run_id: 'stream-run-inbox',
					client_turn_id: 'client-turn-inbox'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		await response.text();

		expect(capturedHistory[0]).toEqual(
			expect.objectContaining({
				role: 'system',
				content: expect.stringContaining('## Proposal Focus')
			})
		);
		expect(capturedHistory[0]?.content).toContain('Update project START HERE');
		expect(capturedHistory[0]?.content).toContain('Source type: agent_run');
		expect(capturedHistory[0]?.content).toContain(
			'Do not accept, dismiss, apply, create, move, or update anything merely because this brief exists'
		);
	});

	it('injects agent-run bridge context into the model history', async () => {
		const supabase = createStreamingSupabase();
		let capturedHistory: Row[] = [];

		mocks.resolveSession.mockResolvedValueOnce({
			session: {
				id: 'session-1',
				summary: 'Review proposed Start Here updates.',
				agent_metadata: {
					source: 'agent_run_context',
					agent_run_id: 'run-1',
					run_id: 'run-1',
					project_id: 'project-1',
					project_name: 'BuildOS',
					agent_run_context: {
						run_id: 'run-1',
						run_status: 'proposal_ready',
						llm_text:
							'Agent run proposal ready to chat about.\n# Update project START HERE\nReview the staged orientation document edits.'
					}
				}
			}
		});
		mocks.streamFastChat.mockImplementationOnce(async ({ history, onDelta }: Row) => {
			capturedHistory = history;
			await onDelta('This run proposed START HERE edits.');
			return {
				assistantText: 'This run proposed START HERE edits.',
				finalAssistantText: 'This run proposed START HERE edits.',
				usage: { total_tokens: 10 },
				finishedReason: 'stop',
				toolExecutions: [],
				llmPasses: [],
				toolRounds: 0,
				toolCallsMade: 0,
				supervisorDecisions: [],
				finalizationGuard: undefined,
				cancelled: false,
				peakPromptTokens: undefined,
				finalContextUsage: undefined
			};
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'What is this run trying to do?',
					context_type: 'project',
					entity_id: 'project-1',
					stream_run_id: 'stream-run-agent-run-context',
					client_turn_id: 'client-turn-agent-run-context'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		await response.text();

		expect(capturedHistory[0]).toEqual(
			expect.objectContaining({
				role: 'system',
				content: expect.stringContaining('## Proposal Focus')
			})
		);
		expect(capturedHistory[0]?.content).toContain('Agent run context');
		expect(capturedHistory[0]?.content).toContain('Source ref id: run-1');
		expect(capturedHistory[0]?.content).toContain('Update project START HERE');
	});

	it('persists a supervisor question checkpoint and finishes the stream as supervisor_question', async () => {
		const supabase = createStreamingSupabase();
		const question = 'Which exact task should I update?';
		const digest = buildSupervisorDigest();
		const decision = {
			action: 'ask_user',
			question,
			reason: 'repeated_validation_failures',
			checkpoint: {
				digest,
				resumeContext: {
					missing_field: 'task_id',
					last_failed_tool: 'update_onto_task',
					instruction: 'Continue from this checkpoint after the user answers.'
				}
			}
		};

		mocks.streamFastChat.mockImplementationOnce(
			async ({ onDelta, onSupervisorDecision }: Row) => {
				await onSupervisorDecision({
					decision,
					digest,
					at: '2026-05-24T00:00:00.000Z',
					source: 'monitor',
					trigger: 'repeated_failures'
				});
				await onDelta(question);
				return {
					assistantText: question,
					finalAssistantText: question,
					usage: { total_tokens: 12 },
					finishedReason: 'supervisor_question',
					toolExecutions: [],
					llmPasses: [],
					toolRounds: 2,
					toolCallsMade: 2,
					supervisorDecisions: [
						{
							decision,
							digest,
							at: '2026-05-24T00:00:00.000Z',
							source: 'monitor',
							trigger: 'repeated_failures'
						}
					],
					finalizationGuard: undefined,
					cancelled: false,
					peakPromptTokens: undefined,
					finalContextUsage: undefined
				};
			}
		);

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Update the task',
					context_type: 'global',
					stream_run_id: 'stream-run-1',
					client_turn_id: 'client-turn-1'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());

		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'agent_state',
					state: 'waiting_on_user',
					details: 'Waiting on your direction to continue.'
				}),
				expect.objectContaining({
					type: 'text_delta',
					content: question
				}),
				expect.objectContaining({
					type: 'done',
					finished_reason: 'supervisor_question'
				})
			])
		);

		const checkpoint = supabase.insertedRows.chat_turn_checkpoints?.[0];
		expect(checkpoint).toEqual(
			expect.objectContaining({
				id: 'checkpoint-1',
				session_id: 'session-1',
				user_id: 'user-1',
				checkpoint_type: 'supervisor_question',
				status: 'active',
				reason: 'repeated_validation_failures',
				question
			})
		);
		expect(checkpoint?.digest).toEqual(digest);
		expect(checkpoint?.resume_context).toEqual(
			expect.objectContaining({
				missing_field: 'task_id',
				last_failed_tool: 'update_onto_task'
			})
		);

		const assistantPersistCall = mocks.persistMessage.mock.calls.find(
			([params]) => params.role === 'assistant'
		)?.[0];
		expect(assistantPersistCall).toEqual(
			expect.objectContaining({
				role: 'assistant',
				content: question,
				metadata: expect.objectContaining({
					supervisor_question_checkpoint: {
						checkpoint_id: 'checkpoint-1',
						failed: false
					}
				})
			})
		);

		const completedTurnRun = supabase.updatedRows.chat_turn_runs?.find(
			(row) => row.status === 'completed'
		);
		expect(completedTurnRun).toEqual(
			expect.objectContaining({
				session_id: 'session-1',
				user_id: 'user-1',
				status: 'completed',
				finished_reason: 'supervisor_question',
				tool_round_count: 2,
				tool_call_count: 2,
				assistant_message_id: 'assistant-message-1'
			})
		);

		await new Promise((resolve) => setTimeout(resolve, 0));
		const summaryEvent = supabase.insertedRows.chat_turn_events?.find(
			(row) => row.event_type === 'supervisor_decision_summary'
		);
		expect(summaryEvent?.payload).toEqual(
			expect.objectContaining({
				count: 1,
				actions: ['ask_user'],
				sources: { monitor: 1 },
				triggers: { repeated_failures: 1 }
			})
		);
	});

	it('injects an active supervisor checkpoint into the next turn and marks it resumed', async () => {
		const supabase = createStreamingSupabase({
			chat_turn_checkpoints: [buildCheckpointRow({ id: 'checkpoint-resume' })]
		});
		let capturedHistory: Row[] = [];

		mocks.streamFastChat.mockImplementationOnce(async ({ history, onDelta }: Row) => {
			capturedHistory = history;
			await onDelta('Continuing from the task you clarified.');
			return {
				assistantText: 'Continuing from the task you clarified.',
				finalAssistantText: 'Continuing from the task you clarified.',
				usage: { total_tokens: 10 },
				finishedReason: 'stop',
				toolExecutions: [],
				llmPasses: [],
				toolRounds: 0,
				toolCallsMade: 0,
				supervisorDecisions: [],
				finalizationGuard: undefined,
				cancelled: false,
				peakPromptTokens: undefined,
				finalContextUsage: undefined
			};
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Use the launch checklist task.',
					context_type: 'global',
					stream_run_id: 'stream-run-resume',
					client_turn_id: 'client-turn-resume'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'done',
					finished_reason: 'stop'
				})
			])
		);

		const resumeSystemMessage = capturedHistory.find(
			(message) =>
				message.role === 'system' &&
				typeof message.content === 'string' &&
				message.content.includes('Continue from the previous supervisor checkpoint.')
		);
		expect(resumeSystemMessage?.content).toContain('Which exact task should I update?');
		expect(resumeSystemMessage?.content).toContain('"missing_field":"task_id"');

		const insertedTurnRun = supabase.insertedRows.chat_turn_runs?.[0];
		const resumedCheckpoint = supabase.updatedRows.chat_turn_checkpoints?.find(
			(row) => row.id === 'checkpoint-resume' && row.status === 'resumed'
		);
		expect(resumedCheckpoint).toEqual(
			expect.objectContaining({
				id: 'checkpoint-resume',
				status: 'resumed',
				resume_turn_run_id: insertedTurnRun?.id
			})
		);

		const userPersistCall = mocks.persistMessage.mock.calls.find(
			([params]) => params.role === 'user'
		)?.[0];
		expect(userPersistCall?.metadata).toEqual(
			expect.objectContaining({
				supervisor_resume_checkpoint_id: 'checkpoint-resume',
				supervisor_resume_original_turn_run_id: 'turn-previous'
			})
		);

		const assistantPersistCall = mocks.persistMessage.mock.calls.find(
			([params]) => params.role === 'assistant'
		)?.[0];
		expect(assistantPersistCall?.metadata).toEqual(
			expect.objectContaining({
				supervisor_resume_checkpoint: {
					checkpoint_id: 'checkpoint-resume',
					original_turn_run_id: 'turn-previous',
					reason: 'repeated_validation_failures'
				}
			})
		);
	});
});
