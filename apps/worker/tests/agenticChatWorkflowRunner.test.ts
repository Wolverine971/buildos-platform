// apps/worker/tests/agenticChatWorkflowRunner.test.ts
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { JsonObject } from '@buildos/shared-types';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';
import {
	AgenticChatWorkflowRunner,
	type AgenticChatWorkflowRunnerOptionsV1
} from '../src/workers/agentic-chat/workflow/workflow-runner';
import { AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE } from '../src/workers/agentic-chat/workflow/workflow-projection';
import { WorkflowStoreFake, fakeWorkflowModelInput } from './helpers/workflowStoreFake';
import {
	EDITOR_TEXT,
	type ScriptedCall,
	type ScriptedReply,
	editorReply,
	happyScript,
	plannerReply,
	reportReply,
	scriptedWorkflowProvider,
	workflowRoute
} from './helpers/workflowProviderScript';

/**
 * Tasker 87 slices A and B. Every scenario drives the real runner through the real
 * OpenRouter client and its physical dispatch hook; only the network and the
 * database (an in-memory model of the frozen RPCs) are fakes. Assertions check
 * durable outcomes, not call order.
 */

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';

function seededStore(): WorkflowStoreFake {
	const store = new WorkflowStoreFake({ nowMs: Date.now() });
	store.seedAcceptedContext();
	return store;
}

function harness(
	options: {
		store?: WorkflowStoreFake;
		script?: (call: ScriptedCall) => ScriptedReply;
		routes?: ReturnType<typeof workflowRoute>[];
		concurrency?: number;
		invocationMs?: number;
		delivery?: { durableEvent(event: JsonObject): unknown };
		runner?: AgenticChatWorkflowRunnerOptionsV1;
		/** Tasker 86 handoff: false when preparation already wrote this generation. */
		resumeRequired?: boolean;
	} = {}
) {
	const store = options.store ?? seededStore();
	const provider = scriptedWorkflowProvider(options.script ?? happyScript, {
		routes: options.routes
	});
	const capacity = new AgenticChatProviderCapacity({
		configured: true,
		concurrency: options.concurrency ?? 2
	});
	const delivered: JsonObject[] = [];
	const runner = new AgenticChatWorkflowRunner(
		{ store, client: provider.client, capacity },
		{
			capacityPollMs: 5,
			settlementDrainMs: 2_000,
			meter: { settleRetryDelayMs: 1 },
			...options.runner
		}
	);
	const controller = new AbortController();
	const run = (fence = store.fence, signal: AbortSignal = controller.signal) =>
		runner.run({
			fence,
			userId: USER_ID,
			sessionId: SESSION_ID,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			projectId: 'project-1',
			modelInput: fakeWorkflowModelInput(store),
			resumeRequired: options.resumeRequired ?? true,
			invocationDeadlineAtMs: Date.now() + (options.invocationMs ?? 300_000),
			signal,
			delivery: options.delivery ?? { durableEvent: (event) => void delivered.push(event) }
		});
	return { store, provider, capacity, runner, run, delivered, controller };
}

function dispatchRows(store: WorkflowStoreFake, stepKey?: string) {
	return [...store.dispatches.values()]
		.filter((dispatch) => !stepKey || dispatch.stepKey === stepKey)
		.map((dispatch) => ({
			stepKey: dispatch.stepKey,
			physicalAttempt: dispatch.physicalAttempt,
			kind: dispatch.kind,
			state: dispatch.state,
			actualMicroUsd: dispatch.actualMicroUsd
		}));
}

async function until(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) throw new Error('condition was not reached');
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
}

const slowSpecialists =
	(delayMs: number, extra: (call: ScriptedCall) => ScriptedReply | null = () => null) =>
	(call: ScriptedCall): ScriptedReply =>
		extra(call) ??
		(call.role === 'project_analyst' || call.role === 'risk_reviewer'
			? reportReply(call.role, ['task-1'], { delayMs })
			: happyScript(call));

describe('AgenticChatWorkflowRunner — slice A: persistent runner', () => {
	it('preserves deployed v1 specialist prompts and dispatch limits after definition extraction', async () => {
		const h = harness();
		await h.run();
		// Captured from 8951b7dc9 before extraction, using happyScript's planner assignments.
		const promptHashes = {
			project_analyst: 'fa67974f5d5403834d33c06a276e9c45243273642d91aa732e2c32bf8d177201',
			risk_reviewer: 'ebcb483d828c57cc86bdb5b85867915d91e48261da8ed4c32c7ee3ce3244cc1b'
		};
		for (const role of ['project_analyst', 'risk_reviewer'] as const) {
			const calls = h.provider.callsFor(role);
			expect(calls).toHaveLength(1);
			expect(
				createHash('sha256').update(calls[0]!.body.messages[0].content).digest('hex')
			).toBe(promptHashes[role]);
			expect(calls[0]!.body).toMatchObject({ max_tokens: 4_000, tool_choice: 'none' });
			expect(calls[0]!.body.tools ?? []).toEqual([]);
		}
		expect(h.store.run.answer.status).toBe('accepted');
	});

	it('runs planner, both specialists, and the editor, committing each result with its progress event', async () => {
		const h = harness();
		const result = await h.run();

		expect(result.outcome).toEqual({
			kind: 'completed',
			quality: 'complete',
			answerText: EDITOR_TEXT,
			answerSource: 'editor',
			synthesisAccepted: true,
			coverageGap: null
		});
		expect(result.settlementsDrained).toBe(true);
		const steps = h.store.run.steps;
		for (const key of ['planner', 'project_analyst', 'risk_reviewer', 'editor'] as const) {
			expect(steps[key]).toMatchObject({ status: 'accepted', attemptsUsed: 1 });
		}
		expect(h.store.run.answer).toMatchObject({
			status: 'accepted',
			quality: 'complete',
			text: EDITOR_TEXT
		});
		// The accepted report cites the accepted evidence version, not just an id.
		expect((steps.project_analyst!.result!.findings as any[])[0].evidence).toEqual([
			{ kind: 'project_record', id: 'task-1', version: 'v7', label: 'task: Book the venue' }
		]);
		// One durable progress event per checkpoint, generation-scoped from sequence 1.
		const progress = h.store.progressEvents(1);
		expect(progress.map((event) => event.phase)).toEqual([
			'assessing',
			'assessing',
			'executing',
			'executing',
			'executing',
			'synthesizing'
		]);
		expect(progress[0]!.sequence).toBe(1);
		const sequences = h.store.events.map((event) => event.sequence);
		expect(sequences).toEqual(sequences.map((_, index) => index + 1));
		// Every physical request reserved, dispatched once, and settled at provider cost.
		expect(dispatchRows(h.store)).toEqual([
			{
				stepKey: 'planner',
				physicalAttempt: 1,
				kind: 'planner',
				state: 'settled',
				actualMicroUsd: 1_100
			},
			expect.objectContaining({
				kind: 'specialist',
				state: 'settled',
				actualMicroUsd: 1_100
			}),
			expect.objectContaining({
				kind: 'specialist',
				state: 'settled',
				actualMicroUsd: 1_100
			}),
			{
				stepKey: 'editor',
				physicalAttempt: 1,
				kind: 'editor',
				state: 'settled',
				actualMicroUsd: 1_100
			}
		]);
		expect(h.store.exposureMicroUsd()).toBe(4_400);
		// Every request carried the admitted OpenRouter maximum price.
		for (const call of h.provider.calls) {
			expect(call.body.provider.max_price).toEqual({
				prompt: 0.3,
				completion: 1.2,
				request: 0
			});
		}
		expect(h.delivered.length).toBeGreaterThanOrEqual(6);
	});

	it('runs at most two specialists at once, and fewer when shared capacity is smaller', async () => {
		const wide = harness({ script: slowSpecialists(40), concurrency: 2 });
		await wide.run();
		expect(wide.provider.maxInFlight).toBe(2);

		const narrow = harness({ script: slowSpecialists(40), concurrency: 1 });
		const result = await narrow.run();
		expect(narrow.provider.maxInFlight).toBe(1);
		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'complete' });
	});

	it('replays a lost claim response with the same attempt instead of consuming another', async () => {
		const h = harness();
		h.store.inject(
			'claimStep',
			'lose_response',
			(args) => args.input.stepKey === 'project_analyst'
		);
		const result = await h.run();

		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'complete' });
		expect(h.store.run.steps.project_analyst).toMatchObject({
			status: 'accepted',
			attemptsUsed: 1
		});
		expect(h.provider.callsFor('project_analyst')).toHaveLength(1);
	});

	it('reuses a result whose commit response was lost instead of producing it again', async () => {
		const h = harness();
		h.store.inject(
			'acceptStepResult',
			'lose_response',
			(args) => args.input.stepKey === 'project_analyst'
		);
		const result = await h.run();

		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'complete' });
		expect(h.provider.callsFor('project_analyst')).toHaveLength(1);
		expect(h.store.run.steps.project_analyst).toMatchObject({
			status: 'accepted',
			attemptsUsed: 1
		});
		const analystAccepts = h.store.calls.filter(
			(call) =>
				call.op === 'acceptStepResult' &&
				(call.args as any).input.stepKey === 'project_analyst'
		);
		expect(analystAccepts).toHaveLength(1);
	});

	it('commits concurrent completions one at a time, so progress never regresses', async () => {
		const h = harness({ script: slowSpecialists(15) });
		await h.run();

		const seen = new Set<string>();
		for (const event of h.store.progressEvents(1)) {
			const steps = (event.projection!.steps as Array<{ key: string; status: string }>) ?? [];
			for (const key of seen)
				expect(steps.find((step) => step.key === key)!.status).toBe('accepted');
			for (const step of steps) if (step.status === 'accepted') seen.add(step.key);
		}
		const accepted = h.store.calls
			.filter((call) => call.op === 'acceptStepResult')
			.map((call) => (call.args as any).input.stepKey)
			.sort();
		expect(accepted).toEqual(['planner', 'project_analyst', 'risk_reviewer']);
	});

	it('writes nothing and dispatches nothing when its generation is already stale', async () => {
		const h = harness();
		const staleFence = h.store.fence;
		h.store.generation = 2;
		const result = await h.run(staleFence);

		expect(result.outcome).toEqual({ kind: 'fenced', reason: 'stale_generation' });
		expect(h.provider.calls).toHaveLength(0);
		expect(h.store.events).toHaveLength(0);
		expect(h.store.dispatches.size).toBe(0);
	});

	it('lets a replaced worker’s request settle but never accepts its late result', async () => {
		const h = harness({ script: slowSpecialists(30) });
		let replaced = false;
		h.store.before = (op, args) => {
			if (op === 'acceptStepResult' && args.input.stepKey !== 'planner' && !replaced) {
				replaced = true;
				// Workflow recovery requeued the turn and a new worker claimed generation 2.
				h.store.turnStatus = 'queued';
				h.store.jobStatus = 'pending';
				h.store.claimNewGeneration();
			}
		};
		const result = await h.run();

		expect(result.outcome).toEqual({ kind: 'fenced', reason: 'stale_generation' });
		expect(h.store.run.steps.project_analyst!.status).not.toBe('accepted');
		expect(h.store.run.steps.risk_reviewer!.status).not.toBe('accepted');
		expect(h.provider.callsFor('editor')).toHaveLength(0);
		// Settlement is token-authorized: incurred cost is still recorded after the fence.
		for (const row of dispatchRows(h.store))
			expect(['settled', 'uncertain']).toContain(row.state);
	});

	it('stops on durable cancellation: no new acceptance or dispatch, active work aborted, cost kept', async () => {
		const h = harness({
			script: (call) =>
				call.role === 'project_analyst'
					? reportReply(call.role, ['task-1'], { stallAfterText: true })
					: call.role === 'risk_reviewer'
						? reportReply(call.role, ['task-1'], { delayMs: 20 })
						: happyScript(call)
		});
		h.store.before = (op, args) => {
			if (op === 'acceptStepResult' && args.input.stepKey === 'risk_reviewer')
				h.store.cancelRequested = true;
		};
		const result = await h.run();

		expect(result.outcome).toEqual({ kind: 'cancelled' });
		expect(h.store.run.steps.risk_reviewer!.status).not.toBe('accepted');
		expect(h.provider.callsFor('editor')).toHaveLength(0);
		// The aborted request may have crossed the provider boundary: held, not released.
		expect(dispatchRows(h.store, 'project_analyst')).toEqual([
			expect.objectContaining({ state: 'uncertain', actualMicroUsd: null })
		]);
		expect(dispatchRows(h.store, 'risk_reviewer')).toEqual([
			expect.objectContaining({ state: 'settled', actualMicroUsd: 1_100 })
		]);
		const settlements = result.ledger.filter((entry) =>
			['settled', 'uncertain', 'released'].includes(entry.event)
		);
		expect(new Set(settlements.map((entry) => entry.dispatchId)).size).toBe(settlements.length);
	});

	it('writes a labeled partial synthesis when one specialist fails', async () => {
		const h = harness({
			script: (call) =>
				call.role === 'risk_reviewer'
					? { kind: 'http_error', status: 500 }
					: happyScript(call)
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'editor',
			coverageGap:
				'The risk and alternatives reviewer did not finish, so this review is partial.'
		});
		expect(
			(result.outcome as any).answerText.startsWith(
				'Partial review: one specialist could not finish.'
			)
		).toBe(true);
		expect(h.store.run.steps.risk_reviewer).toMatchObject({
			status: 'failed',
			failureCode: 'workflow_specialist_unavailable'
		});
		// Transport errors never retry (Tasker 83); a provider error response costs zero.
		expect(h.provider.callsFor('risk_reviewer')).toHaveLength(1);
		expect(dispatchRows(h.store, 'risk_reviewer')).toEqual([
			expect.objectContaining({ state: 'settled', actualMicroUsd: 0 })
		]);
	});

	it('fails truthfully and never runs the editor when neither specialist succeeds', async () => {
		const h = harness({
			script: (call) =>
				call.role === 'project_analyst' || call.role === 'risk_reviewer'
					? { kind: 'http_error', status: 502 }
					: happyScript(call)
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'failed',
			failureCode: 'workflow_specialists_failed'
		});
		expect(h.store.run.steps.editor).toMatchObject({
			status: 'skipped',
			failureCode: 'dependency_failed'
		});
		expect(h.provider.callsFor('editor')).toHaveLength(0);
	});

	it('never accepts reports without supplied evidence; one compact corrective retry, then failure', async () => {
		const h = harness({
			script: (call) =>
				call.role === 'project_analyst' || call.role === 'risk_reviewer'
					? reportReply(call.role, ['task-999'])
					: happyScript(call)
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'failed',
			failureCode: 'workflow_specialists_failed'
		});
		for (const role of ['project_analyst', 'risk_reviewer'] as const) {
			expect(h.store.run.steps[role]).toMatchObject({
				status: 'failed',
				attemptsUsed: 2,
				failureCode: 'workflow_report_invalid'
			});
			expect(dispatchRows(h.store, role).map((row) => row.kind)).toEqual([
				'specialist',
				'corrective'
			]);
			const retry = h.provider.callsFor(role)[1]!;
			expect(retry.body.messages[0].content).toContain(
				'Your previous report was not accepted: no finding cited a supplied project record.'
			);
		}
	});

	it('reuses accepted work after a restart and never calls a completed specialist again', async () => {
		const store = seededStore();
		const first = harness({
			store,
			script: (call) =>
				call.role === 'risk_reviewer'
					? reportReply(call.role, ['task-1'], { stallAfterText: true })
					: happyScript(call)
		});
		// The process dies mid-request: its settlement never reaches the database.
		store.inject(
			'settleDispatch',
			'fail_before',
			(args) => {
				const dispatch = store.dispatches.get(args.input.dispatchId);
				return dispatch?.stepKey === 'risk_reviewer' && dispatch.reservedGeneration === 1;
			},
			10
		);
		const gen1 = store.fence;
		const running = first.run(gen1);
		await until(
			() =>
				store.run.steps.project_analyst?.status === 'accepted' &&
				[...store.dispatches.values()].some(
					(dispatch) =>
						dispatch.stepKey === 'risk_reviewer' && dispatch.state === 'dispatching'
				)
		);
		first.controller.abort(new Error('worker process killed'));
		expect((await running).outcome).toMatchObject({ kind: 'aborted' });

		// Stalled-worker detection runs the workflow's atomic recovery.
		const recovery = await store.recoverTurn(gen1, {
			failureClass: 'timeout_post_start',
			errorMessage: null
		});
		expect(recovery).toMatchObject({ outcome: 'retry_scheduled', uncertainCostHeld: true });
		const uncertainReviewer = [...store.dispatches.values()].find(
			(dispatch) => dispatch.stepKey === 'risk_reviewer'
		)!;
		expect(uncertainReviewer.state).toBe('uncertain');

		const gen2 = store.claimNewGeneration();
		const second = harness({ store });
		const result = await second.run(gen2);

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'complete',
			answerSource: 'editor'
		});
		expect(first.provider.callsFor('project_analyst')).toHaveLength(1);
		expect(second.provider.callsFor('project_analyst')).toHaveLength(0);
		expect(second.provider.callsFor('planner')).toHaveLength(0);
		expect(store.run.steps.risk_reviewer).toMatchObject({
			status: 'accepted',
			attemptsUsed: 2
		});
		// Unknown cost from the dead worker stays held and counts toward the cap.
		expect(uncertainReviewer.state).toBe('uncertain');
		// Planner, analyst, the generation-2 reviewer and the editor settled; the dead request is held.
		expect(store.exposureMicroUsd()).toBe(4 * 1_100 + uncertainReviewer.reservedMicroUsd);
		// Generation-scoped stream: generation 2 starts at sequence 1 with the resume event.
		expect(store.progressEvents(2)[0]).toMatchObject({ sequence: 1, phase: 'executing' });
		expect(store.run.recoveryCount).toBe(1);
	});

	it('finishes an earlier generation’s durable answer prefix as partial and never regenerates it', async () => {
		const store = seededStore();
		store.run.answer = {
			...store.run.answer,
			answerId: '71000000-0000-4000-8000-000000000001',
			editorStepAttemptId: '72000000-0000-4000-8000-000000000001',
			text: 'Book the venue first',
			status: 'streaming'
		};
		const h = harness({ store });
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'durable_prefix',
			synthesisAccepted: false,
			answerText: `Book the venue first${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`
		});
		expect(h.provider.calls).toHaveLength(0);
	});

	it('keeps visible editor text, labels it partial, and never replays a truncated synthesis', async () => {
		const h = harness({
			script: (call) =>
				call.role === 'editor'
					? editorReply({ finishReason: 'length', completionTokens: 3_200 })
					: happyScript(call)
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'editor',
			answerText: `${EDITOR_TEXT}${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`
		});
		expect(h.store.run.answer).toMatchObject({ status: 'accepted', quality: 'partial' });
		expect(h.provider.callsFor('editor')).toHaveLength(1);
	});
});

describe('AgenticChatWorkflowRunner — slice B: physical dispatch accounting', () => {
	it('serializes concurrent reservations at the synthesis headroom and records the actual overrun', async () => {
		const h = harness({
			script: slowSpecialists(30, (call) =>
				call.role === 'planner' ? { ...plannerReply(), costUsd: 0.19 } : null
			)
		});
		const result = await h.run();

		const specialists = [h.store.run.steps.project_analyst!, h.store.run.steps.risk_reviewer!];
		const refused = specialists.filter((step) => step.status === 'failed');
		expect(refused).toHaveLength(1);
		expect(refused[0]!.failureCode).toBe('dispatch_synthesis_headroom_required');
		expect(specialists.filter((step) => step.status === 'accepted')).toHaveLength(1);
		// The headroom admitted the editor, so a labeled partial review was still written.
		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'editor'
		});
		const planner = [...h.store.dispatches.values()].find(
			(dispatch) => dispatch.stepKey === 'planner'
		)!;
		expect(planner.actualMicroUsd).toBe(190_000);
		expect(planner.actualMicroUsd!).toBeGreaterThan(planner.reservedMicroUsd);
		expect(h.store.exposureMicroUsd()).toBeLessThanOrEqual(h.store.limits.maxSpendMicroUsd);
	});

	it('meters a route fallback as its own physical dispatch; a refused request settles at zero', async () => {
		const h = harness({
			routes: [workflowRoute('primary'), workflowRoute('secondary')],
			script: (call) =>
				call.role === 'project_analyst' && call.routeId === 'primary'
					? { kind: 'http_error', status: 503 }
					: happyScript(call)
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'complete' });
		expect(dispatchRows(h.store, 'project_analyst')).toEqual([
			{
				stepKey: 'project_analyst',
				physicalAttempt: 1,
				kind: 'specialist',
				state: 'settled',
				actualMicroUsd: 0
			},
			{
				stepKey: 'project_analyst',
				physicalAttempt: 2,
				kind: 'provider_fallback',
				state: 'settled',
				actualMicroUsd: 1_100
			}
		]);
		for (const dispatch of h.store.dispatches.values())
			expect(dispatch.reservedMicroUsd).toBeGreaterThan(0);
	});

	it('holds a timed-out request as uncertain while its fallback is reserved separately', async () => {
		const h = harness({
			routes: [workflowRoute('primary'), workflowRoute('secondary')],
			script: (call) =>
				call.role === 'risk_reviewer' && call.routeId === 'primary'
					? { kind: 'no_response' }
					: happyScript(call)
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({ kind: 'completed' });
		expect(dispatchRows(h.store, 'risk_reviewer')).toEqual([
			expect.objectContaining({
				physicalAttempt: 1,
				state: 'uncertain',
				actualMicroUsd: null
			}),
			expect.objectContaining({
				physicalAttempt: 2,
				kind: 'provider_fallback',
				state: 'settled'
			})
		]);
	}, 15_000);

	it('replays a lost settlement response by token and never charges twice', async () => {
		const h = harness();
		h.store.inject('settleDispatch', 'lose_response');
		const result = await h.run();

		expect(result.outcome).toMatchObject({ kind: 'completed' });
		expect(h.store.calls.filter((call) => call.op === 'settleDispatch')).toHaveLength(5);
		expect(
			dispatchRows(h.store).every(
				(row) => row.state === 'settled' && row.actualMicroUsd === 1_100
			)
		).toBe(true);
		expect(h.store.exposureMicroUsd()).toBe(4_400);
	});

	it('never grants a second permit after a lost dispatch-start response', async () => {
		const h = harness();
		h.store.inject(
			'beginDispatch',
			'lose_response',
			(args) => h.store.dispatches.get(args.input.dispatchId)?.stepKey === 'project_analyst'
		);
		const result = await h.run();

		expect(h.provider.callsFor('project_analyst')).toHaveLength(0);
		expect(dispatchRows(h.store, 'project_analyst')).toEqual([
			expect.objectContaining({ state: 'uncertain', actualMicroUsd: null })
		]);
		expect(h.store.run.steps.project_analyst).toMatchObject({
			status: 'failed',
			failureCode: 'dispatch_permit_lost'
		});
		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'partial' });
	});

	it('writes a model-free partial answer through the durable cursor when no synthesis dispatch fits', async () => {
		const store = seededStore();
		store.limits.maxPhysicalDispatches = 3;
		const h = harness({ store });
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'model_free_fallback',
			synthesisAccepted: true
		});
		const text = (result.outcome as any).answerText as string;
		expect(text.startsWith('Partial review: this review used all of its model requests')).toBe(
			true
		);
		expect(text).toContain('The venue is the next blocker.');
		expect(text).toContain('Catering is the main risk.');
		expect(h.provider.callsFor('editor')).toHaveLength(0);
		expect(store.run.answer).toMatchObject({ status: 'accepted', quality: 'partial', text });
	});

	it('returns an unrecorded model-free answer when overruns exhaust the cap before synthesis', async () => {
		const h = harness({
			script: slowSpecialists(10, (call) =>
				call.role === 'project_analyst' || call.role === 'risk_reviewer'
					? reportReply(call.role, ['task-1'], { costUsd: 0.13, delayMs: 10 })
					: null
			)
		});
		const result = await h.run();

		expect(h.store.exposureMicroUsd()).toBeGreaterThanOrEqual(h.store.limits.maxSpendMicroUsd);
		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'unrecorded_model_free_fallback',
			synthesisAccepted: false
		});
		expect(h.provider.callsFor('editor')).toHaveLength(0);
	});

	it('marks a specialist whose attempts ran out in earlier generations failed without calling it', async () => {
		const store = seededStore();
		const first = harness({ store, script: slowSpecialists(1_000) });
		const gen1 = store.fence;
		const running = first.run(gen1);
		await until(() => store.run.steps.risk_reviewer?.status === 'claimed');
		first.controller.abort(new Error('worker process killed'));
		await running;
		await store.recoverTurn(gen1, { failureClass: 'timeout_post_start', errorMessage: null });
		// A second crash already consumed the reviewer's remaining attempt.
		const reviewer = store.run.steps.risk_reviewer!;
		reviewer.attemptsUsed = 2;
		reviewer.attemptIds = [...reviewer.attemptIds, '73000000-0000-4000-8000-000000000001'];
		const gen2 = store.claimNewGeneration();
		const second = harness({ store });
		const result = await second.run(gen2);

		expect(second.provider.callsFor('risk_reviewer')).toHaveLength(0);
		expect(store.run.steps.risk_reviewer).toMatchObject({
			status: 'failed',
			failureCode: 'attempts_exhausted'
		});
		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'partial' });
	});

	it('ends at the persisted whole-run deadline with accepted findings and no new request', async () => {
		const h = harness();
		h.store.before = (op, args) => {
			if (op === 'claimStep' && args.input.stepKey === 'editor')
				h.store.run.deadlineAtMs = h.store.nowMs - 1;
		};
		const result = await h.run();

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'unrecorded_model_free_fallback'
		});
		expect(h.provider.callsFor('editor')).toHaveLength(0);
		// Requeue cannot restart the clock: recovery refuses an expired run.
		await expect(
			h.store.recoverTurn(h.store.fence, {
				failureClass: 'timeout_post_start',
				errorMessage: null
			})
		).resolves.toMatchObject({ outcome: 'deadline_expired' });
	});

	it('requeues without spending an attempt when only this invocation is out of time', async () => {
		const h = harness({ invocationMs: 3_000 });
		const result = await h.run();

		expect(result.outcome).toEqual({
			kind: 'requeue',
			failureClass: 'timeout_post_start',
			reason: 'invocation_budget_exhausted'
		});
		expect(h.store.run.steps.planner).toMatchObject({ status: 'pending', attemptsUsed: 0 });
		expect(h.store.dispatches.size).toBe(0);
	});

	it('treats saturated shared capacity as a bounded wait and requeue, not a provider failure', async () => {
		const h = harness({ concurrency: 1, runner: { capacityWaitMs: 30 } });
		const foreign = h.capacity.acquire('another-turn');
		try {
			const result = await h.run();
			expect(result.outcome).toEqual({
				kind: 'requeue',
				failureClass: 'provider_throttle',
				reason: 'capacity_wait_exhausted'
			});
			expect(h.store.run.steps.planner).toMatchObject({ status: 'pending', attemptsUsed: 0 });
			expect(h.provider.calls).toHaveLength(0);
		} finally {
			foreign.release();
		}
	});

	it('keeps accepted work moving when live delivery never acknowledges', async () => {
		const stuck: JsonObject[] = [];
		const h = harness({
			delivery: {
				durableEvent: (event) => {
					stuck.push(event);
					return new Promise(() => undefined);
				}
			}
		});
		const result = await h.run();

		expect(result.outcome).toMatchObject({ kind: 'completed', quality: 'complete' });
		expect(stuck.length).toBeGreaterThanOrEqual(6);
	});
});
