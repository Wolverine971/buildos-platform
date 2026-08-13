// apps/web/src/routes/api/agent/v2/stream/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1,
	AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1,
	AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1,
	AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1,
	AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1,
	AGENTIC_CHAT_TIMEOUT_FIXTURE_V1,
	AGENTIC_CHAT_TIMEOUT_GOLDEN_V1,
	createAgenticChatLegacyParityCoverageTrackerV1,
	normalizeAgenticChatParityRunV1
} from '@buildos/agentic-chat-runtime';

const parityCoverage = createAgenticChatLegacyParityCoverageTrackerV1();

const mocks = vi.hoisted(() => ({
	attachVoiceNoteGroup: vi.fn(),
	composeFastChatHistory: vi.fn(),
	loadPromptContext: vi.fn(),
	loadRecentMessages: vi.fn(),
	logError: vi.fn(),
	loadValidatedChatAttachments: vi.fn(),
	createLiveVisionSignedImages: vi.fn(),
	persistMessage: vi.fn(),
	persistMessageAttachments: vi.fn(),
	reconcile: vi.fn(),
	readFastChatPendingTurnIntent: vi.fn(),
	resolveFastChatTurnIntent: vi.fn(),
	resolveFastChatTurnOutcome: vi.fn(),
	resolveSession: vi.fn(),
	selectFastChatTools: vi.fn(),
	senseDomains: vi.fn(),
	streamFastChat: vi.fn(),
	internalSupabase: null as any,
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

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => mocks.internalSupabase
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

vi.mock('$lib/services/agentic-chat-v2/turn-intent', () => ({
	FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY: 'fastchat_pending_turn_intent',
	readFastChatPendingTurnIntent: mocks.readFastChatPendingTurnIntent,
	resolveFastChatTurnIntent: mocks.resolveFastChatTurnIntent,
	shouldBypassDomainSensingForTurnIntent: () => false
}));

vi.mock('$lib/services/agentic-chat-v2/tool-selector', () => ({
	applyLivingWorkspaceToolProfile: ({ tools }: { tools: unknown[] }) => ({
		tools,
		implicitCapture: false,
		commissionedWriteMinimumCount: 0
	}),
	looksLikeImpliedProjectDocumentCommission: () => false,
	resolveFastChatSurfaceProfileForTurn: () => 'general',
	selectFastChatTools: mocks.selectFastChatTools
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
	resolveLitePromptTurnSituation: () => ({
		writeIntent: false,
		webResearch: false
	}),
	hasActiveSituation: (situation: Row | null | undefined) =>
		Boolean(situation && (situation.writeIntent || situation.webResearch)),
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
	extractFastChatToolCallMeta: (toolCall: Row) => {
		const toolName = toolCall.function?.name ?? '';
		return toolName === 'update_onto_task'
			? {
					toolName,
					helpPath: null,
					canonicalOp: 'onto.task.update',
					args: JSON.parse(toolCall.function.arguments),
					argsParseError: null
				}
			: {};
	}
}));

vi.mock('$lib/services/agentic-chat-v2/prompt-cost-breakdown', () => ({
	buildPromptCostBreakdown: () => ({ total_tokens: 10 })
}));

vi.mock('$lib/services/agentic-chat-v2/tool-surface-size-report', () => ({
	buildToolSurfaceSizeReport: () => ({ tool_count: 0 })
}));

vi.mock('$lib/services/agentic-chat-v2', () => ({
	FASTCHAT_LIMITS: {
		SYNTHESIS_MAX_TOKENS: 8000,
		FORCED_SYNTHESIS_MAX_TOKENS: 6000
	},
	FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY: 'fastchat_pending_turn_intent',
	appendAttachmentContextToMessage: (message: string, attachments: Row[] = []) =>
		attachments.length > 0
			? [
					message,
					`Attachment context: ${attachments.map((item) => item.file_name).join(', ')}`
				]
					.filter(Boolean)
					.join('\n\n')
			: message,
	assessLiveVisionImageEligibility: () => ({ eligible: false, reason: 'disabled' }),
	buildAttachmentOnlyDisplayText: () => 'Attachment',
	buildFastContextUsageSnapshot: () => ({
		estimatedTokens: 12,
		tokenBudget: 1000,
		usagePercent: 1,
		tokensRemaining: 988,
		status: 'ok',
		lastCompressedAt: null,
		lastCompression: null
	}),
	buildLiveVisionContentParts: ({ text }: { text: string }) => text,
	buildFastChatPendingTurnIntent: () => null,
	buildPendingTurnIntentSystemMessage: () => null,
	composeFastChatHistory: mocks.composeFastChatHistory,
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
	getWriteToolNamesForTurnIntent: () => [],
	historyIncludesLoadedSkillsLedger: () => false,
	loadFastChatPromptContext: mocks.loadPromptContext,
	normalizeChatAttachmentRefs: (attachments: Row[] | undefined) => ({
		attachments: attachments ?? [],
		rejected: 0
	}),
	normalizeChatAttachmentsForAdmission: (attachments: Row[] = []) =>
		attachments.map((attachment, inputOrder) => ({
			attachment_kind:
				attachment.attachment_kind === 'temporary_file' ? 'temporary_file' : 'onto_asset',
			media_type: 'image',
			asset_id: attachment.asset_id ?? null,
			temporary_attachment_id: attachment.temporary_attachment_id ?? null,
			project_id: attachment.project_id ?? null,
			role: attachment.role === 'analysis_target' ? 'analysis_target' : 'attachment',
			display_order: attachment.display_order ?? inputOrder,
			file_name: attachment.file_name ?? null,
			content_type: attachment.content_type ?? null,
			file_size_bytes: attachment.file_size_bytes ?? null,
			width: attachment.width ?? null,
			height: attachment.height ?? null,
			checksum_sha256: attachment.checksum_sha256 ?? null,
			ocr_status: attachment.ocr_status ?? null,
			extraction_summary: attachment.extraction_summary ?? null,
			extracted_text_preview: attachment.extracted_text_preview ?? null
		})),
	normalizeFastAgentStreamRequest: (input: Record<string, any>) => ({
		...input,
		lastTurnContext: input?.lastTurnContext ?? input?.last_turn_context ?? null,
		voiceNoteGroupId: input?.voiceNoteGroupId ?? input?.voice_note_group_id,
		prewarmedContext: input?.prewarmedContext ?? input?.prewarmed_context ?? null,
		preparedPromptKey: input?.preparedPromptKey ?? input?.prepared_prompt_key ?? null
	}),
	normalizeFastContextType: (value?: string) => value ?? 'global',
	parseFastChatInitialPlanModels: () => null,
	parseFastChatForcedSynthesisIgnoredProviderSlugs: () => ['digitalocean'],
	parseFastChatForcedSynthesisModels: () => ['synthesis/model'],
	parseFastChatForcedSynthesisRoutingMode: () => 'off',
	parseFastChatPinnedModels: () => [],
	parseFastChatModelTieringMode: () => 'off',
	parseFastChatModelTieringSampleRate: (_value?: string, fallback = 0.5) => fallback,
	resolveFastChatModelTieringConfig: () => null,
	resolveFastChatForcedSynthesisRoutingConfig: () => null,
	resolveFastChatTurnOutcome: mocks.resolveFastChatTurnOutcome,
	projectLegacyFallbackHistorySnapshot: ({ messages }: { messages: Row[] }) =>
		messages.map((message) => ({
			role: message.role,
			content: message.content,
			metadata: message.metadata ?? null
		})),
	sanitizeAttachmentRefsForMetadata: (attachments: Row[] = []) => attachments,
	shouldUseLiveVisionForTurn: () => false,
	streamFastChat: mocks.streamFastChat
}));

vi.mock('$lib/services/agentic-chat-v2/stream-attachments', () => ({
	createLiveVisionSignedImages: mocks.createLiveVisionSignedImages,
	loadValidatedChatAttachments: mocks.loadValidatedChatAttachments,
	resolveChatAttachmentProjectId: () => null
}));

import { GET, POST } from './+server';
import {
	buildPreparedPromptKey,
	buildPreparedPromptSurface
} from '$lib/services/agentic-chat-v2/prepared-prompt-cache';
import { ToolExecutionService } from '$lib/services/agentic-chat/execution/tool-execution-service';

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
	options: {
		admissionResult?: Row;
		insertErrors?: Record<string, unknown>;
		projectAccessAllowed?: boolean;
		actorId?: string | null;
	} = {}
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
		private mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
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

		upsert(value: Row | Row[], upsertOptions?: { onConflict?: string }) {
			this.mode = 'upsert';
			if (options.insertErrors?.[this.table]) {
				this.inserted = [];
				return this;
			}

			const now = new Date().toISOString();
			const conflictColumns = (upsertOptions?.onConflict ?? '')
				.split(',')
				.map((column) => column.trim())
				.filter(Boolean);
			const values = Array.isArray(value) ? value : [value];
			this.inserted = values.map((item) => {
				const existing =
					conflictColumns.length > 0
						? ensureRows(this.table).find((row) =>
								conflictColumns.every(
									(column) =>
										item[column] !== null &&
										item[column] !== undefined &&
										row[column] === item[column]
								)
							)
						: undefined;
				if (existing) {
					Object.assign(existing, item, { updated_at: item.updated_at ?? now });
					return existing;
				}

				const row = {
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
			if (this.mode === 'insert' || this.mode === 'upsert') {
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

	const rpc = vi.fn(async (name: string, args: Row = {}) => {
		if (name === 'ensure_actor_for_user') {
			return {
				data: options.actorId === undefined ? 'actor-1' : options.actorId,
				error: null
			};
		}
		if (name === 'current_actor_has_project_member_access') {
			return { data: options.projectAccessAllowed ?? true, error: null };
		}
		if (name !== 'admit_legacy_agentic_chat_turn') {
			return { data: {}, error: null };
		}
		if (options.admissionResult) {
			return { data: options.admissionResult, error: null };
		}

		const duplicate = ensureRows('chat_turn_runs').find(
			(row) =>
				args.p_client_turn_id &&
				row.user_id === args.p_user_id &&
				row.client_turn_id === args.p_client_turn_id
		);
		if (duplicate) {
			const matchingHash =
				duplicate.request_hash === args.p_request_hash &&
				duplicate.request_hash_version === args.p_request_hash_version;
			return {
				data: {
					outcome: matchingHash ? 'matching_duplicate' : 'idempotency_conflict',
					execution_may_start: false,
					turn_run_id: duplicate.id,
					session_id: duplicate.session_id,
					user_message_id: duplicate.user_message_id ?? null,
					stream_run_id: duplicate.stream_run_id,
					client_turn_id: duplicate.client_turn_id,
					execution_mode: duplicate.execution_mode ?? 'legacy_sse',
					conflict_reason: matchingHash ? null : 'request_hash_mismatch'
				},
				error: null
			};
		}

		const activeTurn = ensureRows('chat_turn_runs').find(
			(row) =>
				row.user_id === args.p_user_id &&
				row.session_id === args.p_session_id &&
				row.status === 'running'
		);
		if (activeTurn || options.insertErrors?.chat_turn_runs) {
			const active =
				activeTurn ??
				({
					id: 'active-turn-conflict',
					session_id: args.p_session_id,
					stream_run_id: 'active-stream-conflict',
					client_turn_id: null,
					user_message_id: null
				} as Row);
			return {
				data: {
					outcome: 'active_turn_conflict',
					execution_may_start: false,
					turn_run_id: active.id,
					session_id: active.session_id,
					user_message_id: active.user_message_id ?? null,
					stream_run_id: active.stream_run_id,
					client_turn_id: active.client_turn_id ?? null,
					execution_mode: 'legacy_sse'
				},
				error: null
			};
		}

		if (options.insertErrors?.chat_messages) {
			return { data: null, error: options.insertErrors.chat_messages };
		}

		const priorMessages = ensureRows('chat_messages')
			.filter(
				(row) =>
					row.session_id === args.p_session_id &&
					['user', 'assistant', 'system'].includes(row.role)
			)
			.sort((left, right) =>
				String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
			)
			.slice(0, args.p_history_limit ?? 10)
			.reverse()
			.map((row) => ({
				id: row.id,
				role: row.role,
				content: row.content,
				metadata: row.metadata ?? null,
				created_at: row.created_at ?? null
			}));
		const now = args.p_started_at ?? new Date().toISOString();
		const turnRow = {
			id: args.p_turn_run_id,
			user_id: args.p_user_id,
			session_id: args.p_session_id,
			user_message_id: args.p_user_message_id,
			stream_run_id: args.p_stream_run_id,
			client_turn_id: args.p_client_turn_id,
			request_hash: args.p_request_hash,
			request_hash_version: args.p_request_hash_version,
			execution_mode: 'legacy_sse',
			source: args.p_source,
			context_type: args.p_context_type,
			entity_id: args.p_entity_id,
			project_id: args.p_project_id,
			gateway_enabled: args.p_gateway_enabled,
			request_message: args.p_request_message,
			request_prewarmed_context: false,
			status: 'running',
			started_at: now,
			last_progress_at: now,
			created_at: now,
			updated_at: now
		};
		const messageRow = {
			id: args.p_user_message_id,
			session_id: args.p_session_id,
			user_id: args.p_user_id,
			role: 'user',
			content: args.p_user_message_content,
			metadata: args.p_user_message_metadata,
			idempotency_key: `chat-turn:${args.p_turn_run_id}:user`,
			created_at: now,
			updated_at: now
		};
		ensureRows('chat_turn_runs').push(turnRow);
		insertedRows.chat_turn_runs.push({ ...turnRow });
		ensureRows('chat_messages').push(messageRow);
		insertedRows.chat_messages.push({ ...messageRow });

		return {
			data: {
				outcome: 'newly_admitted',
				execution_may_start: true,
				turn_run_id: args.p_turn_run_id,
				session_id: args.p_session_id,
				user_message_id: args.p_user_message_id,
				stream_run_id: args.p_stream_run_id,
				client_turn_id: args.p_client_turn_id,
				execution_mode: 'legacy_sse',
				reclaimed_turn_run_id: null,
				fallback_snapshot: {
					messages: priorMessages,
					attachments: [],
					interrupted_tool_executions: [],
					loaded_skill_executions: []
				}
			},
			error: null
		};
	});

	const client = {
		insertedRows,
		updatedRows,
		from: vi.fn((table: string) => new QueryBuilder(table)),
		rpc
	};
	mocks.internalSupabase = client;
	return client;
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

function normalizeSseEventLog(events: Row[]): Row[] {
	return events.map((event) => ({
		type: event.type,
		event_type: event.event_type,
		phase: event.phase ?? null,
		durable: event.durable ?? null,
		turn_phase: event.turn_phase ?? null,
		finished_reason: event.finished_reason ?? null
	}));
}

function normalizePersistenceSnapshot(supabase: {
	insertedRows: Record<string, Row[]>;
	updatedRows: Record<string, Row[]>;
}): Row {
	const admittedTurn = supabase.insertedRows.chat_turn_runs?.[0] ?? {};
	const admittedUserMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
	const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
		.reverse()
		.find((row) => ['completed', 'failed', 'cancelled'].includes(row.status));

	return {
		admitted_turn: {
			status: admittedTurn.status,
			execution_mode: admittedTurn.execution_mode,
			source: admittedTurn.source,
			context_type: admittedTurn.context_type,
			user_message_linked: admittedTurn.user_message_id === admittedUserMessage.id
		},
		admitted_user_message: {
			role: admittedUserMessage.role,
			content: admittedUserMessage.content,
			idempotency_linked:
				admittedUserMessage.idempotency_key === `chat-turn:${admittedTurn.id}:user`
		},
		turn_events: (supabase.insertedRows.chat_turn_events ?? []).map((event) => ({
			sequence_index: event.sequence_index,
			phase: event.phase,
			event_type: event.event_type
		})),
		terminal_turn: terminalTurn
			? {
					status: terminalTurn.status,
					finished_reason: terminalTurn.finished_reason,
					assistant_message_linked: Boolean(terminalTurn.assistant_message_id),
					tool_rounds: terminalTurn.tool_rounds ?? null,
					tool_calls: terminalTurn.tool_calls ?? null
				}
			: null
	};
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
	const createdAt = overrides.created_at ?? new Date().toISOString();
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
			history_for_model_count: Array.isArray(overrides.history_for_model)
				? overrides.history_for_model.length
				: 0,
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
	mocks.composeFastChatHistory.mockImplementation(({ history }: { history: Row[] }) => ({
		historyForModel: history,
		compressed: false,
		strategy: 'raw_history',
		rawHistoryCount: history.length,
		tailMessagesKept: history.length,
		continuityHintUsed: false
	}));
	mocks.readFastChatPendingTurnIntent.mockReturnValue(null);
	mocks.resolveFastChatTurnIntent.mockReturnValue({
		version: 1,
		requiresWrite: false,
		action: null,
		entityKind: 'unknown',
		operations: [],
		source: 'none',
		originalRequestText: null,
		originatingTurnRunId: null,
		clearPending: false
	});
	mocks.resolveFastChatTurnOutcome.mockReturnValue({
		status: 'fulfilled',
		fulfilled: true,
		expectedWriteToolNames: []
	});
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
	mocks.loadValidatedChatAttachments.mockImplementation(
		async ({ attachments }: { attachments: Row[] }) => ({ attachments, assets: [] })
	);
	mocks.createLiveVisionSignedImages.mockResolvedValue([]);
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

	it('rejects an unauthenticated POST before durable turn admission', async () => {
		const supabase = createStreamingSupabase();
		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({ message: 'Do not persist this' })
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(401);
		expect(supabase.rpc).not.toHaveBeenCalledWith(
			'admit_legacy_agentic_chat_turn',
			expect.anything()
		);
		expect(supabase.insertedRows.chat_messages ?? []).toHaveLength(0);
		expect(mocks.streamFastChat).not.toHaveBeenCalled();
	});

	it('denies project access before durable turn admission', async () => {
		const projectId = '22222222-2222-4222-8222-222222222222';
		const supabase = createStreamingSupabase({}, { projectAccessAllowed: false });
		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Do not persist this either',
					context_type: 'project',
					entity_id: projectId,
					stream_run_id: 'stream-run-access-denied'
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
				expect.objectContaining({ type: 'error', turn_rejected: true }),
				expect.objectContaining({ type: 'done', finished_reason: 'error' })
			])
		);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: projectId,
			p_required_access: 'read'
		});
		expect(supabase.rpc).not.toHaveBeenCalledWith(
			'admit_legacy_agentic_chat_turn',
			expect.anything()
		);
		expect(supabase.insertedRows.chat_messages ?? []).toHaveLength(0);
		expect(mocks.streamFastChat).not.toHaveBeenCalled();
	});

	it('passes frozen prior history and the current user message exactly once to the runtime', async () => {
		const priorHistory = [
			{ role: 'user', content: 'Earlier question', metadata: null },
			{ role: 'assistant', content: 'Earlier answer', metadata: null }
		];
		const supabase = createStreamingSupabase({
			chat_messages: priorHistory.map((message, index) => ({
				id: `prior-message-${index + 1}`,
				session_id: 'session-1',
				user_id: 'user-1',
				...message,
				metadata: null,
				created_at: `2026-05-24T00:00:0${index}.000Z`
			}))
		});
		let capturedHistory: Row[] = [];
		let capturedMessage = '';
		mocks.streamFastChat.mockImplementationOnce(async ({ history, message, onDelta }: Row) => {
			capturedHistory = history;
			capturedMessage = message;
			await onDelta('Current answer');
			return {
				assistantText: 'Current answer',
				finalAssistantText: 'Current answer',
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
					message: 'Current command',
					context_type: 'global',
					stream_run_id: 'stream-run-exact-once',
					client_turn_id: 'client-turn-exact-once'
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
		expect(mocks.composeFastChatHistory).toHaveBeenCalledWith(
			expect.objectContaining({ history: priorHistory })
		);
		expect(capturedHistory).toEqual(priorHistory);
		expect(capturedHistory).not.toContainEqual({ role: 'user', content: 'Current command' });
		expect(capturedMessage).toBe('Current command');
		expect(mocks.loadRecentMessages).not.toHaveBeenCalled();
		expect(supabase.insertedRows.chat_messages).toEqual([
			expect.objectContaining({
				role: 'user',
				content: 'Current command',
				idempotency_key: expect.stringMatching(/^chat-turn:.*:user$/)
			})
		]);
		expect(supabase.insertedRows.chat_turn_runs).toEqual([
			expect.objectContaining({
				user_message_id: supabase.insertedRows.chat_messages[0]?.id
			})
		]);
		expect(mocks.persistMessage.mock.calls.some(([params]) => params.role === 'user')).toBe(
			false
		);
		expect(
			[...capturedHistory.map((entry) => entry.content), capturedMessage].filter(
				(content) => content === 'Current command'
			)
		).toHaveLength(1);
	});

	it('keeps normalized SSE and persistence snapshots equal across cold and prepared history', async () => {
		const runTurn = async (params: {
			streamRunId: string;
			clientTurnId: string;
			preparedPrompt?: ReturnType<typeof buildPreparedPromptRow>;
		}) => {
			const supabase = createStreamingSupabase(
				params.preparedPrompt
					? { agentic_chat_prepared_prompts: [params.preparedPrompt.row] }
					: {}
			);
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Snapshot this lifecycle',
						context_type: 'global',
						stream_run_id: params.streamRunId,
						client_turn_id: params.clientTurnId,
						...(params.preparedPrompt
							? { preparedPromptKey: params.preparedPrompt.key }
							: {})
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const sse = normalizeSseEventLog(parseSseEvents(await response.text()));
			await new Promise((resolve) => setTimeout(resolve, 0));
			return {
				sse,
				persistence: normalizePersistenceSnapshot(supabase)
			};
		};

		const cold = await runTurn({
			streamRunId: 'stream-run-normalized-cold',
			clientTurnId: 'client-turn-normalized-cold'
		});
		const prepared = await runTurn({
			streamRunId: 'stream-run-normalized-prepared',
			clientTurnId: 'client-turn-normalized-prepared',
			preparedPrompt: buildPreparedPromptRow()
		});

		expect(prepared).toEqual(cold);
		expect(cold).toEqual({
			sse: [
				{
					type: 'turn_phase',
					event_type: 'turn_phase',
					phase: 'stream',
					durable: false,
					turn_phase: 'acknowledged',
					finished_reason: null
				},
				{
					type: 'session',
					event_type: 'session',
					phase: 'stream',
					durable: false,
					turn_phase: null,
					finished_reason: null
				},
				{
					type: 'context_usage',
					event_type: 'context_usage',
					phase: 'stream',
					durable: true,
					turn_phase: null,
					finished_reason: null
				},
				{
					type: 'text_delta',
					event_type: 'text_delta',
					phase: 'llm',
					durable: true,
					turn_phase: null,
					finished_reason: null
				},
				{
					type: 'turn_phase',
					event_type: 'turn_phase',
					phase: 'stream',
					durable: true,
					turn_phase: 'finalizing',
					finished_reason: null
				},
				{
					type: 'last_turn_context',
					event_type: 'last_turn_context',
					phase: 'finalize',
					durable: true,
					turn_phase: null,
					finished_reason: null
				},
				{
					type: 'timing',
					event_type: 'timing',
					phase: 'finalize',
					durable: true,
					turn_phase: null,
					finished_reason: null
				},
				{
					type: 'done',
					event_type: 'done',
					phase: 'finalize',
					durable: true,
					turn_phase: null,
					finished_reason: 'stop'
				}
			],
			persistence: {
				admitted_turn: {
					status: 'running',
					execution_mode: 'legacy_sse',
					source: 'live_ui',
					context_type: 'global',
					user_message_linked: true
				},
				admitted_user_message: {
					role: 'user',
					content: 'Snapshot this lifecycle',
					idempotency_linked: true
				},
				turn_events: [
					{
						sequence_index: 1,
						phase: 'prompt',
						event_type: 'turn_intent_resolved'
					},
					{
						sequence_index: 2,
						phase: 'prompt',
						event_type: 'prepared_prompt_cache_checked'
					},
					{
						sequence_index: 3,
						phase: 'stream',
						event_type: 'turn_phase_changed'
					},
					{
						sequence_index: 4,
						phase: 'finalize',
						event_type: 'turn_outcome_resolved'
					},
					{
						sequence_index: 5,
						phase: 'finalize',
						event_type: 'orchestration_interventions'
					},
					{
						sequence_index: 6,
						phase: 'finalize',
						event_type: 'done_emitted'
					},
					{
						sequence_index: 7,
						phase: 'prompt',
						event_type: 'prompt_snapshot_created'
					}
				],
				terminal_turn: {
					status: 'completed',
					finished_reason: 'stop',
					assistant_message_linked: true,
					tool_rounds: null,
					tool_calls: null
				}
			}
		});
	});

	it('matches the Phase 4 deterministic text-only legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso));
		try {
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.persistMessage.mockImplementationOnce(
				async ({
					role,
					content,
					metadata
				}: {
					role: string;
					content: string;
					metadata?: Row;
				}) => ({
					id: `${role}-message-1`,
					role,
					content,
					metadata,
					created_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso
				})
			);
			mocks.streamFastChat.mockImplementationOnce(async ({ onDelta }: Row) => {
				await onDelta(AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText);
				return {
					assistantText: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText,
					finalAssistantText:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText,
					usage: {
						prompt_tokens:
							AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage.promptTokens,
						completion_tokens:
							AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage
								.completionTokens,
						total_tokens:
							AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage.totalTokens
					},
					finishedReason:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.finishedReason,
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
			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.request.message,
						context_type: 'global',
						stream_run_id: 'phase-4-legacy-stream',
						client_turn_id: 'phase-4-legacy-client'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const events = parseSseEvents(await response.text());
			await new Promise((resolve) => setTimeout(resolve, 0));
			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const assistantCall = mocks.persistMessage.mock.calls.find(
				([input]) => input.role === 'assistant'
			)?.[0];
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'completed');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [
					{ role: userMessage.role, content: userMessage.content },
					{
						role: assistantCall?.role,
						content: assistantCall?.content,
						metadata: {
							completion_status: assistantCall?.metadata?.completion_status,
							answer_source: assistantCall?.metadata?.answer_source
						}
					}
				],
				toolExecutions: (supabase.insertedRows.chat_tool_executions ?? []).map((row) => ({
					tool_name: row.tool_name,
					status: row.status
				})),
				checkpoints: (supabase.insertedRows.chat_turn_checkpoints ?? []).map((row) => ({
					checkpoint_type: row.checkpoint_type,
					status: row.status
				})),
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					admission: {
						status: supabase.insertedRows.chat_turn_runs?.[0]?.status,
						context_type: supabase.insertedRows.chat_turn_runs?.[0]?.context_type,
						user_message_linked:
							supabase.insertedRows.chat_turn_runs?.[0]?.user_message_id ===
							userMessage.id
					},
					lifecycle_events: (supabase.insertedRows.chat_turn_events ?? []).map(
						(event) => ({
							phase: event.phase,
							event_type: event.event_type
						})
					),
					prompt_snapshot_count: (supabase.insertedRows.chat_prompt_snapshots ?? [])
						.length
				}
			});
			const evaluation = parityCoverage.evaluate('success', run);
			expect(run).toEqual(AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('matches the Phase 4 deterministic read-only tool legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso));
		try {
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.persistMessage.mockImplementationOnce(
				async ({
					role,
					content,
					metadata
				}: {
					role: string;
					content: string;
					metadata?: Row;
				}) => ({
					id: `${role}-message-read-1`,
					role,
					content,
					metadata,
					created_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso
				})
			);
			const toolCall = {
				id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.callId,
				type: 'function',
				function: {
					name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name,
					arguments: JSON.stringify(AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.arguments)
				}
			};
			const toolResult = {
				tool_call_id: toolCall.id,
				result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.result,
				success: true,
				duration_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.durationMs,
				tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.tokensConsumed
			};
			const validationFailureToolCall = {
				id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.callId,
				type: 'function',
				function: {
					name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.name,
					arguments: JSON.stringify(
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.arguments
					)
				}
			};
			const validationFailureToolResult = {
				tool_call_id: validationFailureToolCall.id,
				result: null,
				success: false,
				error: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.error
			};
			const secondToolCall = {
				id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.callId,
				type: 'function',
				function: {
					name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name,
					arguments: JSON.stringify(
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.arguments
					)
				}
			};
			const secondToolResult = {
				tool_call_id: secondToolCall.id,
				result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.result,
				success: true,
				duration_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.durationMs,
				tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.tokensConsumed
			};
			const thirdToolCall = {
				id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.callId,
				type: 'function',
				function: {
					name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name,
					arguments: JSON.stringify(
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.arguments
					)
				}
			};
			const thirdToolResult = {
				tool_call_id: thirdToolCall.id,
				result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.result,
				success: true,
				duration_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.durationMs,
				tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.tokensConsumed
			};
			mocks.streamFastChat.mockImplementationOnce(
				async ({ onToolCall, onToolResult, onDelta }: Row) => {
					await onToolCall?.(toolCall);
					await onToolResult?.({ toolCall, result: toolResult });
					await onToolCall?.(validationFailureToolCall);
					await onToolResult?.({
						toolCall: validationFailureToolCall,
						result: validationFailureToolResult
					});
					await onToolCall?.(secondToolCall);
					await onToolResult?.({ toolCall: secondToolCall, result: secondToolResult });
					await onToolCall?.(thirdToolCall);
					await onToolResult?.({ toolCall: thirdToolCall, result: thirdToolResult });
					await onDelta(AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText);
					return {
						assistantText:
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText,
						finalAssistantText:
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText,
						usage: {
							prompt_tokens:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage.promptTokens,
							completion_tokens:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage
									.completionTokens,
							total_tokens:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage.totalTokens
						},
						finishedReason:
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.finishedReason,
						toolExecutions: [
							{ toolCall, result: toolResult },
							{
								toolCall: validationFailureToolCall,
								result: validationFailureToolResult
							},
							{ toolCall: secondToolCall, result: secondToolResult },
							{ toolCall: thirdToolCall, result: thirdToolResult }
						],
						llmPasses: [],
						toolRounds: 4,
						toolCallsMade: 4,
						supervisorDecisions: [],
						finalizationGuard: undefined,
						cancelled: false,
						peakPromptTokens: undefined,
						finalContextUsage: undefined
					};
				}
			);
			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.message,
						context_type: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.contextType,
						stream_run_id: 'phase-4-legacy-read-stream',
						client_turn_id: 'phase-4-legacy-read-client'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const events = parseSseEvents(await response.text());
			await new Promise((resolve) => setTimeout(resolve, 0));
			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const assistantCall = mocks.persistMessage.mock.calls.find(
				([input]) => input.role === 'assistant'
			)?.[0];
			const assistantResult = await mocks.persistMessage.mock.results.find(
				(result) => result.type === 'return'
			)?.value;
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'completed');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [
					{ role: userMessage.role, content: userMessage.content },
					{
						role: assistantCall?.role,
						content: assistantCall?.content,
						metadata: {
							completion_status: assistantCall?.metadata?.completion_status,
							answer_source: assistantCall?.metadata?.answer_source
						}
					}
				],
				toolExecutions: (supabase.insertedRows.chat_tool_executions ?? []).map((row) => ({
					tool_name: row.tool_name,
					tool_category: row.tool_category ?? null,
					sequence_index: row.sequence_index,
					arguments: row.arguments,
					result: row.result,
					execution_time_ms: row.execution_time_ms,
					tokens_consumed: row.tokens_consumed,
					success: row.success,
					affected_entities: row.affected_entities,
					message_linked: row.message_id === assistantResult?.id
				})),
				checkpoints: [],
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					tool_round_count: terminalTurn?.tool_round_count,
					tool_call_count: terminalTurn?.tool_call_count,
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					admission: {
						status: supabase.insertedRows.chat_turn_runs?.[0]?.status,
						context_type: supabase.insertedRows.chat_turn_runs?.[0]?.context_type,
						user_message_linked:
							supabase.insertedRows.chat_turn_runs?.[0]?.user_message_id ===
							userMessage.id
					},
					lifecycle_events: (supabase.insertedRows.chat_turn_events ?? []).map(
						(event) => ({
							phase: event.phase,
							event_type: event.event_type
						})
					),
					prompt_snapshot_count: (supabase.insertedRows.chat_prompt_snapshots ?? [])
						.length
				}
			});
			const evaluation = parityCoverage.evaluate('read_only_tools', run);
			expect(run).toEqual(AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('matches the Phase 4 deterministic mutating-tool legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso));
		try {
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.loadPromptContext.mockResolvedValueOnce({
				contextType: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.contextType,
				entityId: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.entityId,
				projectId: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.entityId,
				projectName: 'Fixture project',
				focusEntityType: null,
				focusEntityId: null,
				focusEntityName: null,
				conversationSummary: null,
				data: {
					project: {
						id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.entityId,
						name: 'Fixture project'
					}
				}
			});
			mocks.persistMessage.mockImplementationOnce(
				async ({
					role,
					content,
					metadata
				}: {
					role: string;
					content: string;
					metadata?: Row;
				}) => ({
					id: `${role}-message-mutation-1`,
					role,
					content,
					metadata,
					created_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso
				})
			);
			const toolCall = {
				id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.callId,
				type: 'function',
				function: {
					name: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.name,
					arguments: JSON.stringify(AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.arguments)
				}
			};
			const toolResult = {
				tool_call_id: toolCall.id,
				result: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.result,
				success: true
			};
			mocks.streamFastChat.mockImplementationOnce(
				async ({ onToolCall, onToolResult, onDelta }: Row) => {
					await onToolCall?.(toolCall);
					await onToolResult?.({ toolCall, result: toolResult });
					await onDelta(AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.assistantText);
					return {
						assistantText: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.assistantText,
						finalAssistantText:
							AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.assistantText,
						usage: {
							prompt_tokens:
								AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage.promptTokens,
							completion_tokens:
								AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage
									.completionTokens,
							total_tokens:
								AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage.totalTokens
						},
						finishedReason:
							AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.finishedReason,
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
			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.message,
						context_type: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.contextType,
						entity_id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.entityId,
						stream_run_id: 'phase-4-legacy-mutation-stream',
						client_turn_id: 'phase-4-legacy-mutation-client'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const events = parseSseEvents(await response.text());
			await new Promise((resolve) => setTimeout(resolve, 0));
			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const assistantCall = mocks.persistMessage.mock.calls.find(
				([input]) => input.role === 'assistant'
			)?.[0];
			const assistantResult = await mocks.persistMessage.mock.results.find(
				(result) => result.type === 'return'
			)?.value;
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'completed');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [
					{ role: userMessage.role, content: userMessage.content },
					{
						role: assistantCall?.role,
						content: assistantCall?.content,
						metadata: {
							completion_status: assistantCall?.metadata?.completion_status,
							answer_source: assistantCall?.metadata?.answer_source
						}
					}
				],
				toolExecutions: (supabase.insertedRows.chat_tool_executions ?? []).map((row) => ({
					tool_name: row.tool_name,
					tool_category: row.tool_category ?? null,
					gateway_op: row.gateway_op ?? null,
					effect_id: row.effect_id ?? null,
					provider_tool_call_id: row.provider_tool_call_id,
					sequence_index: row.sequence_index,
					arguments: row.arguments,
					result: row.result,
					execution_time_ms: row.execution_time_ms,
					tokens_consumed: row.tokens_consumed,
					requires_user_action: row.requires_user_action,
					success: row.success,
					affected_entities: row.affected_entities,
					message_linked: row.message_id === assistantResult?.id
				})),
				checkpoints: [],
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					tool_round_count: terminalTurn?.tool_round_count,
					tool_call_count: terminalTurn?.tool_call_count,
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					admission: {
						status: supabase.insertedRows.chat_turn_runs?.[0]?.status,
						context_type: supabase.insertedRows.chat_turn_runs?.[0]?.context_type,
						user_message_linked:
							supabase.insertedRows.chat_turn_runs?.[0]?.user_message_id ===
							userMessage.id
					},
					lifecycle_events: (supabase.insertedRows.chat_turn_events ?? []).map(
						(event) => ({ phase: event.phase, event_type: event.event_type })
					),
					prompt_snapshot_count: (supabase.insertedRows.chat_prompt_snapshots ?? [])
						.length
				}
			});
			const evaluation = parityCoverage.evaluate('mutating_tools', run);
			expect(run).toEqual(AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('persists mixed read and mutation telemetry with the trusted internal client', async () => {
		const userSupabase = createStreamingSupabase();
		const internalSupabase = createStreamingSupabase();
		const mutationCall = {
			id: 'call-update-task',
			type: 'function',
			function: {
				name: 'update_onto_task',
				arguments: JSON.stringify({ task_id: 'task-1', status: 'done' })
			}
		};
		const mutationResult = {
			tool_call_id: mutationCall.id,
			result: { id: 'task-1', status: 'done' },
			success: true
		};
		const readCall = {
			id: 'call-list-tasks',
			type: 'function',
			function: {
				name: 'list_onto_tasks',
				arguments: JSON.stringify({ project_id: 'project-1' })
			}
		};
		const readResult = {
			tool_call_id: readCall.id,
			result: { tasks: [{ id: 'task-1', status: 'done' }] },
			success: true
		};

		mocks.streamFastChat.mockImplementationOnce(
			async ({ onToolCall, onToolResult, onDelta }: Row) => {
				await onToolCall?.(mutationCall);
				await onToolResult?.({ toolCall: mutationCall, result: mutationResult });
				await onToolCall?.(readCall);
				await onToolResult?.({ toolCall: readCall, result: readResult });
				await onDelta('Updated the task and verified the result.');
				return {
					assistantText: 'Updated the task and verified the result.',
					finalAssistantText: 'Updated the task and verified the result.',
					usage: { total_tokens: 24 },
					finishedReason: 'stop',
					toolExecutions: [
						{ toolCall: mutationCall, result: mutationResult },
						{ toolCall: readCall, result: readResult }
					],
					llmPasses: [],
					toolRounds: 2,
					toolCallsMade: 2,
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
					message: 'Finish the task and confirm it',
					context_type: 'global',
					stream_run_id: 'mixed-tool-stream',
					client_turn_id: 'mixed-tool-client'
				})
			}),
			locals: {
				supabase: userSupabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);

		expect(response.status).toBe(200);
		await response.text();
		expect(userSupabase.from).not.toHaveBeenCalledWith('chat_tool_executions');
		expect(internalSupabase.insertedRows.chat_tool_executions).toEqual([
			expect.objectContaining({
				provider_tool_call_id: mutationCall.id,
				message_id: 'assistant-message-1',
				sequence_index: 1
			}),
			expect.objectContaining({
				provider_tool_call_id: readCall.id,
				message_id: 'assistant-message-1',
				sequence_index: 2
			})
		]);
	});

	it('matches the Phase 4 deterministic partial-cancellation legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso));
		try {
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.persistMessage.mockImplementationOnce(
				async ({
					role,
					content,
					metadata
				}: {
					role: string;
					content: string;
					metadata?: Row;
				}) => ({
					id: `${role}-message-cancelled`,
					role,
					content,
					metadata,
					created_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso
				})
			);
			mocks.streamFastChat.mockImplementationOnce(async ({ onDelta }: Row) => {
				await onDelta(AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText);
				return {
					assistantText:
						AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText,
					finalAssistantText:
						AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText,
					usage: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.usage,
					finishedReason:
						AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.finishedReason,
					toolExecutions: [],
					llmPasses: [],
					toolRounds: 0,
					toolCallsMade: 0,
					supervisorDecisions: [],
					finalizationGuard: undefined,
					cancelled: true,
					peakPromptTokens: undefined,
					finalContextUsage: undefined
				};
			});
			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.message,
						context_type:
							AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.contextType,
						stream_run_id: 'phase-4-cancelled-legacy-stream',
						client_turn_id: 'phase-4-cancelled-legacy-client'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const events = parseSseEvents(await response.text());
			await new Promise((resolve) => setTimeout(resolve, 0));
			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const assistantCall = mocks.persistMessage.mock.calls.find(
				([input]) => input.role === 'assistant'
			)?.[0];
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'cancelled');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [
					{ role: userMessage.role, content: userMessage.content },
					{
						role: assistantCall?.role,
						content: assistantCall?.content,
						metadata: {
							interrupted: assistantCall?.metadata?.interrupted,
							interrupted_reason: assistantCall?.metadata?.interrupted_reason,
							finished_reason: assistantCall?.metadata?.finished_reason,
							partial_tokens: assistantCall?.metadata?.partial_tokens
						}
					}
				],
				toolExecutions: (supabase.insertedRows.chat_tool_executions ?? []).map((row) => ({
					tool_name: row.tool_name,
					status: row.status
				})),
				checkpoints: (supabase.insertedRows.chat_turn_checkpoints ?? []).map((row) => ({
					checkpoint_type: row.checkpoint_type,
					status: row.status
				})),
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					admission: {
						status: supabase.insertedRows.chat_turn_runs?.[0]?.status,
						context_type: supabase.insertedRows.chat_turn_runs?.[0]?.context_type,
						user_message_linked:
							supabase.insertedRows.chat_turn_runs?.[0]?.user_message_id ===
							userMessage.id
					},
					lifecycle_events: (supabase.insertedRows.chat_turn_events ?? []).map(
						(event) => ({
							phase: event.phase,
							event_type: event.event_type
						})
					),
					prompt_snapshot_count: (supabase.insertedRows.chat_prompt_snapshots ?? [])
						.length
				}
			});
			const evaluation = parityCoverage.evaluate('cancellation', run);
			expect(run).toEqual(AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('captures the Phase 4 deterministic provider-error legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.clockIso));
		try {
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.streamFastChat.mockImplementationOnce(async ({ onDelta }: Row) => {
				await onDelta(AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.response.assistantText);
				throw new Error('Provider stream failed after a partial response');
			});
			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.request.message,
						context_type: AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.request.contextType,
						stream_run_id: 'phase-4-provider-error-legacy-stream',
						client_turn_id: 'phase-4-provider-error-legacy-client'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const events = parseSseEvents(await response.text());
			await new Promise((resolve) => setTimeout(resolve, 0));
			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'failed');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [{ role: userMessage.role, content: userMessage.content }],
				toolExecutions: (supabase.insertedRows.chat_tool_executions ?? []).map((row) => ({
					tool_name: row.tool_name,
					status: row.status
				})),
				checkpoints: (supabase.insertedRows.chat_turn_checkpoints ?? []).map((row) => ({
					checkpoint_type: row.checkpoint_type,
					status: row.status
				})),
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					admission: {
						status: supabase.insertedRows.chat_turn_runs?.[0]?.status,
						context_type: supabase.insertedRows.chat_turn_runs?.[0]?.context_type,
						user_message_linked:
							supabase.insertedRows.chat_turn_runs?.[0]?.user_message_id ===
							userMessage.id
					},
					lifecycle_events: (supabase.insertedRows.chat_turn_events ?? []).map(
						(event) => ({ phase: event.phase, event_type: event.event_type })
					),
					prompt_snapshot_count: (supabase.insertedRows.chat_prompt_snapshots ?? [])
						.length
				}
			});
			const evaluation = parityCoverage.evaluate('provider_error', run);
			expect(run).toEqual(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('captures the Phase 4 deterministic provider-timeout legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_TIMEOUT_FIXTURE_V1.clockIso));
		try {
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: AGENTIC_CHAT_TIMEOUT_FIXTURE_V1.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.streamFastChat.mockRejectedValueOnce(
				new Error('Provider execution deadline exceeded')
			);
			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: AGENTIC_CHAT_TIMEOUT_FIXTURE_V1.request.message,
						context_type: AGENTIC_CHAT_TIMEOUT_FIXTURE_V1.request.contextType,
						stream_run_id: 'phase-4-timeout-legacy-stream',
						client_turn_id: 'phase-4-timeout-legacy-client'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
			const events = parseSseEvents(await response.text());
			await new Promise((resolve) => setTimeout(resolve, 0));
			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'failed');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [{ role: userMessage.role, content: userMessage.content }],
				toolExecutions: (supabase.insertedRows.chat_tool_executions ?? []).map((row) => ({
					tool_name: row.tool_name,
					status: row.status
				})),
				checkpoints: (supabase.insertedRows.chat_turn_checkpoints ?? []).map((row) => ({
					checkpoint_type: row.checkpoint_type,
					status: row.status
				})),
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					admission: {
						status: supabase.insertedRows.chat_turn_runs?.[0]?.status,
						context_type: supabase.insertedRows.chat_turn_runs?.[0]?.context_type,
						user_message_linked:
							supabase.insertedRows.chat_turn_runs?.[0]?.user_message_id ===
							userMessage.id
					},
					lifecycle_events: (supabase.insertedRows.chat_turn_events ?? []).map(
						(event) => ({ phase: event.phase, event_type: event.event_type })
					),
					prompt_snapshot_count: (supabase.insertedRows.chat_prompt_snapshots ?? [])
						.length
				}
			});
			const evaluation = parityCoverage.evaluate('timeout', run);
			expect(run).toEqual(AGENTIC_CHAT_TIMEOUT_GOLDEN_V1);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('admits an attachment-only turn and uses the admitted user message for attachment linkage', async () => {
		const attachment = {
			attachment_kind: 'onto_asset',
			media_type: 'image',
			asset_id: '33333333-3333-4333-8333-333333333333',
			project_id: null,
			file_name: 'diagram.png',
			content_type: 'image/png',
			file_size_bytes: 321,
			width: 1200,
			height: 800,
			role: 'attachment',
			display_order: 0
		};
		const supabase = createStreamingSupabase();
		let capturedMessage = '';
		mocks.streamFastChat.mockImplementationOnce(async ({ message, onDelta }: Row) => {
			capturedMessage = message;
			await onDelta('I can see the diagram.');
			return {
				assistantText: 'I can see the diagram.',
				finalAssistantText: 'I can see the diagram.',
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
					message: '',
					attachments: [attachment],
					context_type: 'global',
					stream_run_id: 'stream-run-attachment-only',
					client_turn_id: 'client-turn-attachment-only'
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
		const admittedUserMessage = supabase.insertedRows.chat_messages[0];
		expect(admittedUserMessage).toEqual(
			expect.objectContaining({
				role: 'user',
				content: 'Attachment',
				metadata: expect.objectContaining({
					attachment_count: 1,
					attachment_only: true
				})
			})
		);
		expect(capturedMessage).toContain('Attachment context: diagram.png');
		expect(mocks.persistMessageAttachments).toHaveBeenCalledWith(
			expect.objectContaining({
				messageId: admittedUserMessage.id,
				attachments: [attachment]
			})
		);
		expect(supabase.insertedRows.chat_turn_runs[0]).toEqual(
			expect.objectContaining({ user_message_id: admittedUserMessage.id })
		);
		expect(mocks.persistMessage.mock.calls.some(([params]) => params.role === 'user')).toBe(
			false
		);
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
		const preparedHistory = [
			{ role: 'user', content: 'Prepared question' },
			{ role: 'assistant', content: 'Prepared answer' }
		];
		const preparedPrompt = buildPreparedPromptRow({
			history_for_model: preparedHistory,
			raw_history_count: preparedHistory.length
		});
		const supabase = createStreamingSupabase({
			agentic_chat_prepared_prompts: [preparedPrompt.row],
			chat_messages: [
				{
					id: 'fallback-message-1',
					session_id: 'session-1',
					user_id: 'user-1',
					role: 'user',
					content: 'Fallback history must not win',
					metadata: null,
					created_at: '2026-05-24T00:00:00.000Z'
				}
			]
		});
		const authenticatedFrom = vi.fn((table: string) => {
			if (table === 'agentic_chat_prepared_prompts') {
				throw new Error('Authenticated client must not read or consume prepared prompts');
			}
			return supabase.from(table);
		});
		const authenticatedSupabase = {
			...supabase,
			from: authenticatedFrom
		};

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
				supabase: authenticatedSupabase,
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
		expect(authenticatedFrom).not.toHaveBeenCalledWith('agentic_chat_prepared_prompts');
		expect(mocks.loadRecentMessages).not.toHaveBeenCalled();
		expect(mocks.composeFastChatHistory).not.toHaveBeenCalled();
		expect(mocks.streamFastChat.mock.calls[0]?.[0]?.history).toEqual(preparedHistory);
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

	it('emits and persists a degraded synthesis recovery with its failed pass and read evidence', async () => {
		const recoveredText =
			'I gathered context before the turn ended. Found: person_mention "Brian Hicks" (candidate).';
		mocks.streamFastChat.mockImplementationOnce(async ({ onDelta, onPhase }: Row) => {
			await onPhase('planning');
			await onPhase('gathering');
			await onPhase('synthesizing');
			await onPhase('recovering');
			await onDelta(recoveredText);
			return {
				assistantText: recoveredText,
				finalAssistantText: recoveredText,
				finishedReason: 'synthesis_recovered',
				toolExecutions: [
					{
						toolCall: {
							id: 'read-1',
							type: 'function',
							function: {
								name: 'search_project',
								arguments: JSON.stringify({ query: 'Brian Hicks' })
							}
						},
						result: {
							tool_call_id: 'read-1',
							success: true,
							result: {
								results: [
									{
										id: 'person-1',
										type: 'person_mention',
										title: 'Brian Hicks'
									}
								]
							}
						}
					}
				],
				llmPasses: [
					{
						pass: 4,
						passRole: 'forced_synthesis',
						forcedNoToolSynthesis: true,
						attempts: 2,
						streamRetryCount: 1,
						durationMs: 120_000,
						terminalOutcome: 'timed_out',
						terminalEventReceived: false,
						assistantTextCharsReceived: 0,
						reasoningCharsReceived: 0,
						toolCallsReceived: 0,
						attemptsExhausted: true,
						recoveredAsDegradedCompletion: true
					}
				],
				toolRounds: 1,
				toolCallsMade: 1,
				supervisorDecisions: [],
				finalizationGuard: {
					text: recoveredText,
					applied: true,
					reason: 'empty_after_reads'
				},
				completionOutcome: {
					status: 'completed_degraded',
					answerSource: 'deterministic_evidence',
					recovery: {
						outcome: 'timed_out',
						measurements: {
							pass: 4,
							passRole: 'forced_synthesis',
							forcedNoToolSynthesis: true,
							attempts: 2,
							maxAttempts: 2,
							retryCount: 1,
							timeoutMs: 60_000,
							durationMs: 120_000,
							terminalEventReceived: false,
							assistantTextCharsReceived: 0,
							reasoningCharsReceived: 0,
							toolCallsReceived: 0,
							retryable: true,
							attemptsExhausted: true
						},
						evidenceToolExecutionCount: 1
					}
				},
				orchestrationInterventions: {
					projectCreateStopRepair: false,
					gatewayMutationStopRepair: false,
					skillGateStopRepair: false,
					gatewaySchemaRepair: false,
					gatewayCreateFieldRepair: false,
					validationRepairRounds: 0,
					readLoopRepairRank: 3,
					forcedSynthesisPasses: 1,
					writeIntentCarveOut: false,
					lengthContinuations: 0,
					documentOrganizationRecovery: false,
					finalizationGuard: true,
					supervisorRecoveryDecisions: 1,
					streamRetries: 1,
					synthesisTransportRecovery: true
				}
			};
		});
		const supabase = createStreamingSupabase();

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Who are the people in this project?',
					context_type: 'global',
					stream_run_id: 'stream-run-degraded',
					client_turn_id: 'client-turn-degraded'
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
		expect(events[0]).toMatchObject({
			type: 'turn_phase',
			turn_phase: 'acknowledged',
			message: 'Request received. Preparing the workspace context...',
			durable: false
		});
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			finished_reason: 'synthesis_recovered',
			completion_status: 'completed_degraded',
			answer_source: 'deterministic_evidence'
		});
		expect(
			events.filter((event) => event.type === 'turn_phase').map((event) => event.turn_phase)
		).toEqual([
			'acknowledged',
			'planning',
			'gathering',
			'synthesizing',
			'recovering',
			'finalizing'
		]);
		const textIndex = events.findIndex((event) => event.type === 'text_delta');
		const finalizingIndex = events.findIndex(
			(event) => event.type === 'turn_phase' && event.turn_phase === 'finalizing'
		);
		expect(textIndex).toBeGreaterThan(0);
		expect(finalizingIndex).toBeGreaterThan(textIndex);

		const assistantPersistCall = mocks.persistMessage.mock.calls.find(
			([params]) => params.role === 'assistant'
		)?.[0];
		expect(assistantPersistCall?.metadata).toMatchObject({
			completion_status: 'completed_degraded',
			answer_source: 'deterministic_evidence',
			completion_outcome: {
				status: 'completed_degraded',
				answerSource: 'deterministic_evidence',
				recovery: { outcome: 'timed_out', evidenceToolExecutionCount: 1 }
			},
			llm_pass_count: 1,
			llm_passes: [
				expect.objectContaining({
					terminal_outcome: 'timed_out',
					attempts_exhausted: true,
					recovered_as_degraded_completion: true
				})
			]
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(
			supabase.insertedRows.chat_turn_events?.find(
				(row) => row.event_type === 'synthesis_transport_recovered'
			)?.payload
		).toMatchObject({
			completion_status: 'completed_degraded',
			answer_source: 'deterministic_evidence',
			recovery_outcome: 'timed_out',
			evidence_tool_execution_count: 1
		});
		expect(supabase.insertedRows.chat_tool_executions?.[0]).toMatchObject({
			tool_name: 'search_project',
			sequence_index: 1
		});
	});

	it('merges loaded outcome-card gaps and used-domain signals into session metadata', async () => {
		mocks.streamFastChat.mockImplementationOnce(async ({ onDelta }: Row) => {
			await onDelta('Loaded the outcome card.');
			return {
				assistantText: 'Loaded the outcome card.',
				finalAssistantText: 'Loaded the outcome card.',
				usage: { total_tokens: 16 },
				finishedReason: 'stop',
				toolExecutions: [
					{
						toolCall: {
							id: 'tool-call-outcome-card-1',
							type: 'function',
							function: {
								name: 'outcome_card_load',
								arguments: JSON.stringify({
									id: 'newsletter_retention_review'
								})
							}
						},
						result: {
							tool_call_id: 'tool-call-outcome-card-1',
							success: true,
							result: {
								type: 'outcome_card',
								id: 'newsletter_retention_review',
								name: 'Newsletter Retention Review',
								domain_ids: ['marketing.content_strategy'],
								coverage_status: 'partial',
								gaps: [
									{
										missing_skill_id: 'newsletter_retention_diagnostics',
										user_need:
											'diagnose retention and churn in a newsletter funnel',
										summary:
											'No dedicated newsletter retention diagnostics skill exists yet.'
									}
								]
							}
						}
					}
				],
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
		const supabase = createStreamingSupabase();

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Load the newsletter retention review outcome card.',
					context_type: 'global',
					stream_run_id: 'stream-run-outcome-card-gap',
					client_turn_id: 'client-turn-outcome-card-gap'
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

		const domainStatePatches = supabase.rpc.mock.calls
			.filter(([procedure, args]) => {
				return (
					procedure === 'merge_chat_session_agent_metadata' &&
					Boolean(args?.p_patch?.fastchat_domain_state)
				);
			})
			.map(([, args]) => args.p_patch.fastchat_domain_state);
		const finalDomainState = domainStatePatches.at(-1);
		expect(finalDomainState).toMatchObject({
			used_domains: [
				expect.objectContaining({
					domain_id: 'marketing.content_strategy',
					source: 'outcome_card_load',
					tool_name: 'outcome_card_load',
					outcome_card_id: 'newsletter_retention_review'
				})
			],
			research_backlog: [
				expect.objectContaining({
					id: 'skill:newsletter_retention_diagnostics',
					kind: 'skill',
					priority: 'medium',
					domain_ids: ['marketing.content_strategy'],
					missing_skill_id: 'newsletter_retention_diagnostics'
				})
			]
		});
		expect(finalDomainState.coverage_gaps).toEqual([
			expect.objectContaining({
				missing_skill_id: 'newsletter_retention_diagnostics',
				domain_ids: ['marketing.content_strategy']
			})
		]);
		const toolSignalEvent = supabase.insertedRows.chat_turn_events?.find(
			(row) => row.event_type === 'domain_tool_signals_merged'
		);
		expect(toolSignalEvent?.payload).toMatchObject({
			used_domain_signal_count: 1,
			loaded_outcome_card_gap_count: 1,
			used_domain_ids: ['marketing.content_strategy'],
			loaded_outcome_card_gap_ids: ['newsletter_retention_diagnostics']
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

	it.each([
		['matching_duplicate', 'matching_duplicate', false, undefined],
		['idempotency_conflict', 'idempotency_conflict', true, 'request_hash_mismatch']
	] as const)(
		'does not execute or consume prepared content for %s admission',
		async (outcome, finishedReason, turnRejected, conflictReason) => {
			const preparedPrompt = buildPreparedPromptRow();
			const supabase = createStreamingSupabase(
				{ agentic_chat_prepared_prompts: [preparedPrompt.row] },
				{
					admissionResult: {
						outcome,
						execution_may_start: false,
						turn_run_id: '00000000-0000-4000-8000-000000000091',
						session_id: 'session-1',
						user_message_id: '00000000-0000-4000-8000-000000000092',
						stream_run_id: 'existing-stream',
						client_turn_id: 'client-turn-duplicate-route',
						execution_mode: 'legacy_sse',
						...(conflictReason ? { conflict_reason: conflictReason } : {})
					}
				}
			);

			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Hello',
						context_type: 'global',
						stream_run_id: `stream-run-${outcome}`,
						client_turn_id: 'client-turn-duplicate-route',
						preparedPromptKey: preparedPrompt.key
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);

			const events = parseSseEvents(await response.text());
			expect(events.find((event) => event.type === 'done')).toEqual(
				expect.objectContaining({ finished_reason: finishedReason })
			);
			expect(events.find((event) => event.type === 'error')?.turn_rejected).toBe(
				turnRejected
			);
			expect(supabase.insertedRows.chat_messages ?? []).toHaveLength(0);
			expect(supabase.updatedRows.agentic_chat_prepared_prompts ?? []).toHaveLength(0);
			expect(mocks.loadPromptContext).not.toHaveBeenCalled();
			expect(mocks.streamFastChat).not.toHaveBeenCalled();
		}
	);

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
		const event = supabase.insertedRows.chat_turn_events?.find(
			(row) => row.event_type === 'prepared_prompt_cache_checked'
		);
		expect(event?.payload).toMatchObject({
			prepared_prompt_requested: false,
			prepared_prompt_hit: false,
			prepared_prompt_miss_reason: 'missing_key',
			prepared_prompt_id: null,
			prepared_prompt_age_seconds: null,
			requested_surface_profile: 'general',
			diagnostics: null
		});
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

			expect(mocks.loadRecentMessages).not.toHaveBeenCalled();
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

	it('records stale prepared-prompt harness diagnostics in turn events', async () => {
		const preparedPrompt = buildPreparedPromptRow();
		mocks.selectFastChatTools.mockReturnValueOnce([
			{
				type: 'function',
				function: {
					name: 'get_workspace_overview',
					description: 'Current description that was not in the prepared surface.',
					parameters: { type: 'object', properties: {} }
				}
			}
		]);
		const supabase = createStreamingSupabase({
			agentic_chat_prepared_prompts: [preparedPrompt.row]
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					context_type: 'global',
					stream_run_id: 'stream-run-stale-harness',
					client_turn_id: 'client-turn-stale-harness',
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

		const event = supabase.insertedRows.chat_turn_events?.find(
			(row) => row.event_type === 'prepared_prompt_cache_checked'
		);
		expect(event?.payload).toMatchObject({
			prepared_prompt_requested: true,
			prepared_prompt_hit: false,
			prepared_prompt_miss_reason: 'stale_harness',
			prepared_prompt_id: preparedPrompt.row.id,
			requested_surface_profile: 'general',
			diagnostics: {
				prepared_prompt_id: preparedPrompt.row.id,
				requested_surface_profile: 'general',
				surface_available: true,
				prepared_tool_names: [],
				actual_tool_names: ['get_workspace_overview'],
				harness_match: false,
				tool_names_match: false,
				tool_definitions_match: false
			}
		});
		expect(
			supabase.updatedRows.chat_turn_runs?.find((row) => row.status === 'completed')
		).toEqual(
			expect.objectContaining({
				cache_source: 'fresh_load',
				prepared_prompt_hit: false,
				prepared_prompt_miss_reason: 'stale_harness'
			})
		);
	});

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
					gaps: [],
					gap_skill_ids: [],
					gap_resource_ids: [],
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
		const planningCueEvents = events.filter(
			(event) =>
				event.type === 'agent_state' && event.details === 'Planning the first step...'
		);
		const planningCueIndex = events.findIndex(
			(event) =>
				event.type === 'agent_state' && event.details === 'Planning the first step...'
		);
		const toolCallIndex = events.findIndex(
			(event) => event.type === 'tool_call' && event.tool_call?.id === 'call-search'
		);
		const liveToolResult = events.find((event) => event.type === 'tool_result');

		expect(planningCueEvents).toHaveLength(1);
		expect(planningCueEvents[0]).toEqual(
			expect.objectContaining({
				state: 'thinking',
				contextType: 'global',
				activity_visibility: 'activity_log'
			})
		);
		expect(planningCueIndex).toBeGreaterThan(-1);
		expect(toolCallIndex).toBeGreaterThan(planningCueIndex);
		expect(liveToolResult?.result).toEqual(
			expect.objectContaining({
				tool_call_id: 'call-search',
				tool_name: 'search_project',
				tool_category: 'search',
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
				tool_category: 'search',
				result_count: 0,
				zero_result: true,
				tokens_consumed: 9,
				requires_user_action: true
			})
		);
	});

	it('retains completed reads and emits timing when a later LLM pass fails', async () => {
		const supabase = createStreamingSupabase();
		const toolCall = {
			id: 'call-read-before-error',
			type: 'function',
			function: {
				name: 'search_project',
				arguments: JSON.stringify({ query: 'launch notes', project_id: 'project-1' })
			}
		};
		const toolResult = {
			tool_call_id: toolCall.id,
			result: { results: [{ id: 'document-1', title: 'Launch notes' }] },
			success: true,
			duration_ms: 17
		};

		mocks.streamFastChat.mockImplementationOnce(async ({ onToolCall, onToolResult }: Row) => {
			await onToolCall?.(toolCall);
			await onToolResult?.({ toolCall, result: toolResult });
			throw new Error('LLM stream pass timed out after 60000ms');
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Read this project and then organize it',
					context_type: 'global',
					stream_run_id: 'stream-run-error-finalization',
					client_turn_id: 'client-turn-error-finalization'
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
		const timingIndex = events.findIndex((event) => event.type === 'timing');
		const doneIndex = events.findIndex(
			(event) => event.type === 'done' && event.finished_reason === 'error'
		);

		expect(events.some((event) => event.type === 'error')).toBe(true);
		expect(timingIndex).toBeGreaterThan(-1);
		expect(doneIndex).toBeGreaterThan(timingIndex);
		expect(events[timingIndex]?.timing?.finished_reason).toBe('error');
		expect(supabase.insertedRows.chat_tool_executions).toEqual([
			expect.objectContaining({
				tool_name: 'search_project',
				sequence_index: 1,
				execution_time_ms: 17,
				success: true
			})
		]);
		expect(supabase.updatedRows.chat_turn_runs?.find((row) => row.status === 'failed')).toEqual(
			expect.objectContaining({ finished_reason: 'error' })
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
		expect(supabase.insertedRows.chat_tool_executions?.[0]).toEqual(
			expect.objectContaining({
				provider_tool_call_id: 'call-create-task',
				affected_entities: [expectedRef]
			})
		);
		const completedTurnRun = supabase.updatedRows.chat_turn_runs?.find(
			(row) => row.status === 'completed'
		);
		expect(completedTurnRun).toEqual(
			expect.objectContaining({
				tool_call_count: 1
			})
		);
	});

	it('preserves the ToolExecutionService call contract for single and batch execution', async () => {
		const supabase = createStreamingSupabase();
		const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
		const toolDefinition = {
			type: 'function',
			function: {
				name: 'list_onto_tasks',
				description: 'List project tasks',
				parameters: {
					type: 'object',
					properties: { project_id: { type: 'string' } },
					required: ['project_id']
				}
			}
		};
		const singleToolCall = {
			id: 'call-single-contract',
			type: 'function',
			function: { name: 'list_onto_tasks', arguments: '{}' }
		};
		const batchToolCall = {
			id: 'call-batch-contract',
			type: 'function',
			function: { name: 'list_onto_tasks', arguments: '{}' }
		};
		const executeSpy = vi
			.spyOn(ToolExecutionService.prototype, 'executeTool')
			.mockImplementation(async (toolCall: Row) => ({
				success: true,
				data: { lane: 'single' },
				toolName: toolCall.function.name,
				toolCallId: toolCall.id,
				streamEvents: [{ type: 'text', content: 'single event' }],
				tokensUsed: 5,
				metadata: { durationMs: 12.6 }
			}));
		const batchSpy = vi
			.spyOn(ToolExecutionService.prototype, 'batchExecuteTools')
			.mockImplementation(async (toolCalls: Row[]) =>
				toolCalls.map((toolCall) => ({
					success: true,
					data: { lane: 'batch' },
					toolName: toolCall.function.name,
					toolCallId: toolCall.id
				}))
			);

		try {
			mocks.selectFastChatTools.mockReturnValueOnce([toolDefinition]);
			mocks.loadPromptContext.mockResolvedValueOnce({
				contextType: 'project',
				entityId: projectId,
				projectId,
				projectName: 'Launch Project',
				focusEntityType: null,
				focusEntityId: null,
				focusEntityName: null,
				conversationSummary: null,
				data: {
					project: { id: projectId, name: 'Launch Project' },
					tasks: []
				}
			});
			mocks.streamFastChat.mockImplementationOnce(
				async ({ toolExecutor, batchToolExecutor, onDelta }: Row) => {
					const singleResult = await toolExecutor(singleToolCall, [toolDefinition]);
					const batchResults = await batchToolExecutor([batchToolCall], [toolDefinition]);
					expect(singleResult).toEqual({
						tool_call_id: 'call-single-contract',
						result: { lane: 'single' },
						success: true,
						duration_ms: 13,
						tokens_consumed: 5,
						stream_events: [{ type: 'text', content: 'single event' }]
					});
					expect(batchResults).toEqual([
						{
							tool_call_id: 'call-batch-contract',
							result: { lane: 'batch' },
							success: true
						}
					]);
					await onDelta('Executed contract fixture.');
					return {
						assistantText: 'Executed contract fixture.',
						finalAssistantText: 'Executed contract fixture.',
						usage: { total_tokens: 8 },
						finishedReason: 'stop',
						toolExecutions: [],
						llmPasses: [],
						toolRounds: 1,
						toolCallsMade: 2,
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
						message: 'List the project tasks',
						context_type: 'project',
						entity_id: projectId,
						stream_run_id: 'stream-run-tool-contract',
						client_turn_id: 'client-turn-tool-contract'
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

			expect(executeSpy).toHaveBeenCalledTimes(1);
			const [singleCall, singleContext, singleDefinitions, singleOptions] =
				executeSpy.mock.calls[0];
			expect(singleCall).toEqual(singleToolCall);
			expect(singleContext).toEqual(
				expect.objectContaining({
					sessionId: 'session-1',
					userId: 'user-1',
					contextType: 'project',
					entityId: projectId,
					originalTurnContext: {
						contextType: 'project',
						entityId: projectId,
						entityName: 'Launch Project'
					},
					contextScope: {
						projectId,
						projectName: 'Launch Project'
					}
				})
			);
			expect(singleDefinitions).toEqual([toolDefinition]);
			expect(singleOptions).toEqual({ abortSignal: expect.any(AbortSignal) });

			expect(batchSpy).toHaveBeenCalledTimes(1);
			const [batchCalls, batchContext, batchDefinitions, maxConcurrency, batchOptions] =
				batchSpy.mock.calls[0];
			expect(batchCalls).toHaveLength(1);
			expect(batchCalls[0]).toMatchObject({
				id: 'call-batch-contract',
				function: { name: 'list_onto_tasks' }
			});
			expect(JSON.parse(batchCalls[0].function.arguments)).toEqual({ project_id: projectId });
			expect(batchContext).toEqual(
				expect.objectContaining({
					contextScope: { projectId, projectName: 'Launch Project' }
				})
			);
			expect(batchDefinitions).toEqual([toolDefinition]);
			expect(maxConcurrency).toBe(3);
			expect(batchOptions).toEqual({ abortSignal: expect.any(AbortSignal) });
		} finally {
			executeSpy.mockRestore();
			batchSpy.mockRestore();
		}
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

	it('narrows ontology context to the focused entity neighborhood for tool execution', async () => {
		const supabase = createStreamingSupabase();
		const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
		const focusTaskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
		const unrelatedTaskId = 'af2046ce-92f9-448c-9a48-05b278514a73';
		const linkedDocumentId = '2860f74f-c3ec-4823-8fcb-66c9d85673a6';
		const linkedGoalId = 'f279c08a-4055-41a6-8e5e-f1bba2065859';
		const inspectDefinition = {
			name: 'inspect_context',
			description: 'Inspect context',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		};
		let capturedContext: Row | null = null;
		const executeSpy = vi
			.spyOn(ToolExecutionService.prototype, 'executeTool')
			.mockImplementation(async (toolCall: Row, context: Row) => {
				capturedContext = context;
				return {
					success: true,
					toolName: toolCall.function.name,
					toolCallId: toolCall.id,
					data: { ok: true }
				} as any;
			});

		try {
			mocks.selectFastChatTools.mockReturnValueOnce([inspectDefinition]);
			mocks.loadPromptContext.mockResolvedValueOnce({
				contextType: 'project',
				entityId: projectId,
				projectId,
				projectName: 'Launch Project',
				focusEntityType: 'task',
				focusEntityId: focusTaskId,
				focusEntityName: 'Focused task',
				conversationSummary: null,
				data: {
					project: { id: projectId, name: 'Launch Project' },
					tasks: [
						{
							id: focusTaskId,
							title: 'Focused task',
							project_id: projectId
						},
						{
							id: unrelatedTaskId,
							title: 'Unrelated task',
							project_id: projectId
						}
					],
					goals: [
						{
							id: '1e4029a5-e880-46ff-9f0f-b77dd71c1adc',
							name: 'Unrelated goal',
							project_id: projectId
						}
					],
					documents: [
						{
							id: '4e8af885-0796-4b35-b8e8-f4d203ac3d23',
							title: 'Unrelated document',
							project_id: projectId
						}
					],
					milestones: [],
					plans: [],
					risks: [],
					focus_entity_type: 'task',
					focus_entity_id: focusTaskId,
					focus_entity_full: {
						id: focusTaskId,
						title: 'Focused task',
						project_id: projectId,
						description: 'Only this task should be carried as focus.'
					},
					linked_entities: {
						document: [
							{
								id: linkedDocumentId,
								title: 'Linked brief',
								project_id: projectId
							}
						],
						goal: [
							{
								id: linkedGoalId,
								name: 'Linked goal',
								project_id: projectId
							}
						]
					},
					doc_structure: {
						version: 1,
						root: [
							{
								id: '4e8af885-0796-4b35-b8e8-f4d203ac3d23',
								title: 'Unrelated document'
							}
						]
					}
				}
			});
			mocks.streamFastChat.mockImplementationOnce(async ({ toolExecutor, onDelta }: Row) => {
				await toolExecutor(
					{
						id: 'call-inspect-context',
						type: 'function',
						function: { name: 'inspect_context', arguments: '{}' }
					},
					[inspectDefinition]
				);
				await onDelta('Inspected context.');
				return {
					assistantText: 'Inspected context.',
					finalAssistantText: 'Inspected context.',
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
						message: 'Work on the focused task',
						context_type: 'project',
						entity_id: projectId,
						projectFocus: {
							focusType: 'task',
							focusEntityId: focusTaskId,
							focusEntityName: 'Focused task',
							projectId,
							projectName: 'Launch Project'
						},
						stream_run_id: 'stream-run-focused-context',
						client_turn_id: 'client-turn-focused-context'
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

			expect(capturedContext?.contextScope).toEqual({
				projectId,
				projectName: 'Launch Project',
				focus: {
					type: 'task',
					id: focusTaskId,
					name: 'Focused task'
				}
			});
			expect(capturedContext?.projectFocus).toMatchObject({
				focusType: 'task',
				focusEntityId: focusTaskId,
				projectId
			});
			const entities = capturedContext?.ontologyContext?.entities ?? {};
			expect(entities.project).toEqual(
				expect.objectContaining({ id: projectId, name: 'Launch Project' })
			);
			expect(entities.tasks).toEqual([
				expect.objectContaining({ id: focusTaskId, title: 'Focused task' })
			]);
			expect(entities.goals).toEqual([
				expect.objectContaining({ id: linkedGoalId, name: 'Linked goal' })
			]);
			expect(entities.documents).toEqual([
				expect.objectContaining({ id: linkedDocumentId, title: 'Linked brief' })
			]);
			expect(JSON.stringify(entities)).not.toContain(unrelatedTaskId);
			expect(JSON.stringify(entities)).not.toContain('Unrelated goal');
			expect(capturedContext?.ontologyContext?.metadata?.document_tree).toBeUndefined();
		} finally {
			executeSpy.mockRestore();
		}
	});

	it('uses a context-shift focus to narrow subsequent tool execution context', async () => {
		const supabase = createStreamingSupabase();
		const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
		const focusedDocumentId = '2860f74f-c3ec-4823-8fcb-66c9d85673a6';
		const unrelatedTaskId = 'af2046ce-92f9-448c-9a48-05b278514a73';
		const inspectDefinition = {
			name: 'inspect_context',
			description: 'Inspect context',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		};
		let capturedContext: Row | null = null;
		const executeSpy = vi
			.spyOn(ToolExecutionService.prototype, 'executeTool')
			.mockImplementation(async (toolCall: Row, context: Row) => {
				capturedContext = context;
				return {
					success: true,
					toolName: toolCall.function.name,
					toolCallId: toolCall.id,
					data: { ok: true }
				} as any;
			});

		try {
			mocks.selectFastChatTools.mockReturnValueOnce([inspectDefinition]);
			mocks.loadPromptContext.mockResolvedValueOnce({
				contextType: 'project',
				entityId: projectId,
				projectId,
				projectName: 'Launch Project',
				focusEntityType: null,
				focusEntityId: null,
				focusEntityName: null,
				conversationSummary: null,
				data: {
					project: { id: projectId, name: 'Launch Project' },
					tasks: [
						{
							id: unrelatedTaskId,
							title: 'Unrelated task',
							project_id: projectId
						}
					],
					documents: [
						{
							id: focusedDocumentId,
							title: 'Focused spec',
							project_id: projectId
						},
						{
							id: '4e8af885-0796-4b35-b8e8-f4d203ac3d23',
							title: 'Unrelated document',
							project_id: projectId
						}
					],
					goals: [],
					milestones: [],
					plans: [],
					risks: [],
					doc_structure: {
						version: 1,
						root: [
							{ id: focusedDocumentId, title: 'Focused spec' },
							{
								id: '4e8af885-0796-4b35-b8e8-f4d203ac3d23',
								title: 'Unrelated document'
							}
						]
					}
				}
			});
			mocks.streamFastChat.mockImplementationOnce(
				async ({ toolExecutor, onToolResult, onDelta }: Row) => {
					await onToolResult?.({
						toolCall: {
							id: 'call-shift',
							type: 'function',
							function: { name: 'change_chat_context', arguments: '{}' }
						},
						result: {
							success: true,
							result: {
								context_shift: {
									new_context: 'project',
									entity_id: focusedDocumentId,
									entity_name: 'Focused spec',
									entity_type: 'document',
									message: 'Focused on the spec.'
								}
							}
						}
					});
					await toolExecutor(
						{
							id: 'call-inspect-after-shift',
							type: 'function',
							function: { name: 'inspect_context', arguments: '{}' }
						},
						[inspectDefinition]
					);
					await onDelta('Inspected shifted context.');
					return {
						assistantText: 'Inspected shifted context.',
						finalAssistantText: 'Inspected shifted context.',
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
				}
			);

			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Focus the spec then continue',
						context_type: 'project',
						entity_id: projectId,
						stream_run_id: 'stream-run-shift-focused-context',
						client_turn_id: 'client-turn-shift-focused-context'
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
						type: 'context_shift',
						context_shift: expect.objectContaining({
							entity_id: focusedDocumentId,
							entity_type: 'document'
						})
					})
				])
			);
			expect(capturedContext?.contextScope).toEqual({
				projectId,
				projectName: 'Launch Project',
				focus: {
					type: 'document',
					id: focusedDocumentId,
					name: 'Focused spec'
				}
			});
			expect(capturedContext?.projectFocus).toMatchObject({
				focusType: 'document',
				focusEntityId: focusedDocumentId,
				projectId
			});
			const entities = capturedContext?.ontologyContext?.entities ?? {};
			expect(entities.documents).toEqual([
				expect.objectContaining({ id: focusedDocumentId, title: 'Focused spec' })
			]);
			expect(JSON.stringify(entities)).not.toContain(unrelatedTaskId);
			expect(capturedContext?.ontologyContext?.metadata?.document_tree).toEqual(
				expect.objectContaining({
					root: expect.arrayContaining([
						expect.objectContaining({ id: focusedDocumentId })
					])
				})
			);
		} finally {
			executeSpy.mockRestore();
		}
	});

	it('drops stale prompt ontology data after a context shift to another project', async () => {
		const supabase = createStreamingSupabase();
		const originalProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
		const shiftedProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
		const staleTaskId = 'af2046ce-92f9-448c-9a48-05b278514a73';
		const inspectDefinition = {
			name: 'inspect_context',
			description: 'Inspect context',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		};
		let capturedContext: Row | null = null;
		const executeSpy = vi
			.spyOn(ToolExecutionService.prototype, 'executeTool')
			.mockImplementation(async (toolCall: Row, context: Row) => {
				capturedContext = context;
				return {
					success: true,
					toolName: toolCall.function.name,
					toolCallId: toolCall.id,
					data: { ok: true }
				} as any;
			});

		try {
			mocks.selectFastChatTools.mockReturnValueOnce([inspectDefinition]);
			mocks.loadPromptContext.mockResolvedValueOnce({
				contextType: 'project',
				entityId: originalProjectId,
				projectId: originalProjectId,
				projectName: 'Original Project',
				focusEntityType: null,
				focusEntityId: null,
				focusEntityName: null,
				conversationSummary: null,
				data: {
					project: { id: originalProjectId, name: 'Original Project' },
					tasks: [
						{
							id: staleTaskId,
							title: 'Stale original task',
							project_id: originalProjectId
						}
					],
					goals: [],
					milestones: [],
					plans: [],
					documents: [],
					risks: []
				}
			});
			mocks.streamFastChat.mockImplementationOnce(
				async ({ toolExecutor, onToolResult, onDelta }: Row) => {
					await onToolResult?.({
						toolCall: {
							id: 'call-project-shift',
							type: 'function',
							function: { name: 'change_chat_context', arguments: '{}' }
						},
						result: {
							success: true,
							result: {
								context_shift: {
									new_context: 'project',
									entity_id: shiftedProjectId,
									entity_name: 'Shifted Project',
									entity_type: 'project',
									message: 'Focused on another project.'
								}
							}
						}
					});
					await toolExecutor(
						{
							id: 'call-inspect-after-project-shift',
							type: 'function',
							function: { name: 'inspect_context', arguments: '{}' }
						},
						[inspectDefinition]
					);
					await onDelta('Inspected shifted project context.');
					return {
						assistantText: 'Inspected shifted project context.',
						finalAssistantText: 'Inspected shifted project context.',
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
				}
			);

			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Switch projects then continue',
						context_type: 'project',
						entity_id: originalProjectId,
						stream_run_id: 'stream-run-project-shift-context',
						client_turn_id: 'client-turn-project-shift-context'
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

			expect(capturedContext?.contextScope).toEqual({
				projectId: shiftedProjectId,
				projectName: 'Shifted Project'
			});
			expect(capturedContext?.projectFocus).toMatchObject({
				focusType: 'project-wide',
				projectId: shiftedProjectId,
				projectName: 'Shifted Project'
			});
			expect(capturedContext?.ontologyContext?.scope?.projectId).toBe(shiftedProjectId);
			expect(capturedContext?.ontologyContext?.entities?.project).toEqual({
				id: shiftedProjectId,
				name: 'Shifted Project'
			});
			expect(JSON.stringify(capturedContext?.ontologyContext?.entities ?? {})).not.toContain(
				originalProjectId
			);
			expect(JSON.stringify(capturedContext?.ontologyContext?.entities ?? {})).not.toContain(
				staleTaskId
			);
		} finally {
			executeSpy.mockRestore();
		}
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

	it('matches the Phase 4 clarification and supervisor-checkpoint legacy golden', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso));
		try {
			const fixture = AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1;
			mocks.resolveSession.mockResolvedValueOnce({
				session: {
					id: fixture.request.sessionId,
					summary: null,
					agent_metadata: {}
				}
			});
			mocks.persistMessage.mockImplementationOnce(
				async ({ role, content, metadata }: Row) => ({
					id: `${role}-message-supervisor-1`,
					role,
					content,
					metadata,
					created_at: fixture.clockIso
				})
			);
			mocks.streamFastChat.mockImplementationOnce(
				async ({ onDelta, onSupervisorDecision }: Row) => {
					await onSupervisorDecision({
						decision: fixture.decision,
						digest: fixture.checkpoint.digest,
						at: fixture.clockIso,
						source: 'monitor',
						trigger: 'repeated_failures'
					});
					await onDelta(fixture.response.question);
					return {
						assistantText: fixture.response.question,
						finalAssistantText: fixture.response.question,
						usage: {
							prompt_tokens: fixture.response.usage.promptTokens,
							completion_tokens: fixture.response.usage.completionTokens,
							total_tokens: fixture.response.usage.totalTokens
						},
						finishedReason: fixture.response.finishedReason,
						toolExecutions: [],
						llmPasses: [],
						toolRounds: 0,
						toolCallsMade: 0,
						supervisorDecisions: [
							{
								decision: fixture.decision,
								digest: fixture.checkpoint.digest,
								at: fixture.clockIso,
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

			const supabase = createStreamingSupabase();
			const response = await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: fixture.request.message,
						context_type: fixture.request.contextType,
						stream_run_id: 'phase-4-supervisor-stream',
						client_turn_id: 'phase-4-supervisor-client'
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
			await new Promise((resolve) => setTimeout(resolve, 0));

			const userMessage = supabase.insertedRows.chat_messages?.[0] ?? {};
			const assistantCall = mocks.persistMessage.mock.calls.find(
				([input]) => input.role === 'assistant'
			)?.[0];
			const terminalTurn = [...(supabase.updatedRows.chat_turn_runs ?? [])]
				.reverse()
				.find((row) => row.status === 'completed');
			const doneEvent = [...events].reverse().find((event) => event.type === 'done');
			const run = normalizeAgenticChatParityRunV1({
				events: events as never,
				messages: [
					{ role: userMessage.role, content: userMessage.content },
					{
						role: assistantCall?.role,
						content: assistantCall?.content,
						metadata: {
							completion_status: assistantCall?.metadata?.completion_status,
							answer_source: assistantCall?.metadata?.answer_source,
							supervisor_question_checkpoint: {
								failed: assistantCall?.metadata?.supervisor_question_checkpoint
									?.failed
							}
						}
					}
				],
				toolExecutions: [],
				checkpoints: (supabase.insertedRows.chat_turn_checkpoints ?? []).map((row) => ({
					checkpoint_type: row.checkpoint_type,
					status: row.status,
					reason: row.reason,
					question: row.question,
					digest: row.digest,
					resume_context: row.resume_context,
					supervisor_decision: row.supervisor_decision
				})),
				outcome: {
					status: terminalTurn?.status,
					finished_reason: terminalTurn?.finished_reason,
					assistant_message_linked: Boolean(terminalTurn?.assistant_message_id),
					tool_round_count: terminalTurn?.tool_round_count,
					tool_call_count: terminalTurn?.tool_call_count,
					total_tokens: doneEvent?.usage?.total_tokens ?? null
				},
				metadata: {
					checkpoint_count: (supabase.insertedRows.chat_turn_checkpoints ?? []).length
				}
			});
			expect(run).toEqual(AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1);
			for (const scenarioClass of ['clarification', 'supervisor_checkpoint'] as const) {
				expect(parityCoverage.evaluate(scenarioClass, run).matchesContract).toBe(true);
			}
		} finally {
			vi.useRealTimers();
		}
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

		const updatedUserMessage = supabase.updatedRows.chat_messages?.find(
			(row) => row.role === 'user'
		);
		expect(updatedUserMessage?.metadata).toEqual(
			expect.objectContaining({
				idempotency_key: expect.stringMatching(/^chat-turn:.*:user$/),
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

	it('keeps a resumed checkpoint active when its mutation remains unfulfilled', async () => {
		const supabase = createStreamingSupabase({
			chat_turn_checkpoints: [buildCheckpointRow({ id: 'checkpoint-still-active' })]
		});
		mocks.resolveFastChatTurnIntent.mockReturnValueOnce({
			version: 1,
			requiresWrite: true,
			action: 'update',
			entityKind: 'task',
			operations: [{ action: 'update', entityKind: 'task' }],
			source: 'pending_continuation',
			originalRequestText: 'Update the task.',
			originatingTurnRunId: 'turn-previous',
			clearPending: false
		});
		mocks.resolveFastChatTurnOutcome.mockReturnValueOnce({
			status: 'unfulfilled',
			fulfilled: false,
			expectedWriteToolNames: ['update_onto_task']
		});
		mocks.streamFastChat.mockResolvedValueOnce({
			assistantText: 'I could not update the task.',
			finalAssistantText: 'I could not update the task.',
			usage: { total_tokens: 10 },
			finishedReason: 'mutation_unfulfilled',
			toolExecutions: [],
			llmPasses: [],
			toolRounds: 1,
			toolCallsMade: 1,
			supervisorDecisions: [],
			cancelled: false
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Use the launch checklist task.',
					context_type: 'global',
					stream_run_id: 'stream-run-still-active',
					client_turn_id: 'client-turn-still-active'
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
		expect(
			supabase.updatedRows.chat_turn_checkpoints?.some(
				(row) => row.id === 'checkpoint-still-active' && row.status === 'resumed'
			)
		).toBe(false);
		expect(
			supabase.insertedRows.chat_turn_events?.find(
				(row) => row.event_type === 'supervisor_checkpoint_remains_active'
			)?.payload
		).toMatchObject({
			checkpoint_id: 'checkpoint-still-active',
			outcome_status: 'unfulfilled',
			intent_fulfilled: false
		});
	});

	it('exercises every implemented parity scenario class from the shared registry', () => {
		expect(parityCoverage.missing()).toEqual([]);
	});
});
