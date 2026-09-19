// apps/worker/tests/agenticChatWorkflowPreparation.test.ts
import {
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	buildAgenticChatWorkflowReviewIntentV1,
	hashAgenticChatRawWorkflowInputV4,
	type AgenticChatPreparedWorkflowContextV1,
	type AgenticChatRawWorkflowRequestV4,
	type AgenticChatTurnClaimResultV1,
	type AgenticChatWorkflowHistoryMessageV1
} from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/cancellationObserver';
import type { AgenticChatTerminalFinalizeInputV1 } from '../src/workers/agentic-chat/executionControl';
import {
	AgenticChatExecutionInputError,
	type AgenticChatRawWorkflowExecutionInputV1
} from '../src/workers/agentic-chat/executionInput';
import {
	AgenticChatWorkflowStoreRpcError,
	type AgenticChatWorkflowDurableRunV1,
	type AgenticChatWorkflowEventReceiptV1,
	type AgenticChatWorkflowPreparationStorePortV1
} from '../src/workers/agentic-chat/workflow/preparation-store';
import {
	AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES,
	AgenticChatWorkflowTurnPreparer,
	type AgenticChatWorkflowTurnPreparerOptionsV1
} from '../src/workers/agentic-chat/workflow/raw-turn-preparation';
import {
	type AgenticChatWorkflowPreparationTimingV1,
	type AgenticChatWorkflowPreparedTurnV1,
	type AgenticChatWorkflowRunnerPortV1,
	unavailableAgenticChatWorkflowRunner
} from '../src/workers/agentic-chat/workflow/workflow-runner-port';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-0000000000ff';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const CORRELATION_ID = '50000000-0000-4000-8000-000000000005';
const INPUT_ARTIFACT_ID = '70000000-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = '80000000-0000-4000-8000-000000000008';
const PROJECT_ID = 'a0000000-0000-4000-8000-00000000000a';
const WINNING_CONTEXT_ID = 'c0000000-0000-4000-8000-0000000000c1';
const STREAM_RUN_ID = 'stream-run-1';
const CLIENT_TURN_ID = 'client-turn-1';
const MESSAGE = 'Review this project: what should we prioritize next?';
const NOW = Date.parse('2026-09-18T12:00:00.000Z');

type Claim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;

function claimFor(generation = 1, userId = USER_ID): Claim {
	return {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId,
		correlationId: CORRELATION_ID,
		executionGeneration: generation,
		status: 'running',
		inputArtifactId: INPUT_ARTIFACT_ID,
		userMessageId: USER_MESSAGE_ID
	} as Claim;
}

const HISTORY: AgenticChatWorkflowHistoryMessageV1[] = [
	{
		sourceMessageId: '90000000-0000-4000-8000-000000000009',
		role: 'assistant',
		content: 'Earlier we agreed to ship the kitchen first.'
	} as AgenticChatWorkflowHistoryMessageV1
];

async function rawInput(claim: Claim): Promise<AgenticChatRawWorkflowExecutionInputV1> {
	const request: AgenticChatRawWorkflowRequestV4 = {
		requestId: INPUT_ARTIFACT_ID,
		turnRunId: TURN_RUN_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		userMessageId: USER_MESSAGE_ID,
		clientTurnId: CLIENT_TURN_ID,
		streamRunId: STREAM_RUN_ID,
		message: MESSAGE,
		context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
		reviewIntent: buildAgenticChatWorkflowReviewIntentV1(MESSAGE),
		policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
		policyRef: 'internal-project-review:v1',
		cacheRef: null
	};
	const hashes = await hashAgenticChatRawWorkflowInputV4(request, HISTORY);
	return {
		claim,
		streamRunId: STREAM_RUN_ID,
		clientTurnId: CLIENT_TURN_ID,
		requestPayload: { message: MESSAGE },
		timingBaseline: {
			admittedAt: '2026-09-18T11:59:58.000Z',
			startedAt: '2026-09-18T11:59:59.000Z',
			workerStartedAt: '2026-09-18T11:59:59.500Z',
			executionStartedAt: null
		},
		input: {
			artifactVersion: 'agentic_chat_input_v4',
			request,
			historySource: 'admission_window',
			history: HISTORY,
			requestHashVersion: 'agentic_chat_workflow_request_hash_v1',
			...hashes,
			createdAt: '2026-09-18T11:59:58.000Z',
			retainUntil: '2026-09-25T11:59:58.000Z'
		}
	} as unknown as AgenticChatRawWorkflowExecutionInputV1;
}

function projectContext(): MasterPromptContext {
	return {
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		contextLoadSource: 'rpc',
		timezone: 'America/New_York',
		data: {
			project: {
				id: PROJECT_ID,
				name: 'Cedar House',
				updated_at: '2026-09-17T10:00:00.000Z',
				doc_structure: { root: [] }
			},
			goals: [{ id: 'goal-1', name: 'Open by spring', updated_at: '2026-09-10T00:00:00Z' }],
			tasks: [
				{ id: 'task-1', title: 'Order cabinets', updated_at: '2026-09-11T00:00:00Z' },
				{ id: 'task-2', title: 'Book electrician', created_at: '2026-09-12T00:00:00Z' }
			],
			documents: [],
			events: []
		}
	} as unknown as MasterPromptContext;
}

type Harness = ReturnType<typeof createHarness>;

function createHarness(
	options: {
		claim?: Claim;
		allowedUserIds?: string[];
		runner?: AgenticChatWorkflowRunnerPortV1;
		preparer?: AgenticChatWorkflowTurnPreparerOptionsV1;
		run?: Partial<AgenticChatWorkflowDurableRunV1>;
	} = {}
) {
	const claim = options.claim ?? claimFor();
	const calls: string[] = [];
	const timings: AgenticChatWorkflowPreparationTimingV1[] = [];
	const errors: Array<{ stage: string; error: unknown }> = [];
	let sequence = 0;
	let ids = 0;
	let raw: AgenticChatRawWorkflowExecutionInputV1 | null = null;
	const durable: { run: AgenticChatWorkflowDurableRunV1 | null } = { run: null };

	const committed = (): AgenticChatWorkflowEventReceiptV1 => {
		sequence += 1;
		return {
			kind: 'committed',
			receipt: {
				outcome: 'persisted',
				publish_allowed: true,
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				session_id: SESSION_ID,
				user_id: USER_ID,
				stream_run_id: STREAM_RUN_ID,
				client_turn_id: CLIENT_TURN_ID,
				execution_generation: claim.executionGeneration,
				sequence_index: sequence,
				event_id: `${TURN_RUN_ID}:${claim.executionGeneration}:${sequence}`,
				phase: 'llm',
				event_type: 'workflow_progress',
				durable: true
			} as never
		};
	};

	const input = {
		loadRawWorkflowInput: vi.fn(async (value: Claim) => {
			calls.push('load_input');
			raw = await rawInput(value);
			durable.run ??= {
				turnRunId: TURN_RUN_ID,
				sessionId: SESSION_ID,
				userId: USER_ID,
				requestArtifactId: INPUT_ARTIFACT_ID,
				projectId: PROJECT_ID,
				requestHash: raw.input.requestHash,
				phase: 'preparing',
				terminalOutcome: null,
				deadlineAt: null,
				wholeRunLifetimeMs: 900_000,
				recoveryCount: 0,
				context: null,
				contextAcceptedGeneration: null,
				...options.run
			};
			return raw;
		})
	};

	const store = {
		readRun: vi.fn<AgenticChatWorkflowPreparationStorePortV1['readRun']>(async (scope) => {
			calls.push('read_run');
			if (!durable.run || scope.userId !== durable.run.userId) return null;
			return structuredClone(durable.run);
		}),
		hasProjectAccess: vi.fn<AgenticChatWorkflowPreparationStorePortV1['hasProjectAccess']>(
			async () => {
				calls.push('access');
				return true;
			}
		),
		resume: vi.fn<AgenticChatWorkflowPreparationStorePortV1['resume']>(async () => {
			calls.push('resume');
			return {
				outcome: 'resumed',
				phase: durable.run!.phase,
				contextId: durable.run!.context?.contextId ?? null,
				event: committed()
			};
		}),
		acceptContext: vi.fn<AgenticChatWorkflowPreparationStorePortV1['acceptContext']>(
			async (value) => {
				calls.push('accept');
				return commitAcceptance(value);
			}
		),
		recover: vi.fn<AgenticChatWorkflowPreparationStorePortV1['recover']>(async (value) => {
			calls.push(`recover:${value.failureClass}`);
			if (value.failureClass === 'unknown') {
				return {
					outcome: 'terminal_reconciled',
					executionMayRetry: false,
					status: 'failed',
					failureCode: null
				};
			}
			return {
				outcome: 'retry_scheduled',
				executionMayRetry: true,
				status: 'queued',
				failureCode: null
			};
		})
	};

	/** The fake database: first valid checkpoint wins, replays answer `already_accepted`. */
	function commitAcceptance(
		value: Parameters<AgenticChatWorkflowPreparationStorePortV1['acceptContext']>[0]
	) {
		const run = durable.run!;
		if (run.context) {
			const same = run.context.contextId === value.contextId;
			return {
				outcome: same ? ('already_accepted' as const) : ('context_conflict' as const),
				contextId: run.context.contextId,
				contextHash: run.context.contextHash,
				deadlineAt: run.deadlineAt,
				acceptedAt: null,
				event: same
					? ({
							kind: 'replayed',
							eventId: `${TURN_RUN_ID}:${claim.executionGeneration}:${sequence}`,
							sequenceIndex: sequence,
							executionGeneration: claim.executionGeneration
						} as const)
					: ({ kind: 'none' } as const)
			};
		}
		const acceptedAt = '2026-09-18T12:00:01.000Z';
		const context: AgenticChatPreparedWorkflowContextV1 = {
			version: 'agentic_chat_prepared_context_v1',
			contextId: value.contextId,
			turnRunId: TURN_RUN_ID,
			requestId: value.requestArtifactId,
			requestHash: value.requestHash,
			preparationVersion: value.context.preparationVersion,
			contextIdentity: value.context.contextIdentity,
			evidenceVersions: value.context.evidenceVersions,
			payload: value.context.payload,
			payloadBytes: value.context.payloadBytes,
			contextHash: value.context.contextHash,
			acceptedAt
		};
		run.context = structuredClone(context);
		run.phase = 'assessing';
		run.deadlineAt = '2026-09-18T12:14:59.500Z';
		run.contextAcceptedGeneration = claim.executionGeneration;
		return {
			outcome: 'accepted' as const,
			contextId: value.contextId,
			contextHash: value.context.contextHash,
			deadlineAt: run.deadlineAt,
			acceptedAt,
			event: committed()
		};
	}

	const loadContext = vi.fn(
		async (_value: { userId: string; projectId: string; signal: AbortSignal }) => {
			calls.push('load_context');
			return projectContext();
		}
	);

	const publisher = {
		registerTurn: vi.fn(),
		publishReconcileHint: vi.fn(async () => undefined),
		publishCommittedSemantic: vi.fn(async () => 'sent' as const),
		publishTerminal: vi.fn(async () => 'sent' as const),
		getSnapshot: vi.fn(() => ({ durableSequence: sequence, pendingEvents: 0, busy: false })),
		unregisterTurn: vi.fn(),
		abandonTurn: vi.fn()
	};

	const control = {
		finalize: vi.fn(async (value: AgenticChatTerminalFinalizeInputV1) => {
			calls.push(`finalize:${String(value.status)}`);
			sequence += 1;
			if (durable.run) durable.run.phase = 'finished';
			return {
				outcome: 'finalized' as const,
				turn_run_id: TURN_RUN_ID,
				session_id: SESSION_ID,
				user_id: USER_ID,
				queue_job_id: QUEUE_JOB_ID,
				execution_generation: claim.executionGeneration,
				status: value.status,
				finished_reason: value.finishedReason,
				failure_code: value.failureCode,
				assistant_message_id: null,
				terminal_event_id: `${TURN_RUN_ID}:${claim.executionGeneration}:${sequence}`,
				terminal_sequence_index: sequence,
				terminalized_at: '2026-09-18T12:00:02.000Z'
			};
		})
	};

	const runner = options.runner ?? {
		run: vi.fn<AgenticChatWorkflowRunnerPortV1['run']>(async ({ prepared }) => {
			calls.push('runner');
			return {
				kind: 'handled',
				result: {
					outcome: 'completed',
					turnRunId: prepared.claim.turnRunId,
					executionGeneration: prepared.claim.executionGeneration,
					terminalStatus: 'completed',
					queueReconciled: true
				}
			};
		})
	};

	let monotonic = 0;
	const preparer = new AgenticChatWorkflowTurnPreparer(
		{
			input,
			store,
			loadContext,
			publisher: publisher as never,
			control: control as never,
			runner,
			allowedUserIds: options.allowedUserIds ?? [USER_ID],
			createId: () => `d0000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
			now: () => NOW,
			monotonicNow: () => (monotonic += 5),
			onTiming: (timing) => timings.push(timing),
			onError: (report) => errors.push(report)
		},
		options.preparer
	);

	const execute = (
		value: { claim?: Claim; signal?: AbortSignal; invocationDeadlineAtMs?: number } = {}
	) => {
		const current = value.claim ?? claim;
		return preparer.execute({
			envelope: {
				turnRunId: TURN_RUN_ID,
				queueJobId: QUEUE_JOB_ID,
				processingToken: PROCESSING_TOKEN
			},
			claim: current,
			signal: value.signal ?? new AbortController().signal,
			invocationDeadlineAtMs: value.invocationDeadlineAtMs ?? NOW + 600_000
		});
	};

	return {
		preparer,
		execute,
		calls,
		timings,
		errors,
		durable,
		input,
		store,
		loadContext,
		publisher,
		control,
		runner,
		getSequence: () => sequence,
		getRaw: () => raw!
	};
}

function preparedTurn(harness: Harness, index = 0): AgenticChatWorkflowPreparedTurnV1 {
	const run = (harness.runner.run as ReturnType<typeof vi.fn>).mock.calls[index]?.[0] as
		| { prepared: AgenticChatWorkflowPreparedTurnV1 }
		| undefined;
	if (!run) throw new Error('runner was not called');
	return run.prepared;
}

function finalizeInput(harness: Harness) {
	return harness.control.finalize.mock.calls[0]![0];
}

function uncertain(): AgenticChatWorkflowStoreRpcError {
	return new AgenticChatWorkflowStoreRpcError(
		'accept_agentic_chat_workflow_context_v1',
		'',
		'TypeError: fetch failed'
	);
}

describe('AgenticChatWorkflowTurnPreparer', () => {
	it('gathers context only after the claim and hands one accepted checkpoint to the runner', async () => {
		const harness = createHarness();

		await expect(harness.execute()).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});

		// No project context is read before the durable progress checkpoint, and
		// the runner (the only path toward a provider) starts after acceptance.
		expect(harness.calls).toEqual([
			'load_input',
			'read_run',
			'resume',
			'access',
			'load_context',
			'accept',
			'runner'
		]);
		const resume = harness.store.resume.mock.calls[0]![0];
		expect(resume.fence).toEqual({
			turnRunId: TURN_RUN_ID,
			queueJobId: QUEUE_JOB_ID,
			processingToken: PROCESSING_TOKEN,
			executionGeneration: 1
		});
		expect(resume.projection).toMatchObject({
			current_activity: 'Gathering project context',
			workflow: { version: 'agentic_chat_workflow_projection_v1', phase: 'preparing' }
		});
		expect(resume.eventPayload).toMatchObject({
			type: 'workflow_progress',
			workflow: { phase: 'preparing' }
		});

		const accept = harness.store.acceptContext.mock.calls[0]![0];
		expect(accept).toMatchObject({
			requestArtifactId: INPUT_ARTIFACT_ID,
			requestHash: harness.getRaw().input.requestHash,
			projection: { workflow: { phase: 'assessing' } },
			eventPayload: { type: 'workflow_progress', workflow: { phase: 'assessing' } },
			context: {
				preparationVersion: 'agentic_chat_workflow_preparation_v1',
				contextIdentity: {
					userId: USER_ID,
					projectId: PROJECT_ID,
					accessCheckedAt: new Date(NOW).toISOString(),
					contextLoadedAt: new Date(NOW).toISOString(),
					cacheRefUsed: null
				}
			}
		});
		expect(accept.context.evidenceVersions.map((entry) => entry.id)).toEqual([
			PROJECT_ID,
			'goal-1',
			'task-1',
			'task-2'
		]);

		expect(harness.runner.run).toHaveBeenCalledOnce();
		const prepared = preparedTurn(harness);
		expect(prepared).toMatchObject({
			version: 'agentic_chat_workflow_prepared_turn_v1',
			contextSource: 'accepted_now',
			durableRun: { phase: 'assessing', contextAcceptedGeneration: 1 },
			stream: { resumeRequired: false, durableSequence: 2 },
			deadlines: { workflowDeadlineAt: '2026-09-18T12:14:59.500Z' },
			command: { streamRunId: STREAM_RUN_ID, clientTurnId: CLIENT_TURN_ID }
		});
		expect(prepared.context).toEqual(harness.durable.run!.context);
		expect(prepared.modelInput).toMatchObject({
			contextId: accept.contextId,
			contextHash: accept.context.contextHash,
			requestHash: harness.getRaw().input.requestHash,
			history: [
				{ role: 'assistant', content: 'Earlier we agreed to ship the kitchen first.' }
			]
		});
		expect(prepared.modelInput.evidence.get('task-1')).toMatchObject({
			recordKind: 'task',
			label: 'task: Order cabinets'
		});

		expect(harness.publisher.registerTurn).toHaveBeenCalledOnce();
		expect(
			harness.publisher.publishCommittedSemantic.mock.calls.map(
				(call) =>
					(call as unknown as [string, { sequence_index: number }])[1].sequence_index
			)
		).toEqual([1, 2]);
		expect(harness.control.finalize).not.toHaveBeenCalled();
		expect(harness.publisher.unregisterTurn).toHaveBeenCalledWith(TURN_RUN_ID);

		expect(harness.timings).toHaveLength(1);
		expect(harness.timings[0]).toMatchObject({
			event: 'agentic_chat_workflow_preparation_timing',
			outcome: 'provider_ready',
			contextSource: 'fresh_load',
			checkpointOutcome: 'accepted',
			checkpointReplayed: false,
			admissionToClaimMs: 1_500,
			evidenceCount: 4,
			omittedRecords: 0,
			// input (turn + artifact), run, resume, access, accept
			dbRoundTrips: 6
		});
		expect(prepared.timing).toEqual(harness.timings[0]);
	});

	it('ends in a readable, durable failure while no workflow runner is enabled', async () => {
		const harness = createHarness({ runner: unavailableAgenticChatWorkflowRunner });

		await expect(harness.execute()).resolves.toEqual({
			outcome: 'failed',
			turnRunId: TURN_RUN_ID,
			executionGeneration: 1,
			terminalStatus: 'failed',
			queueReconciled: true
		});

		const finalize = finalizeInput(harness);
		expect(finalize).toMatchObject({
			status: 'failed',
			finishedReason: 'error',
			failureCode: 'workflow_execution_not_enabled',
			assistantText: '',
			assistantMessageId: null,
			projection: {
				current_activity:
					AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES.workflow_execution_not_enabled,
				workflow: {
					phase: 'finished',
					terminalOutcome: 'failed',
					coverageGap:
						AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES.workflow_execution_not_enabled
				}
			},
			eventPayload: {
				type: 'done',
				status: 'failed',
				failure_code: 'workflow_execution_not_enabled'
			}
		});
		expect(harness.publisher.publishTerminal).toHaveBeenCalledOnce();
		expect(finalize.eventPayload.workflow).toEqual(finalize.projection.workflow);
		expect(harness.publisher.publishTerminal).toHaveBeenCalledWith(
			TURN_RUN_ID,
			expect.anything(),
			expect.objectContaining({ workflow: finalize.projection.workflow })
		);
		expect(harness.calls.slice(-2)).toEqual(['finalize:failed', 'recover:unknown']);
		// Timing is one line per preparation, at provider readiness; the runner's
		// own outcome is reported by the terminal it wrote.
		expect(harness.timings).toHaveLength(1);
		expect(harness.timings[0]).toMatchObject({ outcome: 'provider_ready', failureCode: null });
	});

	it('refuses a user outside the workflow cohort before reading the request', async () => {
		const harness = createHarness({ allowedUserIds: [OTHER_USER_ID] });

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'failed' });

		expect(harness.input.loadRawWorkflowInput).not.toHaveBeenCalled();
		expect(harness.loadContext).not.toHaveBeenCalled();
		expect(finalizeInput(harness)).toMatchObject({ failureCode: 'workflow_not_enabled' });
		expect(harness.publisher.registerTurn).not.toHaveBeenCalled();
		expect(harness.publisher.publishTerminal).not.toHaveBeenCalled();
	});

	it('refuses a request that does not bind to its durable workflow run', async () => {
		const mismatched = createHarness({ run: { requestHash: 'f'.repeat(64) } });
		await expect(mismatched.execute()).resolves.toMatchObject({ outcome: 'failed' });
		expect(finalizeInput(mismatched)).toMatchObject({ failureCode: 'workflow_input_invalid' });
		expect(mismatched.store.resume).not.toHaveBeenCalled();
		expect(mismatched.loadContext).not.toHaveBeenCalled();

		// Cross-user: the run read is user-scoped, so another user's claim finds nothing.
		const crossUser = createHarness({
			claim: claimFor(1, OTHER_USER_ID),
			allowedUserIds: [USER_ID, OTHER_USER_ID]
		});
		await expect(crossUser.execute()).resolves.toMatchObject({ outcome: 'failed' });
		expect(crossUser.store.readRun).toHaveBeenCalledWith({
			turnRunId: TURN_RUN_ID,
			userId: OTHER_USER_ID
		});
		expect(finalizeInput(crossUser)).toMatchObject({ failureCode: 'workflow_input_invalid' });
		expect(crossUser.loadContext).not.toHaveBeenCalled();
	});

	it('fails permanently on an unverifiable immutable request', async () => {
		const harness = createHarness();
		harness.input.loadRawWorkflowInput.mockRejectedValueOnce(
			new AgenticChatExecutionInputError('invalid_artifact', 'request_hash_mismatch')
		);

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'failed' });
		expect(finalizeInput(harness)).toMatchObject({ failureCode: 'workflow_input_invalid' });
		expect(harness.store.readRun).not.toHaveBeenCalled();
	});

	it('stops before reading project context when access was revoked', async () => {
		const harness = createHarness();
		harness.store.hasProjectAccess.mockResolvedValueOnce(false);

		await expect(harness.execute()).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed'
		});
		expect(harness.loadContext).not.toHaveBeenCalled();
		expect(harness.store.acceptContext).not.toHaveBeenCalled();
		expect(harness.runner.run).not.toHaveBeenCalled();
		expect(finalizeInput(harness)).toMatchObject({
			failureCode: 'workflow_access_revoked',
			projection: {
				workflow: {
					coverageGap: AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES.workflow_access_revoked
				}
			}
		});
	});

	it('honors an access revocation the checkpoint RPC observes at commit', async () => {
		const harness = createHarness();
		harness.store.acceptContext.mockResolvedValueOnce({ outcome: 'access_revoked' });

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'failed' });
		expect(harness.runner.run).not.toHaveBeenCalled();
		expect(finalizeInput(harness)).toMatchObject({ failureCode: 'workflow_access_revoked' });
	});

	it('fails before loading context when the whole-run deadline has passed', async () => {
		const harness = createHarness({ run: { deadlineAt: '2026-09-18T11:59:00.000Z' } });

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'failed' });
		expect(harness.loadContext).not.toHaveBeenCalled();
		expect(finalizeInput(harness)).toMatchObject({ failureCode: 'workflow_deadline_expired' });
	});

	it('bounds the context read and never attaches a late result', async () => {
		const harness = createHarness({ preparer: { contextTimeoutMs: 20 } });
		let lateResolved = false;
		harness.loadContext.mockImplementationOnce(async () => {
			harness.calls.push('load_context');
			// Ignores its signal on purpose: the preparer must still refuse the late value.
			await new Promise((resolve) => setTimeout(resolve, 80));
			lateResolved = true;
			return projectContext();
		});

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'requeued' });
		expect(harness.store.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'timeout_pre_start' })
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(lateResolved).toBe(true);
		expect(harness.store.acceptContext).not.toHaveBeenCalled();
		expect(harness.runner.run).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
		expect(harness.timings[0]).toMatchObject({ outcome: 'requeued' });
	});

	it('reserves finalization time from a nearly exhausted invocation', async () => {
		const harness = createHarness();

		await expect(
			harness.execute({ invocationDeadlineAtMs: NOW + 4_000 })
		).resolves.toMatchObject({ outcome: 'requeued' });
		expect(harness.loadContext).not.toHaveBeenCalled();
		expect(harness.store.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'timeout_pre_start' })
		);
	});

	it('stops on cancellation during the context read without attaching context', async () => {
		const harness = createHarness();
		const job = new AbortController();
		harness.loadContext.mockImplementationOnce(({ signal }) => {
			harness.calls.push('load_context');
			queueMicrotask(() =>
				job.abort(
					new AgenticChatCancellationError({
						turn_run_id: TURN_RUN_ID,
						execution_generation: 1,
						signal_id: 'signal-1',
						cancel_reason: 'user_requested' as never,
						cancel_source: 'user' as never,
						cancel_requested_at: '2026-09-18T12:00:00.500Z',
						consumed_at: '2026-09-18T12:00:00.600Z'
					})
				)
			);
			return new Promise((_resolve, reject) =>
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
			);
		});

		await expect(harness.execute({ signal: job.signal })).resolves.toMatchObject({
			outcome: 'cancelled',
			terminalStatus: 'cancelled'
		});
		expect(harness.store.acceptContext).not.toHaveBeenCalled();
		expect(harness.runner.run).not.toHaveBeenCalled();
		expect(finalizeInput(harness)).toMatchObject({
			status: 'cancelled',
			finishedReason: 'cancelled',
			failureCode: 'cancelled'
		});
	});

	it('writes nothing more after ownership moves to a newer generation', async () => {
		const atAccept = createHarness();
		atAccept.store.acceptContext.mockResolvedValueOnce({ outcome: 'stale_generation' });
		await expect(atAccept.execute()).resolves.toMatchObject({
			outcome: 'stale_generation',
			terminalStatus: null
		});
		expect(atAccept.runner.run).not.toHaveBeenCalled();
		expect(atAccept.control.finalize).not.toHaveBeenCalled();
		expect(atAccept.store.recover).not.toHaveBeenCalled();

		const atResume = createHarness();
		atResume.store.resume.mockResolvedValueOnce({ outcome: 'ownership_lost' });
		await expect(atResume.execute()).resolves.toMatchObject({ outcome: 'stale_generation' });
		expect(atResume.loadContext).not.toHaveBeenCalled();
		expect(atResume.store.hasProjectAccess).not.toHaveBeenCalled();
		expect(atResume.control.finalize).not.toHaveBeenCalled();
	});

	it('replays a lost acceptance response and hands on the durable checkpoint', async () => {
		const harness = createHarness();
		const commit = harness.store.acceptContext.getMockImplementation()!;
		harness.store.acceptContext.mockImplementationOnce(async (value) => {
			// The database committed, then the response was lost.
			await commit(value);
			throw uncertain();
		});

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'completed' });

		expect(harness.calls).toEqual([
			'load_input',
			'read_run',
			'resume',
			'access',
			'load_context',
			'accept',
			'accept',
			'read_run',
			'runner'
		]);
		expect(harness.store.acceptContext).toHaveBeenCalledTimes(2);
		const [first, second] = harness.store.acceptContext.mock.calls.map((call) => call[0]);
		expect(second).toEqual(first);
		expect(harness.runner.run).toHaveBeenCalledOnce();
		const prepared = preparedTurn(harness);
		expect(prepared.context).toEqual(harness.durable.run!.context);
		expect(prepared.context.acceptedAt).toBe('2026-09-18T12:00:01.000Z');
		// The replay's durable coordinates still reach the publisher, reconcile-only.
		const published = harness.publisher.publishCommittedSemantic.mock.calls.map(
			(call) => (call as unknown as [string, Record<string, unknown>])[1]
		);
		expect(published[1]).toMatchObject({
			outcome: 'already_persisted',
			publish_allowed: false,
			sequence_index: 2,
			event_type: 'workflow_progress'
		});
		expect(harness.timings[0]).toMatchObject({
			outcome: 'provider_ready',
			checkpointOutcome: 'already_accepted',
			checkpointReplayed: true
		});
	});

	it('requeues after a doubly lost response; the next generation reuses the durable checkpoint', async () => {
		const harness = createHarness();
		const commit = harness.store.acceptContext.getMockImplementation()!;
		harness.store.acceptContext
			.mockImplementationOnce(async (value) => {
				await commit(value);
				throw uncertain();
			})
			.mockImplementationOnce(async () => {
				throw uncertain();
			});

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'requeued' });
		expect(harness.store.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'transient_infra' })
		);
		expect(harness.runner.run).not.toHaveBeenCalled();
		const accepted = harness.durable.run!.context!;
		expect(accepted).not.toBeNull();

		harness.calls.length = 0;
		await expect(harness.execute({ claim: claimFor(2) })).resolves.toMatchObject({
			outcome: 'completed'
		});
		// Recovery rechecks access but never re-gathers or re-snapshots context.
		expect(harness.calls).toEqual(['load_input', 'read_run', 'access', 'runner']);
		const prepared = preparedTurn(harness);
		expect(prepared).toMatchObject({
			contextSource: 'reused_durable',
			stream: { resumeRequired: true },
			durableRun: { phase: 'assessing' }
		});
		expect(prepared.context).toEqual(accepted);
		expect(harness.timings.at(-1)).toMatchObject({
			outcome: 'provider_ready',
			contextSource: 'reused_durable',
			contextLoadMs: null
		});
	});

	it('rechecks access before reusing an accepted checkpoint on recovery', async () => {
		const harness = createHarness();
		await harness.execute();
		harness.calls.length = 0;
		harness.durable.run!.phase = 'assessing';
		harness.store.hasProjectAccess.mockImplementationOnce(async () => {
			harness.calls.push('access');
			return false;
		});

		await expect(harness.execute({ claim: claimFor(2) })).resolves.toMatchObject({
			outcome: 'failed'
		});
		expect(harness.calls).toEqual([
			'load_input',
			'read_run',
			'access',
			'finalize:failed',
			'recover:unknown'
		]);
		expect(finalizeInput(harness)).toMatchObject({ failureCode: 'workflow_access_revoked' });
		expect(harness.runner.run).toHaveBeenCalledOnce();
	});

	it('reuses the winning checkpoint when another acceptance won first', async () => {
		const harness = createHarness();
		harness.store.acceptContext.mockImplementationOnce(async (value) => {
			const run = harness.durable.run!;
			run.context = {
				version: 'agentic_chat_prepared_context_v1',
				contextId: WINNING_CONTEXT_ID,
				turnRunId: TURN_RUN_ID,
				requestId: INPUT_ARTIFACT_ID,
				requestHash: value.requestHash,
				preparationVersion: value.context.preparationVersion,
				contextIdentity: value.context.contextIdentity,
				evidenceVersions: value.context.evidenceVersions,
				payload: value.context.payload,
				payloadBytes: value.context.payloadBytes,
				contextHash: value.context.contextHash,
				acceptedAt: '2026-09-18T11:59:59.900Z'
			};
			run.phase = 'assessing';
			return {
				outcome: 'context_conflict',
				contextId: WINNING_CONTEXT_ID,
				contextHash: value.context.contextHash,
				deadlineAt: null,
				acceptedAt: null,
				event: { kind: 'none' }
			};
		});

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'completed' });
		const prepared = preparedTurn(harness);
		expect(prepared.context.contextId).toBe(WINNING_CONTEXT_ID);
		expect(prepared.contextSource).toBe('reused_durable');
		expect(harness.publisher.publishCommittedSemantic).toHaveBeenCalledOnce();
	});

	it('reconciles a finished run without new workflow writes', async () => {
		const harness = createHarness({ run: { phase: 'finished', terminalOutcome: 'failed' } });

		await expect(harness.execute()).resolves.toMatchObject({
			outcome: 'terminal_reconciled',
			terminalStatus: 'failed',
			queueReconciled: true
		});
		expect(harness.store.resume).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
		expect(harness.store.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'unknown' })
		);
	});

	it('fails readably when the project is too large to checkpoint', async () => {
		const harness = createHarness();
		const huge = projectContext();
		const project = (huge.data as unknown as { project: Record<string, unknown> }).project;
		for (let index = 0; index < 60; index += 1) project[`field_${index}`] = 'x'.repeat(5_000);
		harness.loadContext.mockResolvedValueOnce(huge);

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'failed' });
		expect(harness.store.acceptContext).not.toHaveBeenCalled();
		expect(finalizeInput(harness)).toMatchObject({ failureCode: 'workflow_context_too_large' });
	});

	it('treats a failed project context RPC as transient, never as authorization', async () => {
		const harness = createHarness();
		harness.loadContext.mockResolvedValueOnce({
			...projectContext(),
			contextLoadSource: 'rpc_error_fallback'
		});

		await expect(harness.execute()).resolves.toMatchObject({ outcome: 'requeued' });
		expect(harness.store.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'transient_infra' })
		);
		expect(harness.store.acceptContext).not.toHaveBeenCalled();
	});
});
