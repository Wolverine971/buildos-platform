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
const PROJECT_ID = 'd9000000-0000-4000-8000-000000000001';
const PROJECT_SURFACE_TOOL_NAMES = [
	'declare_turn_contract',
	'get_project_overview',
	'list_onto_tasks',
	'create_onto_task',
	'update_onto_task',
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree'
];

function toolDefinitions(names: string[]) {
	return names.map((name) => ({
		type: 'function',
		function: {
			name,
			description: name,
			parameters: { type: 'object', properties: {} }
		}
	}));
}

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
			selectedSurfaceProfile: 'global',
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
		// The overlay now runs on both history paths (audit P0-2); identity keeps
		// the prepared-hit tests byte-exact and the miss tests on the envelope.
		mocks.applyActiveDomainSignalsOverlay.mockImplementation((input) => input);
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
						// Ontology deletes are still worker-unavailable (2026-09-04).
						name: 'delete_onto_task',
						description: 'Ontology delete',
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
				command: command({ message: 'Delete that task' }) as never,
				lease: {
					decisionId: DECISION_ID,
					mode: 'worker_realtime',
					contractVersion: 'agentic_chat_worker_v1'
				},
				dependencies: dependencies()
			})
		).rejects.toMatchObject({
			code: 'capability_unavailable'
		});
	});

	// Before 2026-09-03 the lexical calendar selector mounted list_calendar_events
	// on any calendar-ish turn, which the worker could not execute; the turn was
	// then pushed off the worker and lost every worker capability.
	it('admits a launch surface carrying the calendar reads the worker now executes', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			tools: [
				'list_calendar_events',
				'get_calendar_event_details',
				'get_project_calendar'
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
			command: command({ message: "What's on my calendar tomorrow?" }) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args.p_artifact_prepared.toolSurface.toolNames).toEqual([
			'list_calendar_events',
			'get_calendar_event_details',
			'get_project_calendar'
		]);
	});

	// The four calendar WRITES moved to the worker on 2026-09-04. "Put a meeting
	// on my calendar" used to renegotiate onto the legacy web engine for the
	// whole turn; now the worker executes it and calls Google directly.
	it('admits a launch surface carrying the calendar writes the worker now executes', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			tools: [
				'list_calendar_events',
				'create_calendar_event',
				'update_calendar_event',
				'delete_calendar_event',
				'set_project_calendar'
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
			command: command({ message: 'Put a meeting on my calendar tomorrow' }) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args.p_artifact_prepared.toolSurface.toolNames).toEqual([
			'list_calendar_events',
			'create_calendar_event',
			'update_calendar_event',
			'delete_calendar_event',
			'set_project_calendar'
		]);
	});

	// The five email tools moved to the worker on 2026-09-04. Before that a
	// launch surface naming search_email_messages renegotiated onto the legacy
	// web engine and lost every worker capability for the whole turn.
	it('admits a launch surface carrying the email tools the worker now executes', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			tools: [
				'get_external_account_status',
				'list_email_accounts',
				'search_email_messages',
				'get_email_message',
				'request_email_account_connection'
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
			command: command({ message: 'Search my email for the contract' }) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.args.p_artifact_prepared.toolSurface.toolNames).toEqual([
			'get_external_account_status',
			'list_email_accounts',
			'search_email_messages',
			'get_email_message',
			'request_email_account_connection'
		]);
	});

	it('admits a normal launch surface after omitting preloaded discovery tools', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			tools: [
				'skill_search',
				'domain_search',
				'get_workspace_overview',
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
				toolNames: ['get_workspace_overview', 'get_project_overview'],
				registryVersion: expect.stringMatching(/^tool-registry\/[0-9a-f]+$/),
				discoveryPolicyVersion: expect.stringMatching(/^tool-discovery-policy\/[0-9a-f]+$/),
				definitions: [
					expect.objectContaining({
						function: expect.objectContaining({ name: 'get_workspace_overview' })
					}),
					expect.objectContaining({
						function: expect.objectContaining({ name: 'get_project_overview' })
					})
				]
			}
		});
	});

	// 2026-09-04: the situation now follows the mount, not the message shape.
	it('adds the review-delegation situation whenever delegate_task is mounted', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'project',
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
			selectedSurfaceProfile: 'global',
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
			selectedSurfaceProfile: 'project',
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
			selectedSurfaceProfile: 'global',
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

	// 2026-09-02 turn executor audit, Finding 4 / Decision 4: operational
	// skills reach the worker through a deterministic intent map keyed off the
	// mounted tools, the preload is recorded for telemetry and continuity, and
	// the write rules key off intent rather than tool presence.
	it('preloads task_management from mutation intent on a project write surface and records it', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'project',
			tools: toolDefinitions(PROJECT_SURFACE_TOOL_NAMES)
		});
		mocks.loadFastChatPromptContext.mockResolvedValueOnce({
			contextType: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID,
			data: { source: 'server' }
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
				message: 'mark the intro call done'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledTimes(1);
		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				skillGatePreload: expect.objectContaining({
					skillId: 'task_management',
					source: 'operational_intent',
					promptContent: expect.stringContaining('update_onto_task')
				}),
				turnSituation: expect.objectContaining({ writeIntent: true, workerBound: true }),
				scaffold: expect.objectContaining({ dynamicSkillTools: false })
			})
		);
		expect(result.args.p_user_message_metadata).toMatchObject({
			skill_preloaded_id: 'task_management',
			skill_preload_source: 'operational_intent'
		});
		expect(result.args.p_request_payload).toMatchObject({
			skillPreload: { skillId: 'task_management', source: 'operational_intent' }
		});
	});

	it('keeps a status question free of a preload and of the write rules', async () => {
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'project',
			tools: toolDefinitions(PROJECT_SURFACE_TOOL_NAMES)
		});
		mocks.loadFastChatPromptContext.mockResolvedValueOnce({
			contextType: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID,
			data: { source: 'server' }
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: {} as never,
			userId: USER_ID,
			command: command({
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
				message: 'what tasks are due this week?'
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
				skillGatePreload: null,
				domainSensingResult: null,
				turnSituation: expect.objectContaining({ writeIntent: false })
			})
		);
		expect(result.args.p_user_message_metadata).not.toHaveProperty('skill_preloaded_id');
		expect(result.args.p_request_payload).toMatchObject({ skillPreload: null });
	});

	it('applies the skill preload and situational overlay on a prepared-prompt hit', async () => {
		const preparedId = 'd8000000-0000-4000-8000-000000000001';
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'project',
					entity_id: PROJECT_ID,
					summary: null,
					agent_metadata: {}
				}
			],
			chat_messages: [],
			chat_message_attachments: [],
			chat_tool_executions: []
		});
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			cacheKey: `v2|project|${PROJECT_ID}|none|none`,
			selectedSurfaceProfile: 'project',
			tools: toolDefinitions(PROJECT_SURFACE_TOOL_NAMES)
		});
		mocks.inspectPreparedPromptAdmissionLineage.mockResolvedValue({
			id: preparedId,
			acceptedSurfaceProfile: 'worker_realtime:project'
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
				context_payload: { contextType: 'project', data: { source: 'prepared' } },
				context_payload_sha256: 'a'.repeat(64),
				conversation_summary: null,
				history_for_model: [{ role: 'assistant', content: 'Earlier answer' }],
				history_compressed: false,
				history_strategy: 'raw_history',
				raw_history_count: 1,
				history_for_model_count: 1
			},
			surface: {
				system_prompt: 'Prepared system prompt',
				system_prompt_sha256: 'c'.repeat(64),
				sections: [{ id: 'prepared', content_sha256: 'b'.repeat(64) }]
			},
			surfaceKey: 'worker_realtime:project'
		});
		mocks.applyActiveDomainSignalsOverlay.mockImplementationOnce((envelope, input) => ({
			...envelope,
			systemPrompt: 'rendered-only-from-overlay-sections',
			sections: [
				...envelope.sections,
				{
					id: 'active_domain_signals',
					title: 'Active Domain Signals',
					kind: 'dynamic',
					source: 'lite.domain_sensing',
					content: `Preloaded skill: ${input.skillGatePreload?.skillId ?? 'none'}`,
					chars: 1,
					estimatedTokens: 1
				}
			]
		}));

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				preparedPromptKey: 'pp_v1.server-trusted-key',
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
				message: 'mark the intro call done'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		expect(result.preparedPromptUsed).toBe(true);
		expect(mocks.buildLitePromptEnvelope).not.toHaveBeenCalled();
		expect(mocks.loadFastChatPromptContext).not.toHaveBeenCalled();
		// The overlay sees the byte-bound prompt with no sections to re-render...
		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.objectContaining({ systemPrompt: 'Prepared system prompt', sections: [] }),
			expect.objectContaining({
				skillGatePreload: expect.objectContaining({
					skillId: 'task_management',
					source: 'operational_intent'
				}),
				turnSituation: expect.objectContaining({ writeIntent: true, workerBound: true })
			})
		);
		// ...and its sections are appended after the prewarmed bytes.
		expect(result.args.p_artifact_prepared).toMatchObject({
			sourcePreparedPromptId: preparedId,
			sourcePreparedSurface: {
				systemPromptSha256: 'c'.repeat(64),
				promptSections: [{ id: 'prepared', content_sha256: 'b'.repeat(64) }]
			},
			systemPrompt:
				'Prepared system prompt\n\n## Active Domain Signals\n\nPreloaded skill: task_management',
			promptSections: [
				{ id: 'prepared', content_sha256: 'b'.repeat(64) },
				expect.objectContaining({ id: 'active_domain_signals' })
			]
		});
		expect(result.args.p_user_message_metadata).toMatchObject({
			skill_preloaded_id: 'task_management'
		});
	});

	it('skips re-injecting a skill preloaded inside the history window and carries the ledger', async () => {
		const userMessageId = 'e1000000-0000-4000-8000-000000000001';
		const assistantMessageId = 'e2000000-0000-4000-8000-000000000001';
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'project',
					entity_id: PROJECT_ID,
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
					content: 'mark the intro call done',
					metadata: {
						skill_preloaded_id: 'task_management',
						skill_preload_source: 'operational_intent'
					},
					created_at: '2026-08-03T10:00:00.000Z'
				},
				{
					id: assistantMessageId,
					session_id: SESSION_ID,
					user_id: USER_ID,
					role: 'assistant',
					content: 'Done — marked it complete.',
					metadata: null,
					created_at: '2026-08-03T10:01:00.000Z'
				}
			],
			chat_message_attachments: [],
			chat_tool_executions: []
		});
		mocks.resolveFastChatTurnPreparation.mockReturnValueOnce({
			...mocks.resolveFastChatTurnPreparation(),
			selectedSurfaceProfile: 'project',
			tools: toolDefinitions(PROJECT_SURFACE_TOOL_NAMES)
		});
		mocks.loadFastChatPromptContext.mockResolvedValueOnce({
			contextType: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID,
			data: { source: 'server' }
		});

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
				message: 'now mark the design review done too'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		const ledger = result.args.p_artifact_history.find(
			(message: { role: string; content: string }) =>
				message.role === 'system' &&
				message.content.startsWith('Previously loaded skills in this session:')
		);
		expect(ledger?.content).toContain('`task_management`');
		expect(ledger?.content).toContain('format: preload');
		expect(mocks.applyActiveDomainSignalsOverlay).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ skillGatePreload: null })
		);
		expect(result.args.p_user_message_metadata).not.toHaveProperty('skill_preloaded_id');
		expect(result.args.p_request_payload).toMatchObject({ skillPreload: null });
	});

	// Finding 13: the AI-inbox proposal brief rendered only on the legacy path.
	it('appends the proposal brief after the pending contract on the worker branch', async () => {
		const serviceClient = serviceClientWithTables({
			chat_sessions: [
				{
					id: SESSION_ID,
					user_id: USER_ID,
					context_type: 'global',
					entity_id: null,
					summary: null,
					agent_metadata: {
						source: 'ai_inbox',
						inbox_item_id: 'inbox-1',
						project_id: PROJECT_ID,
						project_name: 'Launch',
						proposal_context: {
							llm_text: 'Move the launch checklist under the Q4 plan.'
						}
					}
				}
			],
			chat_messages: [],
			chat_message_attachments: [],
			chat_tool_executions: []
		});
		mocks.buildPendingTurnContractSystemMessage.mockReturnValue(
			'Pending contract system message'
		);

		const result = await prepareAgenticChatWorkerAdmission({
			userClient: {} as never,
			serviceClient: serviceClient as never,
			userId: USER_ID,
			command: command({
				sessionId: SESSION_ID,
				message: 'what are we trying to do here?'
			}) as never,
			lease: {
				decisionId: DECISION_ID,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			},
			dependencies: dependencies()
		});

		const history = result.args.p_artifact_history as Array<{ role: string; content: string }>;
		expect(history.slice(-2)).toEqual([
			expect.objectContaining({ role: 'system', content: 'Pending contract system message' }),
			expect.objectContaining({
				role: 'system',
				content: expect.stringContaining('## Proposal Focus')
			})
		]);
		expect(history.at(-1)?.content).toContain('Move the launch checklist under the Q4 plan.');
		expect(history.at(-1)?.content).toContain('Inbox item id: inbox-1');
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
			acceptedSurfaceProfile: 'worker_realtime:global'
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
				system_prompt_sha256: 'c'.repeat(64),
				sections: [{ id: 'prepared', content_sha256: 'b'.repeat(64) }]
			},
			surfaceKey: 'worker_realtime:global'
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
			p_prepared_surface_profile: 'worker_realtime:global'
		});
		expect(result.args.p_artifact_history).toEqual([
			expect.objectContaining({ role: 'assistant', content: 'Earlier answer' })
		]);
		expect(result.args.p_artifact_prepared).toMatchObject({
			sourcePreparedPromptId: preparedId,
			systemPrompt: 'Prepared system prompt',
			surfaceProfile: 'worker_realtime:global',
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
			expect.objectContaining({ surfaceProfile: 'worker_realtime:global' })
		);
		expect(mocks.inspectPreparedPromptForWorkerAdmission).toHaveBeenCalledWith(
			expect.objectContaining({
				surfaceProfile: 'worker_realtime:global',
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
				acceptedSurfaceProfile: 'worker_realtime:global'
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
				'worker_realtime:project': {
					surface_profile: 'worker_realtime:project',
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
			selectedSurfaceProfile: 'project',
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
				system_prompt_sha256: 'c'.repeat(64),
				sections: [{ id: 'prepared', content_sha256: 'b'.repeat(64) }]
			},
			surfaceKey: 'worker_realtime:project'
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
			p_prepared_surface_profile: 'worker_realtime:project'
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
			selectedSurfaceProfile: 'project',
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
					'worker_realtime:project': {
						surface_profile: 'worker_realtime:project',
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
			acceptedSurfaceProfile: 'worker_realtime:global'
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
				surface: {
					system_prompt: 'Prepared prompt',
					system_prompt_sha256: 'c'.repeat(64),
					sections: []
				},
				surfaceKey: 'worker_realtime:global'
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

	it('refuses attachment turns when worker live vision is disabled', async () => {
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
		).rejects.toMatchObject({ code: 'capability_unavailable' });
	});
	// Stage S6 (2026-09-04): the three stable surfaces, exercised through the
	// real resolver rather than the surface stub the other cases use.
	describe('stable launch surfaces', () => {
		async function realTurnPreparationOnce() {
			const actual =
				await vi.importActual<typeof import('./turn-preparation')>('./turn-preparation');
			mocks.resolveFastChatTurnPreparation.mockImplementationOnce((params: never) =>
				actual.resolveFastChatTurnPreparation(params)
			);
		}

		function admittedToolNames(result: {
			args: { p_artifact_prepared: { toolSurface: { toolNames: string[] } } };
		}): string[] {
			return result.args.p_artifact_prepared.toolSurface.toolNames;
		}

		async function admit(
			commandOverrides: Record<string, unknown>,
			dependencyOverrides: Record<string, unknown> = {}
		) {
			await realTurnPreparationOnce();
			return prepareAgenticChatWorkerAdmission({
				userClient: {} as never,
				serviceClient: {} as never,
				userId: USER_ID,
				command: command(commandOverrides) as never,
				lease: {
					decisionId: DECISION_ID,
					mode: 'worker_realtime',
					contractVersion: 'agentic_chat_worker_v1'
				},
				dependencies: { ...dependencies(), ...dependencyOverrides }
			});
		}

		// A calendar turn used to route to project_calendar, whose calendar
		// writes the worker could not execute — admission renegotiated onto the
		// legacy engine. It now admits on the worker with the global surface.
		it('admits a calendar-context turn on the worker with the global surface', async () => {
			const result = await admit({
				context: { type: 'calendar', entityId: null, projectId: null },
				message: 'Move my 2pm to Thursday and delete the duplicate hold.'
			});

			expect(result.args.p_artifact_prepared.surfaceProfile).toBe('global');
			const names = admittedToolNames(result as never);
			expect(names).toEqual(
				expect.arrayContaining([
					'list_calendar_events',
					'get_calendar_event_details',
					'create_calendar_event',
					'update_calendar_event',
					'delete_calendar_event',
					'delegate_task',
					'web_search',
					'move_onto_task'
				])
			);
			// The omitted discovery tools never reach the signed artifact.
			expect(names).not.toContain('skill_search');
			expect(names).not.toContain('domain_search');
			expect(names).not.toContain('declare_read_only_turn');
		});

		it('gives a project-create turn the shell, its child creates, and the controls', async () => {
			const result = await admit({
				context: { type: 'project_create', entityId: null, projectId: null },
				message: 'Start a project for the Cedar House renovation.'
			});

			expect(result.args.p_artifact_prepared.surfaceProfile).toBe('project_create');
			expect(admittedToolNames(result as never)).toEqual([
				'declare_turn_contract',
				'request_turn_clarification',
				'cancel_turn_contract',
				'create_onto_project',
				'create_onto_goal',
				'create_onto_task'
			]);
		});

		it('mounts the Gmail group only for a user with a live connection', async () => {
			const withoutConnection = await admit(
				{ message: 'What did the contractor say?' },
				{ hasActiveEmailConnection: async () => false }
			);
			const withConnection = await admit(
				{ message: 'What did the contractor say?' },
				{ hasActiveEmailConnection: async () => true }
			);

			const emailGroup = [
				'get_external_account_status',
				'list_email_accounts',
				'search_email_messages',
				'get_email_message',
				'request_email_account_connection'
			];
			for (const name of emailGroup) {
				expect(admittedToolNames(withoutConnection as never), name).not.toContain(name);
			}
			expect(admittedToolNames(withConnection as never)).toEqual(
				expect.arrayContaining(emailGroup)
			);
		});
	});
});
