// apps/worker/tests/agenticChatWorkflowRunnerAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/turn/cancellation-observer';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/provider/provider-capacity';
import { createAgenticChatWorkflowTurnPreparerV1 } from '../src/workers/agentic-chat/workflow/preparation-composition';
import { AgenticChatWorkflowRunner } from '../src/workers/agentic-chat/workflow/workflow-runner';
import { AgenticChatWorkflowRunnerAdapter } from '../src/workers/agentic-chat/workflow/workflow-runner-adapter';
import type { AgenticChatWorkflowPreparedTurnV1 } from '../src/workers/agentic-chat/workflow/workflow-runner-port';
import { stableAgenticChatWorkflowAnswerMessageIdV1 } from '../src/workers/agentic-chat/workflow/workflow-terminal';
import { AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE } from '../src/workers/agentic-chat/workflow/workflow-projection';
import { WorkflowStoreFake, fakeWorkflowModelInput } from './helpers/workflowStoreFake';
import {
	EDITOR_TEXT,
	type ScriptedCall,
	type ScriptedReply,
	happyScript,
	reportReply,
	scriptedWorkflowProvider
} from './helpers/workflowProviderScript';

/**
 * Tasker 87 behind Tasker 86's runner port: every runner outcome maps to exactly one
 * terminal action, and terminal writes are built from durable truth.
 */

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';

function prepared(
	store: WorkflowStoreFake,
	overrides: { resumeRequired?: boolean; invocationMs?: number } = {}
): AgenticChatWorkflowPreparedTurnV1 {
	const fence = store.fence;
	return {
		version: 'agentic_chat_workflow_prepared_turn_v1',
		envelope: {
			turnRunId: fence.turnRunId,
			queueJobId: fence.queueJobId,
			processingToken: fence.processingToken
		},
		claim: {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: fence.turnRunId,
			queueJobId: fence.queueJobId,
			sessionId: SESSION_ID,
			userId: USER_ID,
			executionGeneration: fence.executionGeneration
		},
		command: { streamRunId: 'stream-run-1', clientTurnId: 'client-turn-1' },
		request: { request: { context: { projectId: 'project-1' } } },
		modelInput: fakeWorkflowModelInput(store),
		stream: { resumeRequired: overrides.resumeRequired ?? true, durableSequence: 0 },
		deadlines: {
			workflowDeadlineAt: null,
			invocationDeadlineAtMs: Date.now() + (overrides.invocationMs ?? 300_000)
		}
	} as unknown as AgenticChatWorkflowPreparedTurnV1;
}

function harness(
	options: {
		store?: WorkflowStoreFake;
		script?: (call: ScriptedCall) => ScriptedReply;
		finalize?: (input: any, store: WorkflowStoreFake) => Promise<any>;
		textFlushBytes?: number;
	} = {}
) {
	const store =
		options.store ??
		(() => {
			const created = new WorkflowStoreFake({ nowMs: Date.now() });
			created.seedAcceptedContext();
			return created;
		})();
	const provider = scriptedWorkflowProvider(options.script ?? happyScript);
	const finalize = vi.fn(async (input: any) => {
		if (options.finalize) return options.finalize(input, store);
		return commitFinalize(store, input);
	});
	const recoverWorkflow = vi.fn(async (input: any) =>
		store.recoverTurn(
			{
				turnRunId: input.turnRunId,
				queueJobId: input.queueJobId,
				processingToken: input.processingToken,
				executionGeneration: input.executionGeneration
			},
			input
		)
	);
	const order: string[] = [];
	const publisher = {
		publishCommittedSemantic: vi.fn(async () => {
			order.push('semantic');
			return 'broadcast_acknowledged' as const;
		}),
		publishCommittedText: vi.fn(async () => {
			order.push('text');
			return 'broadcast_acknowledged' as const;
		}),
		publishTerminal: vi.fn(async () => {
			order.push('terminal');
			return 'broadcast_acknowledged' as const;
		}),
		flushTurn: vi.fn(async () => {
			order.push('flush');
			return [];
		})
	};
	const summaries: any[] = [];
	const adapter = new AgenticChatWorkflowRunnerAdapter({
		runner: new AgenticChatWorkflowRunner(
			{
				store,
				client: provider.client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 2 })
			},
			{
				capacityPollMs: 5,
				meter: { settleRetryDelayMs: 1 },
				textFlushBytes: options.textFlushBytes ?? 512
			}
		),
		store,
		control: {
			finalize: finalize as never,
			recoverWorkflow: recoverWorkflow as never
		},
		publisher: publisher as never,
		onRunSummary: (summary) => summaries.push(summary)
	});
	const controller = new AbortController();
	return {
		store,
		provider,
		adapter,
		finalize,
		recoverWorkflow,
		publisher,
		order,
		summaries,
		controller,
		run: (overrides: Parameters<typeof prepared>[1] = {}) =>
			adapter.run({ prepared: prepared(store, overrides), signal: controller.signal })
	};
}

/** The single terminal writer: commits, fires the workflow terminal trigger, returns its receipt. */
function commitFinalize(store: WorkflowStoreFake, input: any) {
	if (['completed', 'failed', 'cancelled'].includes(store.turnStatus)) {
		return {
			outcome: 'already_terminal',
			status: store.turnStatus,
			terminal_sequence_index: 9
		};
	}
	if (store.cancelRequested && input.status !== 'cancelled') {
		return { outcome: 'cancel_requested', status: 'running' };
	}
	store.terminalize(input.status);
	return { outcome: 'finalized', status: input.status, terminal_sequence_index: 9 };
}

describe('AgenticChatWorkflowRunnerAdapter', () => {
	it('finalizes an accepted synthesis once, from durable truth, after draining delivery', async () => {
		const h = harness();
		const outcome = await h.run();

		expect(outcome).toEqual({
			kind: 'handled',
			result: {
				outcome: 'completed',
				turnRunId: h.store.turnRunId,
				executionGeneration: 1,
				terminalStatus: 'completed',
				queueReconciled: true
			}
		});
		expect(h.finalize).toHaveBeenCalledOnce();
		const request = h.finalize.mock.calls[0]![0];
		expect(request).toMatchObject({
			status: 'completed',
			finishedReason: 'stop',
			failureCode: null,
			assistantText: EDITOR_TEXT,
			assistantMessageId: stableAgenticChatWorkflowAnswerMessageIdV1(h.store.turnRunId, 1),
			assistantMetadata: expect.objectContaining({
				workflow_quality: 'complete',
				workflow_answer_source: 'editor'
			}),
			projection: expect.objectContaining({
				version: 'agentic_chat_ui_projection_v1',
				workflow: expect.objectContaining({
					phase: 'finished',
					terminalOutcome: 'complete',
					answer: expect.objectContaining({ status: 'accepted' })
				})
			})
		});
		expect(request.eventPayload.workflow).toEqual(request.projection.workflow);
		expect(request.assistantMetadata.chat_workflow_v1).toEqual(request.projection.workflow);
		expect(h.publisher.publishTerminal).toHaveBeenCalledWith(
			h.store.turnRunId,
			expect.anything(),
			expect.objectContaining({ workflow: request.projection.workflow })
		);
		// Stream drained before terminal truth; queue reconciled by workflow recovery.
		expect(h.order.indexOf('flush')).toBeLessThan(h.order.indexOf('terminal'));
		expect(h.recoverWorkflow).toHaveBeenLastCalledWith(
			expect.objectContaining({ failureClass: 'unknown' })
		);
		expect(h.store.run.terminalOutcome).toBe('complete');
		expect(h.summaries[0]).toMatchObject({
			event: 'agentic_chat_workflow_run',
			runOutcome: 'completed',
			result: 'completed',
			dispatches: 4,
			settledMicroUsd: 4_400,
			uncertainDispatches: 0
		});
	});

	it('replays a lost terminal response with identical input and treats already_terminal as done', async () => {
		let calls = 0;
		const h = harness({
			finalize: async (input, store) => {
				calls += 1;
				const receipt = commitFinalize(store, input);
				if (calls === 1) throw new Error('connection reset after commit');
				return receipt;
			}
		});
		const outcome = await h.run();

		expect(h.finalize).toHaveBeenCalledTimes(2);
		expect(h.finalize.mock.calls[1]![0]).toEqual(h.finalize.mock.calls[0]![0]);
		expect(outcome).toMatchObject({
			kind: 'handled',
			result: { outcome: 'completed', terminalStatus: 'completed' }
		});
	});

	it('hands a retryable stop to workflow recovery and writes no terminal truth', async () => {
		const h = harness();
		const outcome = await h.run({ invocationMs: 3_000 });

		expect(outcome).toMatchObject({ kind: 'handled', result: { outcome: 'requeued' } });
		expect(h.finalize).not.toHaveBeenCalled();
		expect(h.recoverWorkflow).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'timeout_post_start' })
		);
		expect(h.store.turnStatus).toBe('queued');
	});

	it('ends a workflow that may not retry as a model-free partial built from accepted reports', async () => {
		const store = new WorkflowStoreFake({ nowMs: Date.now() });
		store.seedAcceptedContext();
		const h = harness({
			store,
			script: (call) =>
				call.role === 'risk_reviewer'
					? { kind: 'http_error', status: 500 }
					: happyScript(call)
		});
		// The editor claim hits a transient infrastructure failure, and recovery refuses
		// the requeue because the queue attempts are spent.
		store.inject('claimStep', 'fail_before', (args) => args.input.stepKey === 'editor', 5);
		store.queueAttempts = 5;
		const outcome = await h.run();

		expect(outcome).toMatchObject({
			kind: 'handled',
			result: { outcome: 'completed', terminalStatus: 'completed' }
		});
		const request = h.finalize.mock.calls[0]![0];
		expect(request.assistantText).toContain('Partial review:');
		expect(request.assistantText).toContain('The venue is the next blocker.');
		expect(request.assistantText).toContain(
			'## Risk and alternatives reviewer\n\nThis part of the review did not finish.'
		);
		expect(request.projection.workflow).toMatchObject({
			terminalOutcome: 'partial',
			coverageGap:
				'The risk and alternatives reviewer did not finish, so this review is partial.'
		});
		expect(h.provider.callsFor('editor')).toHaveLength(0);
		expect(store.run.terminalOutcome).toBe('partial');
	});

	it('fails without content when no specialist report was accepted and recovery refuses', async () => {
		const store = new WorkflowStoreFake({ nowMs: Date.now() });
		store.seedAcceptedContext();
		store.queueAttempts = 5;
		const h = harness({ store });
		const outcome = await h.run({ invocationMs: 3_000 });

		expect(outcome).toMatchObject({ kind: 'handled', result: { outcome: 'failed' } });
		expect(h.finalize.mock.calls[0]![0]).toMatchObject({
			status: 'failed',
			failureCode: 'workflow_attempts_exhausted',
			assistantText: '',
			assistantMessageId: null
		});
	});

	it('keeps a durable answer prefix as the visible partial message on Stop', async () => {
		const store = new WorkflowStoreFake({ nowMs: Date.now() });
		store.seedAcceptedContext();
		const h = harness({
			store,
			textFlushBytes: 16,
			script: (call) =>
				call.role === 'editor'
					? { kind: 'text', text: EDITOR_TEXT, chunks: 4, stallAfterText: true }
					: happyScript(call)
		});
		// Stop arrives while the editor is streaming, after its first batch is durable.
		const running = h.run();
		for (let waited = 0; !store.run.answer.text && waited < 5_000; waited += 5) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		expect(store.run.answer.text.length).toBeGreaterThan(0);
		store.cancelRequested = true;
		h.controller.abort(
			new AgenticChatCancellationError({
				turn_run_id: store.turnRunId,
				execution_generation: 1,
				signal_id: '70000000-0000-4000-8000-000000000007',
				cancel_reason: 'user_requested',
				cancel_source: 'web',
				cancel_requested_at: new Date().toISOString(),
				consumed_at: new Date().toISOString()
			} as never)
		);
		const outcome = await running;

		expect(outcome).toMatchObject({ kind: 'handled', result: { outcome: 'cancelled' } });
		const request = h.finalize.mock.calls[0]![0];
		expect(request).toMatchObject({
			status: 'cancelled',
			failureCode: 'cancelled',
			assistantText: store.run.answer.text,
			assistantMessageId: stableAgenticChatWorkflowAnswerMessageIdV1(store.turnRunId, 1)
		});
		expect(request.assistantText).not.toContain(AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE);
		// The aborted editor request may have crossed the provider boundary: held.
		expect([...store.dispatches.values()].find((row) => row.stepKey === 'editor')?.state).toBe(
			'uncertain'
		);
		expect(h.provider.callsFor('editor')).toHaveLength(1);
	});

	it('writes nothing for a replaced worker', async () => {
		const store = new WorkflowStoreFake({ nowMs: Date.now() });
		store.seedAcceptedContext();
		const h = harness({ store, script: (call) => happyScript(call) });
		store.before = (op, args) => {
			if (op === 'acceptStepResult' && args.input.stepKey === 'project_analyst') {
				store.generation = 2;
			}
		};
		const outcome = await h.run();

		expect(outcome).toMatchObject({ kind: 'handled', result: { outcome: 'stale_generation' } });
		expect(h.finalize).not.toHaveBeenCalled();
	});

	it('sends no resume when preparation already made this generation’s first write', async () => {
		const h = harness();
		await h.run({ resumeRequired: false });

		expect(h.store.calls.filter((call) => call.op === 'resume')).toHaveLength(0);
		expect(h.store.progressEvents(1)[0]!.phase).toBe('assessing');
		const reruns = harness();
		await reruns.run({ resumeRequired: true });
		expect(reruns.store.calls.filter((call) => call.op === 'resume')).toHaveLength(1);
	});

	it('refuses a model input that is not bound to the accepted context checkpoint', async () => {
		const store = new WorkflowStoreFake({ nowMs: Date.now() });
		store.seedAcceptedContext();
		const h = harness({ store });
		const turn = prepared(store);
		(turn.modelInput as any).contextHash = 'f'.repeat(64);
		const outcome = await h.adapter.run({ prepared: turn, signal: h.controller.signal });

		expect(outcome).toMatchObject({ kind: 'handled', result: { outcome: 'failed' } });
		expect(h.finalize.mock.calls[0]![0]).toMatchObject({
			failureCode: 'workflow_context_mismatch'
		});
		expect(h.provider.calls).toHaveLength(0);
	});

	it('delivers committed events in commit order and never lets delivery gate progress', async () => {
		const h = harness({
			script: (call) =>
				call.role === 'project_analyst' || call.role === 'risk_reviewer'
					? reportReply(call.role, ['task-1'], { delayMs: 5 })
					: happyScript(call)
		});
		h.publisher.publishCommittedSemantic.mockImplementation(
			() => new Promise(() => undefined) as never
		);
		const outcome = await h.run();
		// A stuck live delivery is bounded; terminal truth still commits.
		expect(outcome).toMatchObject({ kind: 'handled', result: { outcome: 'completed' } });
		expect(h.finalize).toHaveBeenCalledOnce();
	});
});

describe('createAgenticChatWorkflowTurnPreparerV1 wiring', () => {
	const base = () => ({
		client: { rpc: vi.fn(), from: vi.fn() } as never,
		input: { loadRawWorkflowInput: vi.fn() } as never,
		publisher: {} as never,
		control: { finalize: vi.fn(), recoverWorkflow: vi.fn() } as never,
		allowedUserIds: [USER_ID],
		providerCapacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 2 })
	});

	it('installs nothing while preparation is off', () => {
		expect(
			createAgenticChatWorkflowTurnPreparerV1({ ...base(), options: undefined })
		).toBeUndefined();
		expect(
			createAgenticChatWorkflowTurnPreparerV1({
				...base(),
				options: { preparationEnabled: false, executionEnabled: true }
			})
		).toBeUndefined();
	});

	it('prepares without a runner when execution is off, and requires a priced client when on', () => {
		expect(
			createAgenticChatWorkflowTurnPreparerV1({
				...base(),
				options: { preparationEnabled: true, executionEnabled: false }
			})
		).toBeDefined();
		expect(() =>
			createAgenticChatWorkflowTurnPreparerV1({
				...base(),
				options: { preparationEnabled: true, executionEnabled: true }
			})
		).toThrow(/priced workflow client/);
		expect(
			createAgenticChatWorkflowTurnPreparerV1({
				...base(),
				options: {
					preparationEnabled: true,
					executionEnabled: true,
					runnerClient: scriptedWorkflowProvider(happyScript).client
				}
			})
		).toBeDefined();
	});
});
