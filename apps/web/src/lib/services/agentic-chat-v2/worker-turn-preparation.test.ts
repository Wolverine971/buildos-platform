// apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	hashCanonicalAdmissionRequestV1,
	validateTurnInputArtifactV1,
	type AgenticChatResumeCheckpointSnapshotV1,
	type TurnInputArtifactV1
} from '@buildos/shared-types';
import { senseDomains } from '$lib/services/agentic-chat/tools/domains/domain-sensing';

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

function buildWhitespaceBoundaryMessage(targetLength: number, suffix: string): string {
	const prefix = 'I want to write the book that is my life.';
	const trailingFillerLength = targetLength - 1_200 - suffix.length;
	if (targetLength <= 1_200 || prefix.length >= 1_199 || trailingFillerLength < 0) {
		throw new Error('Test message length must leave room for the former clipping boundary');
	}
	return `${prefix}${'x'.repeat(1_199 - prefix.length)} ${'y'.repeat(trailingFillerLength)}${suffix}`;
}

const OVER_1_500_TAIL = 'FINAL REQUEST: summarize only.';
const OVER_1_500_MESSAGE = buildWhitespaceBoundaryMessage(1_501, OVER_1_500_TAIL);

function buildUnicodeMultilineMessage(targetLength: number, suffix: string): string {
	const prefix = 'Notes for the novel — preserve the complete context.\n';
	const seed = '章: Mara visits the café — retain every detail.\n';
	const bodyLength = targetLength - prefix.length - suffix.length;
	if (bodyLength <= 0) throw new Error('Test message target is too short');
	return `${prefix}${seed.repeat(Math.ceil(bodyLength / seed.length)).slice(0, bodyLength)}${suffix}`;
}

const OVER_3_000_TAIL = '\nFINAL REQUEST: explain the ending without changing any documents. 終';
const OVER_3_000_UNICODE_MESSAGE = buildUnicodeMultilineMessage(3_001, OVER_3_000_TAIL);

const mocks = vi.hoisted(() => ({
	checkDailyBriefAccess: vi.fn(),
	checkProjectAccess: vi.fn(),
	loadValidatedChatAttachments: vi.fn(),
	inspectPreparedAdmissionLease: vi.fn(),
	inspectPreparedAdmissionLeaseContent: vi.fn(),
	inspectPreparedPromptAdmissionLineage: vi.fn(),
	inspectPreparedPromptForWorkerAdmission: vi.fn(),
	resolveFastChatTurnPreparation: vi.fn(),
	loadFastChatPromptContext: vi.fn(),
	buildLitePromptEnvelope: vi.fn(),
	applyActiveDomainSignalsOverlay: vi.fn(),
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
vi.mock('./prepared-admission-lease.server', () => ({
	inspectPreparedAdmissionLease: mocks.inspectPreparedAdmissionLease,
	inspectPreparedAdmissionLeaseContent: mocks.inspectPreparedAdmissionLeaseContent
}));
vi.mock('./turn-preparation', () => ({
	resolveFastChatTurnPreparation: mocks.resolveFastChatTurnPreparation
}));
vi.mock('./context-loader', () => ({
	loadFastChatPromptContext: mocks.loadFastChatPromptContext
}));
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
		loadResumeCheckpoint: vi.fn(
			async (): Promise<AgenticChatResumeCheckpointSnapshotV1 | null> => null
		)
	};
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
		mocks.inspectPreparedAdmissionLease.mockResolvedValue({
			hit: false,
			reason: 'ineligible'
		});
		mocks.inspectPreparedAdmissionLeaseContent.mockReturnValue({
			hit: false,
			reason: 'not_found'
		});
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
		expect(result.args.p_artifact_prepared).not.toHaveProperty('turnIntent');
		expect(mocks.inspectPreparedPromptAdmissionLineage).not.toHaveBeenCalled();
		expect(mocks.inspectPreparedPromptForWorkerAdmission).not.toHaveBeenCalled();
		expect(mocks.resolveFastChatTurnPreparation).toHaveBeenCalledWith(
			expect.objectContaining({ projectCreateWorkflow: 'reviewed_shell' })
		);
		expect(mocks.buildLitePromptEnvelope).toHaveBeenCalledWith(
			expect.objectContaining({
				currentUserMessage: 'Ship the next slice',
				projectCreateWorkflow: 'reviewed_shell',
				scaffold: expect.objectContaining({ dynamicSkillTools: false })
			})
		);
		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				domainSensingResult: null,
				projectCreateWorkflow: 'reviewed_shell',
				skillGatePreload: null,
				scaffold: expect.objectContaining({ dynamicSkillTools: false })
			})
		);

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

	it('rejects an unavailable resolved tool surface before durable admission', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			tools: [
				{
					type: 'function',
					function: {
						name: 'list_calendar_events',
						description: 'Calendar read',
						parameters: { type: 'object', properties: {} }
					}
				}
			]
		});

		await expect(
			prepareAgenticChatWorkerAdmission({
				userClient: {} as never,
				serviceClient: {} as never,
				userId: USER_ID,
				command: command({ message: "What's on my calendar tomorrow?" }) as never,
				lease: {
					decisionId: DECISION_ID,
					mode: 'worker_realtime',
					contractVersion: 'agentic_chat_worker_v1'
				},
				dependencies: dependencies()
			})
		).rejects.toMatchObject({
			code: 'transport_renegotiate'
		});
	});

	it('admits a normal launch surface after omitting preloaded discovery tools', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			tools: [
				'skill_search',
				'domain_search',
				'change_chat_context',
				'get_project_overview'
			].map((name) => ({
				type: 'function',
				function: {
					name,
					description: name,
					parameters: { type: 'object', properties: {} }
				}
			}))
		});

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

		expect(result.args.p_artifact_prepared).toMatchObject({
			toolSurface: {
				version: 1,
				toolNames: ['change_chat_context', 'get_project_overview'],
				registryVersion: expect.stringMatching(/^tool-registry\/[0-9a-f]+$/),
				discoveryPolicyVersion: expect.stringMatching(/^tool-discovery-policy\/[0-9a-f]+$/),
				definitions: [
					expect.objectContaining({
						function: expect.objectContaining({ name: 'change_chat_context' })
					}),
					expect.objectContaining({
						function: expect.objectContaining({ name: 'get_project_overview' })
					})
				]
			}
		});
	});

	it('adds the review-delegation situation for a broad project change', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'project_write_document',
			tools: ['get_document_tree', 'delegate_task'].map((name) => ({
				type: 'function',
				function: {
					name,
					description: name,
					parameters: { type: 'object', properties: {} }
				}
			}))
		});
		mocks.loadFastChatPromptContext.mockResolvedValueOnce({
			contextType: 'project',
			entityId: 'd9000000-0000-4000-8000-000000000001',
			projectId: 'd9000000-0000-4000-8000-000000000001',
			data: { source: 'server' }
		});

		await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({
				context: {
					type: 'project',
					entityId: 'd9000000-0000-4000-8000-000000000001',
					projectId: 'd9000000-0000-4000-8000-000000000001'
				},
				message:
					'Reorient our whole marketing direction and update every relevant document, goal, and task.'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				turnSituation: expect.objectContaining({ reviewDelegation: true })
			})
		);
	});

	it('omits retired and impossible write controls from a read-only worker artifact', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'global_basic',
			tools: [
				'declare_turn_contract',
				'declare_read_only_turn',
				'request_turn_clarification',
				'get_workspace_overview'
			].map((name) => ({
				type: 'function',
				function: {
					name,
					description: name,
					parameters: { type: 'object', properties: {} }
				}
			}))
		});

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

		expect(result.args.p_artifact_prepared).toMatchObject({
			toolSurface: {
				toolNames: ['request_turn_clarification', 'get_workspace_overview']
			}
		});
		expect(mocks.buildLitePromptEnvelope).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: expect.not.arrayContaining([
					expect.objectContaining({
						function: expect.objectContaining({ name: 'declare_turn_contract' })
					}),
					expect.objectContaining({
						function: expect.objectContaining({ name: 'declare_read_only_turn' })
					})
				])
			})
		);
	});

	it('keeps the complex contract on a mutation-capable worker artifact', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'project_write_document',
			tools: [
				'declare_turn_contract',
				'declare_read_only_turn',
				'request_turn_clarification',
				'create_onto_task'
			].map((name) => ({
				type: 'function',
				function: {
					name,
					description: name,
					parameters: { type: 'object', properties: {} }
				}
			}))
		});

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

		expect(result.args.p_artifact_prepared).toMatchObject({
			toolSurface: {
				toolNames: [
					'declare_turn_contract',
					'request_turn_clarification',
					'create_onto_task'
				]
			}
		});
	});

	it.each([
		{
			label: 'an ASCII message over 1,500 characters with whitespace at the former clip edge',
			message: OVER_1_500_MESSAGE,
			minimumCharacters: 1_500,
			tailMarker: OVER_1_500_TAIL,
			multibyte: false
		},
		{
			label: 'a multiline Unicode message over 3,000 characters',
			message: OVER_3_000_UNICODE_MESSAGE,
			minimumCharacters: 3_000,
			tailMarker: OVER_3_000_TAIL,
			multibyte: true
		}
	])('admits $label intact without lexical turn-intent metadata', async (testCase) => {
		const { message, minimumCharacters, tailMarker, multibyte } = testCase;
		expect(message.length).toBeGreaterThan(minimumCharacters);
		expect(message.endsWith(tailMarker)).toBe(true);
		if (minimumCharacters === 1_500) {
			expect(message).toHaveLength(1_501);
			expect(message.slice(0, 1_200)).toMatch(/\s$/);
		}
		if (multibyte) {
			expect(message).toHaveLength(3_001);
			expect(new TextEncoder().encode(message).byteLength).toBeGreaterThan(message.length);
			expect(message).toContain('\n');
		}

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({ message }) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args.p_request_message).toBe(message);
		expect(result.args.p_user_message_content).toBe(message);
		expect(result.args.p_artifact_prepared).not.toHaveProperty('turnIntent');
		expect(mocks.buildLitePromptEnvelope).toHaveBeenCalledWith(
			expect.objectContaining({ currentUserMessage: message })
		);
		const expectedHash = await hashCanonicalAdmissionRequestV1({
			version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			context: { type: 'global', entityId: null, projectId: null },
			message,
			attachments: [],
			voiceNoteGroupId: null,
			preparedPromptLineage: { id: null, acceptedSurfaceProfile: null }
		});
		expect(result.args.p_request_hash).toBe(expectedHash);

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

	it('preloads a sensed skill without exposing dynamic skill calls to the worker prompt', async () => {
		const sensing = senseDomains({
			currentUserMessage: 'Write a cold email to a newsletter creator about BuildOS.',
			limit: 3
		});
		expect(sensing?.skill_load_required).toBe(true);
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
			turnDomainSensing: sensing,
			cacheKey: 'v2|global|none|none|none',
			cachedContext: undefined,
			bypassContextCacheForShiftHint: false,
			selectedSurfaceProfile: 'global_basic',
			tools: []
		});

		await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({
				message: 'Write a cold email to a newsletter creator about BuildOS.'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				domainSensingResult: sensing,
				skillGatePreload: expect.objectContaining({
					promptContent: expect.not.stringContaining('skill_load')
				}),
				scaffold: expect.objectContaining({ dynamicSkillTools: false })
			})
		);
	});

	it('uses a byte-bound worker prepared-prompt surface without rebuilding context or system prompt', async () => {
		const preparedId = 'd8000000-0000-4000-8000-000000000001';
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'global',
					entity_id: null,
					summary: 'Trusted conversation summary',
					agent_metadata: { trusted: true }
				}
			],
			chat_messages: [],
			chat_message_attachments: [],
			chat_tool_executions: []
		});
		mocks.inspectPreparedPromptAdmissionLineage.mockResolvedValue({
			id: preparedId,
			acceptedSurfaceProfile: 'worker_realtime:global_basic'
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
				context_payload_sha256: 'a'.repeat(64),
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
			},
			surfaceKey: 'worker_realtime:global_basic'
		});
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
			p_prepared_context_payload_sha256: 'a'.repeat(64),
			p_prepared_surface_profile: 'worker_realtime:global_basic'
		});
		expect(result.args.p_artifact_history).toEqual([
			expect.objectContaining({ role: 'assistant', content: 'Earlier answer' })
		]);
		expect(result.args.p_artifact_prepared).toMatchObject({
			sourcePreparedPromptId: preparedId,
			systemPrompt: 'Prepared system prompt',
			surfaceProfile: 'worker_realtime:global_basic',
			historyState: {
				strategy: 'raw_history',
				compressed: false,
				rawHistoryCount: 1,
				historyForModelCount: 1
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
		expect(mocks.buildLitePromptEnvelope).not.toHaveBeenCalled();
		expect(mocks.loadFastChatPromptContext).not.toHaveBeenCalled();
		expect(mocks.inspectPreparedPromptAdmissionLineage).toHaveBeenCalledWith(
			expect.objectContaining({ surfaceProfile: 'worker_realtime:global_basic' })
		);
		expect(mocks.inspectPreparedPromptForWorkerAdmission).toHaveBeenCalledWith(
			expect.objectContaining({
				surfaceProfile: 'worker_realtime:global_basic',
				scaffold: expect.objectContaining({ dynamicSkillTools: false })
			})
		);
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
				acceptedSurfaceProfile: 'worker_realtime:global_basic'
			}
		});
		expect(result.args.p_request_hash).toBe(expectedHash);
	});

	it('uses one prepared-admission receipt without repeating access, session, checkpoint, or prepared reads', async () => {
		const preparedId = 'd8000000-0000-4000-8000-000000000001';
		const projectId = 'd9000000-0000-4000-8000-000000000001';
		const session = {
			id: SESSION_ID,
			user_id: USER_ID,
			context_type: 'project',
			entity_id: projectId,
			summary: 'Prepared project summary',
			agent_metadata: { trusted: true }
		};
		const preparedRow = {
			id: preparedId,
			user_id: USER_ID,
			session_id: SESSION_ID,
			context_type: 'project',
			entity_id: projectId,
			project_id: projectId,
			cache_key: `v2|project|${projectId}|project-wide|${projectId}`,
			context_payload: { contextType: 'project', data: { source: 'prepared-lease' } },
			context_payload_sha256: 'a'.repeat(64),
			conversation_summary: 'Prepared project summary',
			history_for_model: [{ role: 'assistant', content: 'Earlier project answer' }],
			history_compressed: false,
			history_strategy: 'raw_history',
			raw_history_count: 1,
			history_for_model_count: 1,
			prepared_surfaces: {
				'worker_realtime:project_write_document': {
					surface_profile: 'worker_realtime:project_write_document',
					system_prompt: 'Prepared project system prompt'
				}
			}
		};
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
			cacheKey: preparedRow.cache_key,
			cachedContext: undefined,
			bypassContextCacheForShiftHint: false,
			selectedSurfaceProfile: 'project_write_document',
			tools: []
		});
		mocks.inspectPreparedAdmissionLease.mockResolvedValue({
			hit: true,
			row: preparedRow,
			session,
			validatedAt: new Date(NOW).toISOString()
		});
		mocks.inspectPreparedAdmissionLeaseContent.mockReturnValue({
			hit: true,
			ageSeconds: 2,
			history: {
				ok: true,
				history: [{ role: 'assistant', content: 'Earlier project answer' }],
				state: {
					strategy: 'raw_history',
					compressed: false,
					rawHistoryCount: 1,
					historyForModelCount: 1
				}
			},
			row: preparedRow,
			surface: {
				system_prompt: 'Prepared project system prompt',
				sections: [{ id: 'prepared', content_sha256: 'b'.repeat(64) }]
			},
			surfaceKey: 'worker_realtime:project_write_document'
		});
		const deps = dependencies();
		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				context: { type: 'project', entityId: projectId, projectId },
				projectFocus: {
					focusType: 'project-wide',
					focusEntityId: projectId,
					projectId
				},
				preparedPromptKey: `pp_v1.${preparedId}.opaque-nonce`
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: deps
		});

		expect(result.preparedPromptUsed).toBe(true);
		expect(result.args).toMatchObject({
			p_session_id: SESSION_ID,
			p_history_source: 'prepared_prompt',
			p_prepared_prompt_id: preparedId,
			p_prepared_surface_profile: 'worker_realtime:project_write_document'
		});
		expect(mocks.inspectPreparedAdmissionLease).toHaveBeenCalledTimes(1);
		expect(mocks.checkProjectAccess).not.toHaveBeenCalled();
		expect(deps.loadResumeCheckpoint).not.toHaveBeenCalled();
		expect(mocks.inspectPreparedPromptAdmissionLineage).not.toHaveBeenCalled();
		expect(mocks.inspectPreparedPromptForWorkerAdmission).not.toHaveBeenCalled();
		expect(mocks.loadFastChatPromptContext).not.toHaveBeenCalled();
		expect(result.args.p_request_payload).toMatchObject({
			preparedAdmissionLease: {
				requested: true,
				hit: true,
				missReason: null,
				inspectionMs: expect.any(Number)
			}
		});
	});

	it('hashes a lease hit with a divergent cache key exactly like the legacy lineage path', async () => {
		const preparedId = 'd8000000-0000-4000-8000-000000000002';
		const projectId = 'd9000000-0000-4000-8000-000000000002';
		const session = {
			id: SESSION_ID,
			user_id: USER_ID,
			context_type: 'project',
			entity_id: projectId,
			summary: null,
			agent_metadata: {}
		};
		mocks.resolveFastChatTurnPreparation.mockReturnValue({
			sessionMetadata: {},
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
			cacheKey: `v2|project|${projectId}|task-focus|${projectId}`,
			cachedContext: undefined,
			bypassContextCacheForShiftHint: false,
			selectedSurfaceProfile: 'project_write_document',
			tools: []
		});
		mocks.inspectPreparedAdmissionLease.mockResolvedValue({
			hit: true,
			row: {
				id: preparedId,
				user_id: USER_ID,
				session_id: SESSION_ID,
				context_type: 'project',
				entity_id: projectId,
				project_id: projectId,
				// The prewarm ran under a different focus, so the row's cache key no
				// longer matches this turn. Legacy lineage would return null here;
				// the lease path must hash identically for retry idempotency.
				cache_key: `v2|project|${projectId}|project-wide|${projectId}`,
				context_payload: { contextType: 'project', data: {} },
				context_payload_sha256: 'a'.repeat(64),
				conversation_summary: null,
				history_for_model: [],
				prepared_surfaces: {
					'worker_realtime:project_write_document': {
						surface_profile: 'worker_realtime:project_write_document',
						system_prompt: 'Prepared project system prompt'
					}
				}
			},
			session,
			validatedAt: new Date(NOW).toISOString()
		});
		mocks.inspectPreparedAdmissionLeaseContent.mockReturnValue({
			hit: false,
			reason: 'scope_mismatch'
		});
		const serviceClient = serviceClientWithTables({
			chat_messages: [],
			chat_message_attachments: [],
			chat_tool_executions: []
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				context: { type: 'project', entityId: projectId, projectId },
				preparedPromptKey: `pp_v1.${preparedId}.opaque-nonce`
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.preparedPromptUsed).toBe(false);
		expect(result.args.p_prepared_prompt_id).toBeNull();
		expect(result.args.p_history_source).toBe('admission_window');
		const expectedHash = await hashCanonicalAdmissionRequestV1({
			version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			context: { type: 'project', entityId: projectId, projectId },
			message: 'Ship the next slice',
			attachments: [],
			voiceNoteGroupId: null,
			preparedPromptLineage: { id: null, acceptedSurfaceProfile: null }
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

	it('reloads pending clarification IDs into the immediate next-turn artifact without rediscovery', async () => {
		const priorUserMessageId = 'e3000000-0000-4000-8000-000000000001';
		const clarificationMessageId = 'e4000000-0000-4000-8000-000000000001';
		const betaTaskId = 'e5000000-0000-4000-8000-000000000001';
		const renewalTaskId = 'e6000000-0000-4000-8000-000000000001';
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
					id: priorUserMessageId,
					session_id: SESSION_ID,
					user_id: USER_ID,
					role: 'user',
					content: 'Mark the email one done.',
					metadata: null,
					created_at: '2026-08-03T10:00:00.000Z'
				},
				{
					id: clarificationMessageId,
					session_id: SESSION_ID,
					user_id: USER_ID,
					role: 'assistant',
					content: 'Did you mean Beta list email or Renewal email?',
					metadata: null,
					created_at: '2026-08-03T10:01:00.000Z'
				}
			],
			chat_message_attachments: [],
			chat_tool_executions: [
				{
					message_id: clarificationMessageId,
					provider_tool_call_id: 'clarification-call-1',
					tool_name: 'request_turn_clarification',
					gateway_op: null,
					sequence_index: 1,
					success: true,
					error_message: null,
					arguments: {},
					result: {
						status: 'clarification_required',
						reason: 'Two email tasks match.',
						question: 'Did you mean Beta list email or Renewal email?',
						candidates: [
							{ id: betaTaskId, label: 'Beta list email', kind: 'task' },
							{ id: renewalTaskId, label: 'Renewal email', kind: 'task' }
						]
					}
				}
			]
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				message: 'The Beta list email one.'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		const history = result.args.p_artifact_history as Array<{
			role: string;
			content: string;
			sourceMessageId: string | null;
		}>;
		const clarificationLedger = history.find(
			(message) =>
				message.role === 'system' &&
				message.content.startsWith(
					'Pending clarification from the immediately prior assistant turn:'
				)
		);
		expect(result.args.p_request_message).toBe('The Beta list email one.');
		expect(clarificationLedger).toMatchObject({ sourceMessageId: null });
		expect(clarificationLedger?.content).toContain(betaTaskId);
		expect(clarificationLedger?.content).toContain('Beta list email');
		expect(clarificationLedger?.content).toContain(renewalTaskId);
		expect(clarificationLedger?.content).toContain('Renewal email');
		expect(clarificationLedger?.content).toContain(
			'without searching solely to rediscover these choices'
		);
		expect(result.args.p_artifact_prepared).toMatchObject({
			historyState: {
				strategy: 'raw_history',
				compressed: false,
				rawHistoryCount: 3,
				historyForModelCount: 3
			}
		});
	});

	it('keeps prepared-prompt request lineage stable when a lost-response retry finds it consumed', async () => {
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
			acceptedSurfaceProfile: 'worker_realtime:global_basic'
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
				surface: { system_prompt: 'Prepared prompt', sections: [] },
				surfaceKey: 'worker_realtime:global_basic'
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
		expect(mocks.inspectPreparedPromptAdmissionLineage).toHaveBeenCalledTimes(2);
		expect(mocks.inspectPreparedPromptForWorkerAdmission).toHaveBeenCalledTimes(2);
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

		const turnDependencies = { ...dependencies(), liveVisionEnabled: true };
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
			dependencies: turnDependencies
		});

		expect(result.args.p_artifact_prepared).toMatchObject({
			currentTurn: {
				message: 'Review this diagram.',
				attachmentContextMaxChars: 7000,
				liveVision: {
					requested: true,
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
		expect(result.args.p_user_message_metadata).toMatchObject({
			live_vision_requested: true,
			live_vision_attachment_count: 1
		});
	});

	it('renegotiates attachment turns when worker live vision is disabled', async () => {
		mocks.loadValidatedChatAttachments.mockResolvedValue({
			assets: [],
			attachments: [
				{
					attachment_kind: 'temporary_file',
					media_type: 'image',
					asset_id: null,
					project_id: null,
					storage_bucket: 'onto-assets',
					storage_path: `users/${USER_ID}/chat-temp/image.png`,
					file_name: 'image.png',
					content_type: 'image/png',
					file_size_bytes: 1024,
					width: 640,
					height: 480,
					checksum_sha256: null,
					ocr_status: 'skipped',
					extraction_summary: null,
					extracted_text_preview: null,
					role: 'analysis_target',
					display_order: 0,
					expires_at: new Date(NOW + 60_000).toISOString()
				}
			]
		});

		await expect(
			prepareAgenticChatWorkerAdmission({
				userClient: {} as never,
				serviceClient: {} as never,
				userId: USER_ID,
				command: command({
					message: 'Review this image',
					attachments: [
						{
							attachment_kind: 'temporary_file',
							media_type: 'image',
							storage_bucket: 'onto-assets',
							storage_path: `users/${USER_ID}/chat-temp/image.png`,
							file_name: 'image.png',
							content_type: 'image/png',
							file_size_bytes: 1024,
							width: 640,
							height: 480,
							expires_at: new Date(NOW + 60_000).toISOString(),
							display_order: 0
						}
					]
				}) as never,
				lease: {
					decisionId: DECISION_ID,
					mode: 'worker_realtime',
					contractVersion: 'agentic_chat_worker_v1'
				},
				dependencies: { ...dependencies(), liveVisionEnabled: false }
			})
		).rejects.toMatchObject({ code: 'transport_renegotiate' });
	});
});
