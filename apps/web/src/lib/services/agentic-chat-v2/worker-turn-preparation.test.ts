// apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	hashCanonicalAdmissionRequestV1,
	validateTurnInputArtifactV1,
	type TurnInputArtifactV1
} from '@buildos/shared-types';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd3000000-0000-4000-8000-000000000001';
const IDS = [
	'd4000000-0000-4000-8000-000000000001',
	'd5000000-0000-4000-8000-000000000001',
	'd6000000-0000-4000-8000-000000000001',
	'd7000000-0000-4000-8000-000000000001'
];
const NOW = Date.parse('2026-08-03T12:00:00.000Z');

const mocks = vi.hoisted(() => ({
	checkDailyBriefAccess: vi.fn(),
	checkProjectAccess: vi.fn(),
	loadValidatedChatAttachments: vi.fn(),
	inspectPreparedPromptAdmissionLineage: vi.fn(),
	inspectPreparedPromptForWorkerAdmission: vi.fn(),
	resolveFastChatTurnPreparation: vi.fn(),
	loadFastChatPromptContext: vi.fn(),
	buildLitePromptEnvelope: vi.fn(),
	applyActiveDomainSignalsOverlay: vi.fn(),
	buildPendingTurnIntentSystemMessage: vi.fn(),
	buildPendingTurnContractSystemMessage: vi.fn()
}));

vi.mock('./access-checks', () => ({
	checkDailyBriefAccess: mocks.checkDailyBriefAccess,
	checkProjectAccess: mocks.checkProjectAccess
}));
vi.mock('./stream-attachments', () => ({
	loadValidatedChatAttachments: mocks.loadValidatedChatAttachments
}));
vi.mock('./prepared-prompt-consumer.server', () => ({
	inspectPreparedPromptAdmissionLineage: mocks.inspectPreparedPromptAdmissionLineage,
	inspectPreparedPromptForWorkerAdmission: mocks.inspectPreparedPromptForWorkerAdmission
}));
vi.mock('./turn-preparation', () => ({
	resolveFastChatTurnPreparation: mocks.resolveFastChatTurnPreparation
}));
vi.mock('./context-loader', () => ({
	loadFastChatPromptContext: mocks.loadFastChatPromptContext
}));
vi.mock('./turn-intent', async (importOriginal) => {
	const original = await importOriginal<typeof import('./turn-intent')>();
	return {
		...original,
		buildPendingTurnIntentSystemMessage: mocks.buildPendingTurnIntentSystemMessage
	};
});
vi.mock('./turn-contract', async (importOriginal) => {
	const original = await importOriginal<typeof import('./turn-contract')>();
	return {
		...original,
		buildPendingTurnContractSystemMessage: mocks.buildPendingTurnContractSystemMessage
	};
});
vi.mock('$lib/services/agentic-chat-lite/prompt', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('$lib/services/agentic-chat-lite/prompt')>();
	return {
		...original,
		buildLitePromptEnvelope: mocks.buildLitePromptEnvelope,
		applyActiveDomainSignalsOverlay: mocks.applyActiveDomainSignalsOverlay
	};
});

import { prepareAgenticChatWorkerAdmission } from './worker-turn-preparation.server';

function command(overrides: Record<string, unknown> = {}) {
	return {
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		sessionId: null,
		context: { type: 'global' as const, entityId: null, projectId: null },
		message: '  Ship the next slice  ',
		attachments: [],
		projectFocus: null,
		lastTurnContext: null,
		voiceNoteGroupId: null,
		preparedPromptKey: null,
		...overrides
	};
}

function dependencies() {
	let index = 0;
	return {
		createId: () => IDS[index++]!,
		nowMs: () => NOW,
		loadResumeCheckpoint: vi.fn(async () => null),
		observeCapacity: vi.fn(async () => ({
			available: true,
			retryAfterSeconds: 2,
			reason: 'open' as const
		}))
	};
}

function serviceClientWithSession(session: Record<string, unknown>) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'eq', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn(async () => ({ data: session, error: null }));
	return { from: vi.fn(() => builder), rpc: vi.fn() };
}

function serviceClientWithTables(tables: Record<string, Array<Record<string, any>>>) {
	class Builder {
		private filters: Array<(row: Record<string, any>) => boolean> = [];
		private limitCount: number | null = null;
		private orders: Array<{ column: string; ascending: boolean }> = [];

		constructor(private readonly table: string) {}

		select() {
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push((row) => row[column] === value);
			return this;
		}

		in(column: string, values: unknown[]) {
			this.filters.push((row) => values.includes(row[column]));
			return this;
		}

		order(column: string, options?: { ascending?: boolean }) {
			this.orders.push({ column, ascending: options?.ascending !== false });
			return this;
		}

		limit(count: number) {
			this.limitCount = count;
			return this;
		}

		async maybeSingle() {
			const rows = this.rows();
			return { data: rows[0] ?? null, error: rows.length > 1 ? { code: 'multiple' } : null };
		}

		then<TResult1 = { data: Record<string, any>[]; error: null }>(
			onfulfilled?: (value: {
				data: Record<string, any>[];
				error: null;
			}) => TResult1 | PromiseLike<TResult1>
		) {
			return Promise.resolve({ data: this.rows(), error: null as null }).then(onfulfilled);
		}

		private rows() {
			let rows = (tables[this.table] ?? []).filter((row) =>
				this.filters.every((filter) => filter(row))
			);
			if (this.orders.length > 0) {
				rows = rows.slice().sort((left, right) => {
					for (const order of this.orders) {
						const comparison = String(left[order.column] ?? '').localeCompare(
							String(right[order.column] ?? '')
						);
						if (comparison !== 0) return order.ascending ? comparison : -comparison;
					}
					return 0;
				});
			}
			if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
			return rows;
		}
	}

	return { from: vi.fn((table: string) => new Builder(table)), rpc: vi.fn() };
}

describe('Agentic Chat worker turn preparation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkDailyBriefAccess.mockResolvedValue({ allowed: true });
		mocks.checkProjectAccess.mockResolvedValue({ allowed: true });
		mocks.loadValidatedChatAttachments.mockResolvedValue({ attachments: [], assets: [] });
		mocks.inspectPreparedPromptAdmissionLineage.mockResolvedValue(null);
		mocks.inspectPreparedPromptForWorkerAdmission.mockResolvedValue({
			hit: false,
			reason: 'missing_key'
		});
		mocks.resolveFastChatTurnPreparation.mockReturnValue({
			sessionMetadata: { trusted: true },
			pendingTurnContract: null,
			turnIntent: {
				version: 1,
				requiresWrite: false,
				action: null,
				entityKind: 'unknown',
				operations: [],
				source: 'none',
				originalRequestText: null,
				originatingTurnRunId: null,
				clearPending: false
			},
			priorDomainIds: [],
			priorOutcomeCardIds: [],
			turnDomainSensing: null,
			cacheKey: 'v2|global|none|none|none',
			cachedContext: undefined,
			bypassContextCacheForShiftHint: false,
			selectedSurfaceProfile: 'global_basic',
			tools: []
		});
		mocks.loadFastChatPromptContext.mockResolvedValue({
			contextType: 'global',
			entityId: null,
			projectId: null,
			data: { source: 'server' }
		});
		const envelope = {
			promptVariant: 'lite',
			systemPrompt: 'Trusted system prompt',
			sections: [{ id: 'identity', content: 'Trusted section' }],
			contextInventory: { focus: { contextType: 'global' } },
			toolsSummary: null
		};
		mocks.buildLitePromptEnvelope.mockReturnValue(envelope);
		mocks.applyActiveDomainSignalsOverlay.mockReturnValue(envelope);
		mocks.buildPendingTurnIntentSystemMessage.mockReturnValue(null);
		mocks.buildPendingTurnContractSystemMessage.mockReturnValue(null);
	});

	it('builds an inline-session RPC value with empty history, null lineage, exact hashes, and server ids', async () => {
		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command() as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args).toMatchObject({
			p_user_id: USER_ID,
			p_session_id: null,
			p_turn_run_id: IDS[0],
			p_user_message_id: IDS[1],
			p_input_artifact_id: IDS[2],
			p_correlation_id: IDS[3],
			p_request_hash_version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
			p_transport_contract_version: 'agentic_chat_worker_v1',
			p_transport_decision_id: DECISION_ID,
			p_request_message: 'Ship the next slice',
			p_user_message_content: 'Ship the next slice',
			p_history_source: 'admission_window',
			p_artifact_history: [],
			p_prepared_prompt_id: null,
			p_prepared_context_payload_sha256: null,
			p_prepared_surface_profile: null,
			p_capacity_available: true
		});
		expect(result.preparedPromptUsed).toBe(false);
		expect(result.args.p_artifact_prepared).toMatchObject({
			turnIntent: {
				version: 1,
				requiresWrite: false,
				action: null,
				entityKind: 'unknown',
				operations: [],
				source: 'none',
				originalRequestText: null,
				originatingTurnRunId: null,
				clearPending: false,
				expectedWriteToolNames: []
			},
			domainMetadata: {
				version: 1,
				sensingApplied: false,
				state: {
					version: 1,
					updated_at: new Date(NOW).toISOString(),
					active_domains: [],
					used_domains: [],
					recent_observations: []
				},
				skillDomainIds: expect.objectContaining({
					content_strategy_beyond_blogging: expect.arrayContaining([
						'marketing.youtube_growth'
					])
				}),
				outcomeCardDomainIds: expect.objectContaining({
					youtube_growth_strategy_plan: expect.arrayContaining([
						'marketing.youtube_growth'
					])
				})
			}
		});
		expect(mocks.inspectPreparedPromptAdmissionLineage).not.toHaveBeenCalled();
		expect(mocks.inspectPreparedPromptForWorkerAdmission).not.toHaveBeenCalled();

		const expectedHash = await hashCanonicalAdmissionRequestV1({
			version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			context: { type: 'global', entityId: null, projectId: null },
			message: 'Ship the next slice',
			attachments: [],
			voiceNoteGroupId: null,
			preparedPromptLineage: { id: null, acceptedSurfaceProfile: null }
		});
		expect(result.args.p_request_hash).toBe(expectedHash);
		expect(result.args.p_artifact_prepared).toMatchObject({
			historyState: {
				strategy: 'raw_history',
				compressed: false,
				rawHistoryCount: 0,
				historyForModelCount: 0
			},
			sessionSnapshot: {
				summary: null,
				agent_metadata: { trusted: true }
			},
			contextUsageSnapshot: {
				estimatedTokens: 11,
				tokenBudget: 15_000,
				usagePercent: 0,
				tokensRemaining: 14_989,
				status: 'ok'
			}
		});

		const artifact = {
			artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
			historySource: result.args.p_history_source,
			history: result.args.p_artifact_history,
			prepared: result.args.p_artifact_prepared,
			createdAt: new Date(NOW).toISOString(),
			retainUntil: new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(),
			contentHash: result.args.p_artifact_content_hash
		} as TurnInputArtifactV1;
		await expect(validateTurnInputArtifactV1(artifact)).resolves.toMatchObject({
			ok: true,
			contentBytes: result.args.p_artifact_content_bytes,
			historyBytes: result.args.p_artifact_history_bytes
		});
	});

	it('copies a usable prepared prompt without consuming it and preserves stable lineage in the request hash', async () => {
		const preparedId = 'd8000000-0000-4000-8000-000000000001';
		const contextSha = 'a'.repeat(64);
		const serviceClient = serviceClientWithSession({
			id: SESSION_ID,
			user_id: USER_ID,
			context_type: 'global',
			entity_id: null,
			summary: 'Trusted conversation summary',
			agent_metadata: { trusted: true }
		});
		mocks.inspectPreparedPromptAdmissionLineage.mockResolvedValue({
			id: preparedId,
			acceptedSurfaceProfile: 'global_basic'
		});
		mocks.inspectPreparedPromptForWorkerAdmission.mockResolvedValue({
			hit: true,
			ageSeconds: 3,
			history: {
				ok: true,
				history: [{ role: 'assistant', content: 'Earlier answer' }],
				state: {
					strategy: 'raw_history',
					compressed: false,
					rawHistoryCount: 1,
					historyForModelCount: 1
				}
			},
			row: {
				id: preparedId,
				context_payload: { contextType: 'global', data: { source: 'prepared' } },
				context_payload_sha256: contextSha,
				conversation_summary: 'Trusted conversation summary',
				history_for_model: [{ role: 'assistant', content: 'Earlier answer' }],
				history_compressed: false,
				history_strategy: 'raw_history',
				raw_history_count: 1,
				history_for_model_count: 1
			},
			surface: {
				system_prompt: 'Prepared system prompt',
				sections: [{ id: 'prepared', content_sha256: 'b'.repeat(64) }]
			}
		});
		mocks.buildPendingTurnContractSystemMessage.mockReturnValue(
			'Pending semantic contract from current session metadata'
		);

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				preparedPromptKey: 'pp_v1.server-trusted-key'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.preparedPromptUsed).toBe(true);
		expect(result.args).toMatchObject({
			p_session_id: SESSION_ID,
			p_history_source: 'prepared_prompt',
			p_prepared_prompt_id: preparedId,
			p_prepared_context_payload_sha256: contextSha,
			p_prepared_surface_profile: 'global_basic'
		});
		expect(result.args.p_artifact_history).toEqual([
			expect.objectContaining({
				sourceMessageId: null,
				role: 'assistant',
				content: 'Earlier answer'
			}),
			expect.objectContaining({
				sourceMessageId: null,
				role: 'system',
				content: 'Pending semantic contract from current session metadata'
			})
		]);
		expect(result.args.p_artifact_prepared).toMatchObject({
			sourcePreparedPromptId: preparedId,
			systemPrompt: 'Prepared system prompt',
			surfaceProfile: 'global_basic',
			historyState: {
				strategy: 'raw_history',
				compressed: false,
				rawHistoryCount: 1,
				historyForModelCount: 2
			},
			sessionSnapshot: {
				user_id: USER_ID,
				context_type: 'global',
				entity_id: null,
				summary: 'Trusted conversation summary',
				agent_metadata: { trusted: true }
			},
			contextUsageSnapshot: {
				estimatedTokens: expect.any(Number),
				tokensRemaining: expect.any(Number),
				status: 'ok'
			}
		});
		const expectedHash = await hashCanonicalAdmissionRequestV1({
			version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			context: { type: 'global', entityId: null, projectId: null },
			message: 'Ship the next slice',
			attachments: [],
			voiceNoteGroupId: null,
			preparedPromptLineage: {
				id: preparedId,
				acceptedSurfaceProfile: 'global_basic'
			}
		});
		expect(result.args.p_request_hash).toBe(expectedHash);
	});

	it('freezes the selected checkpoint and canonical resume message into the hashed artifact', async () => {
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'global',
					entity_id: null,
					summary: null,
					agent_metadata: {}
				}
			],
			chat_messages: [],
			chat_message_attachments: [],
			chat_tool_executions: []
		});
		const resumeContext = {
			missing_field: 'task_id',
			instruction: 'Continue after the user identifies the task.'
		};
		const resumeMessage =
			'Continue from the previous supervisor checkpoint.\nDo not re-run completed reads or writes unless the user answer changes the target.\nSupervisor question that paused the previous turn: Which exact task should I use?\nCheckpoint resume context: {"instruction":"Continue after the user identifies the task.","missing_field":"task_id"}';
		const resumeCheckpoint = {
			checkpointId: 'a1000000-0000-4000-8000-000000000001',
			originalTurnRunId: 'a2000000-0000-4000-8000-000000000002',
			checkpointType: 'supervisor_question' as const,
			reason: 'repeated_validation_failures',
			question: 'Which exact task should I use?',
			resumeContext,
			resumeMessage,
			sourceExecutionGeneration: 1,
			supervisorTransitionId: 'a3000000-0000-5000-8000-000000000003',
			supervisorSequence: 2
		};
		const injected = dependencies();
		injected.loadResumeCheckpoint.mockResolvedValueOnce(resumeCheckpoint);

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({ sessionId: SESSION_ID }) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: injected
		});

		expect(result.args.p_artifact_prepared).toMatchObject({ resumeCheckpoint });
		expect(result.args.p_user_message_metadata).toMatchObject({
			supervisor_resume_checkpoint_id: resumeCheckpoint.checkpointId,
			supervisor_resume_original_turn_run_id: resumeCheckpoint.originalTurnRunId
		});
		const artifact = {
			artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
			historySource: result.args.p_history_source,
			history: result.args.p_artifact_history,
			prepared: result.args.p_artifact_prepared,
			createdAt: new Date(NOW).toISOString(),
			retainUntil: new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(),
			contentHash: result.args.p_artifact_content_hash
		} as TurnInputArtifactV1;
		await expect(validateTurnInputArtifactV1(artifact)).resolves.toMatchObject({ ok: true });
	});

	it('freezes the exact server-owned model history with source-message lineage on a prepared miss', async () => {
		const userMessageId = 'e1000000-0000-4000-8000-000000000001';
		const assistantMessageId = 'e2000000-0000-4000-8000-000000000001';
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'global',
					entity_id: null,
					summary: null,
					agent_metadata: {}
				}
			],
			chat_messages: [
				{
					id: userMessageId,
					session_id: SESSION_ID,
					user_id: USER_ID,
					role: 'user',
					content: 'Earlier request',
					metadata: null,
					created_at: '2026-08-03T10:00:00.000Z'
				},
				{
					id: assistantMessageId,
					session_id: SESSION_ID,
					user_id: USER_ID,
					role: 'assistant',
					content: 'Earlier answer',
					metadata: null,
					created_at: '2026-08-03T10:01:00.000Z'
				}
			],
			chat_message_attachments: [],
			chat_tool_executions: []
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({ sessionId: SESSION_ID }) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args.p_history_source).toBe('admission_window');
		expect(result.args.p_artifact_history).toEqual([
			expect.objectContaining({
				sourceMessageId: userMessageId,
				role: 'user',
				content: 'Earlier request'
			}),
			expect.objectContaining({
				sourceMessageId: assistantMessageId,
				role: 'assistant',
				content: 'Earlier answer'
			})
		]);
		expect(result.args.p_artifact_prepared).toMatchObject({
			historyState: {
				strategy: 'raw_history',
				compressed: false,
				rawHistoryCount: 2,
				historyForModelCount: 2
			}
		});
	});

	it('keeps prepared-prompt request-hash lineage stable after consumption changes the usable copy', async () => {
		const preparedId = 'f1000000-0000-4000-8000-000000000001';
		const contextSha = 'c'.repeat(64);
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'global',
					entity_id: null,
					summary: null,
					agent_metadata: {}
				}
			],
			chat_messages: [],
			chat_message_attachments: [],
			chat_tool_executions: []
		});
		mocks.inspectPreparedPromptAdmissionLineage.mockResolvedValue({
			id: preparedId,
			acceptedSurfaceProfile: 'global_basic'
		});
		mocks.inspectPreparedPromptForWorkerAdmission
			.mockResolvedValueOnce({
				hit: true,
				ageSeconds: 1,
				history: {
					ok: true,
					history: [],
					state: {
						strategy: 'raw_history',
						compressed: false,
						rawHistoryCount: 0,
						historyForModelCount: 0
					}
				},
				row: {
					id: preparedId,
					context_payload: { contextType: 'global', data: {} },
					context_payload_sha256: contextSha,
					conversation_summary: null,
					history_for_model: [],
					history_compressed: false,
					history_strategy: 'raw_history',
					raw_history_count: 0,
					history_for_model_count: 0
				},
				surface: { system_prompt: 'Prepared prompt', sections: [] }
			})
			.mockResolvedValueOnce({ hit: false, reason: 'consumed' });

		const prepare = () =>
			prepareAgenticChatWorkerAdmission({
				userClient: {} as never,
				serviceClient: serviceClient as never,
				userId: USER_ID,
				command: command({
					sessionId: SESSION_ID,
					preparedPromptKey: 'pp_v1.server-trusted-key'
				}) as never,
				lease: {
					decisionId: DECISION_ID,
					mode: 'worker_realtime' as const,
					contractVersion: 'agentic_chat_worker_v1' as const
				},
				dependencies: dependencies()
			});
		const first = await prepare();
		const retry = await prepare();

		expect(first.preparedPromptUsed).toBe(true);
		expect(retry.preparedPromptUsed).toBe(false);
		expect(first.args.p_request_hash).toBe(retry.args.p_request_hash);
	});

	it('freezes server-resolved current-turn attachment evidence and the authored message', async () => {
		const projectId = 'a1000000-0000-4000-8000-000000000001';
		const assetId = 'a2000000-0000-4000-8000-000000000002';
		mocks.loadValidatedChatAttachments.mockResolvedValue({
			assets: [],
			attachments: [
				{
					attachment_kind: 'onto_asset',
					media_type: 'image',
					asset_id: assetId,
					project_id: projectId,
					storage_bucket: 'onto-assets',
					storage_path: `projects/${projectId}/${assetId}.png`,
					file_name: 'diagram.png',
					content_type: 'image/png',
					file_size_bytes: 1024,
					width: 640,
					height: 480,
					checksum_sha256: 'a'.repeat(64),
					ocr_status: 'complete',
					extraction_summary: null,
					extracted_text_preview: 'Visible OCR text',
					role: 'analysis_target',
					display_order: 0
				}
			]
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({
				context: { type: 'project', entityId: projectId, projectId },
				message: '  Review this diagram.  ',
				attachments: [
					{ attachment_kind: 'onto_asset', media_type: 'image', asset_id: assetId }
				]
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args.p_artifact_prepared).toMatchObject({
			currentTurn: {
				message: 'Review this diagram.',
				attachmentContextMaxChars: 7000,
				liveVision: {
					requested: false,
					maxImages: 2,
					maxImageBytes: 8 * 1024 * 1024,
					renderWidth: 1600,
					signedUrlTtlSeconds: 900
				},
				attachments: [
					expect.objectContaining({
						asset_id: assetId,
						project_id: projectId,
						display_order: 0,
						checksum_sha256: 'a'.repeat(64),
						storage_bucket: 'onto-assets',
						storage_path: `projects/${projectId}/${assetId}.png`,
						expires_at: null
					})
				]
			}
		});
		expect(result.args.p_request_payload).toMatchObject({
			message: 'Review this diagram.',
			attachments: [expect.objectContaining({ asset_id: assetId, display_order: 0 })]
		});
	});
});
