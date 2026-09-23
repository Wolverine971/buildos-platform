// apps/worker/tests/agenticChatWorkflowCrashCuts.postgres.test.ts
//
// Tasker 87 slice C: synthesis crash cuts on the frozen SQL, in a disposable,
// socket-only local PostgreSQL. Each cut kills a worker at an exact point in the real
// Tasker 86 -> 87 path (admission, claim, preparation, runner, publisher, terminal
// writer), recovers it through the real stalled-recovery sweep, and asserts the safe
// outcome: continue or reconcile accepted text, or terminalize a partial. Never append
// regenerated prose to text that was already visible; one final assistant message; cost
// settled once with uncertain exposure retained. No hosted database, no QA worker, and
// no paid call exists anywhere in this file.
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/turn/cancellation-observer';
import { SupabaseAgenticChatExecutionControlAdapter } from '../src/workers/agentic-chat/turn/execution-control';
import { SupabaseAgenticChatRecoverySnapshotAdapter } from '../src/workers/agentic-chat/host/recovery-snapshot';
import {
	type AgenticChatStalledRecoveryReportV1,
	AgenticChatStalledRecoverySweep,
	SupabaseAgenticChatStalledCandidateSource
} from '../src/workers/agentic-chat/host/stalled-recovery';
import { AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE } from '../src/workers/agentic-chat/workflow/workflow-projection';
import { SupabaseAgenticChatWorkflowStore } from '../src/workers/agentic-chat/workflow/workflow-store';
import { stableAgenticChatWorkflowAnswerMessageIdV1 } from '../src/workers/agentic-chat/workflow/workflow-terminal';
import { deferred } from './helpers/deferred';
import {
	E2E_USER_ID,
	admitE2ETurn,
	buildE2EWorker,
	e2eDomainRowCounts,
	e2eFacts,
	leaseAndClaimE2E,
	seedE2EOwner
} from './helpers/workflowEndToEnd';
import {
	type DisposablePostgres,
	createPgSupabaseShim,
	postgresAvailable,
	serviceClient,
	startDisposableWorkflowPostgres
} from './helpers/workflowPostgres';
import {
	EDITOR_TEXT,
	type ScriptedCall,
	type ScriptedReply,
	happyScript,
	scriptedWorkflowProvider
} from './helpers/workflowProviderScript';

const describePostgres = postgresAvailable ? describe : describe.skip;

type Shim = ReturnType<typeof createPgSupabaseShim>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type Hook = (
	name: string,
	args: Record<string, unknown>,
	run: () => Promise<RpcResult>
) => Promise<RpcResult>;

const LOST: RpcResult = {
	data: null,
	error: { code: '08006', message: 'worker process killed' }
};

/**
 * One worker process's database connection. After `kill()` nothing it sends reaches
 * the database and nothing it reads comes back, exactly as for a dead process.
 */
function workerConnection(shim: Shim) {
	let dead = false;
	let hook: Hook | null = null;
	const deadRead = () => {
		const chain: Record<string, unknown> = {};
		for (const method of ['eq', 'lt', 'order', 'limit']) chain[method] = () => chain;
		chain.maybeSingle = async () => LOST;
		chain.then = (onResolved: (value: RpcResult) => unknown, onRejected?: never) =>
			Promise.resolve(LOST).then(onResolved, onRejected);
		return chain;
	};
	const connection = {
		rpcCalls: shim.rpcCalls,
		intercept: shim.intercept,
		async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
			if (dead) return LOST;
			const run = async () => (dead ? LOST : shim.rpc(name, args));
			return hook ? hook(name, args, run) : run();
		},
		from(table: string) {
			return {
				select: (columns: string) => (dead ? deadRead() : shim.from(table).select(columns))
			};
		}
	};
	return {
		connection: connection as unknown as Shim,
		hook(next: Hook) {
			hook = next;
		},
		kill() {
			dead = true;
		}
	};
}

describePostgres('workflow synthesis crash cuts on the frozen SQL (Tasker 87 slice C)', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let service: Client;
	let shim: Shim;
	let turnNumber = 0;

	beforeAll(async () => {
		pg = await startDisposableWorkflowPostgres(
			resolve(process.cwd(), '../..'),
			'buildos-workflow-cuts-pg-'
		);
		const { Client: PgClient } = await import('pg');
		admin = new PgClient(pg.connection);
		await admin.connect();
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
		await seedE2EOwner(admin);
	}, 120_000);

	afterAll(async () => {
		await service?.end().catch(() => undefined);
		await admin?.end().catch(() => undefined);
		pg?.stop();
	});

	/** Generation 1 runs until `cut` kills its process; returns once it has stopped. */
	async function killFirstGeneration(input: {
		script: (call: ScriptedCall) => ScriptedReply;
		textFlushBytes?: number;
		cut: (worker: {
			hook: (next: Hook) => void;
			kill: () => void;
			killed: Promise<void>;
		}) => void;
	}) {
		turnNumber += 1;
		const turnRunId = await admitE2ETurn(shim, turnNumber);
		const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
		const process = workerConnection(shim);
		const provider = scriptedWorkflowProvider(input.script);
		const worker = buildE2EWorker({
			shim: process.connection,
			client: provider.client,
			runner: { textFlushBytes: input.textFlushBytes ?? 512 }
		});
		const controller = new AbortController();
		const killed = deferred<void>();
		input.cut({
			hook: process.hook,
			kill: () => {
				process.kill();
				controller.abort(new Error('worker process killed'));
				killed.resolve();
			},
			killed: killed.promise
		});
		const result = await worker.execute(lease, controller.signal);
		await killed.promise;
		await worker.stop();
		return { turnRunId, lease, provider, result };
	}

	/** The real sweep, limited to one turn, run as if the stall threshold has passed. */
	async function sweep(turnRunId: string): Promise<AgenticChatStalledRecoveryReportV1> {
		const candidates = new SupabaseAgenticChatStalledCandidateSource(shim as never);
		const control = new SupabaseAgenticChatExecutionControlAdapter(shim as never);
		const recovery = new AgenticChatStalledRecoverySweep(
			{
				candidates: {
					list: async (input) =>
						(await candidates.list(input)).filter(
							(candidate) => candidate.turnRunId === turnRunId
						)
				},
				control,
				snapshots: new SupabaseAgenticChatRecoverySnapshotAdapter(shim as never),
				workflowRuns: new SupabaseAgenticChatWorkflowStore(shim as never)
			},
			{ now: () => new Date(Date.now() + 10 * 60_000), stallTimeoutMs: 420_000 }
		);
		return recovery.runOnce();
	}

	async function secondGeneration(turnRunId: string) {
		const provider = scriptedWorkflowProvider(happyScript);
		const worker = buildE2EWorker({ shim, client: provider.client });
		const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
		expect(lease.claim.executionGeneration).toBe(2);
		const result = await worker.execute(lease);
		await worker.stop();
		return { provider, result };
	}

	async function exhaustQueueAttempts(turnRunId: string) {
		await admin.query(
			`UPDATE public.queue_jobs jobs SET attempts = jobs.max_attempts - 1
			FROM public.chat_turn_runs turns WHERE turns.id = $1 AND jobs.id = turns.queue_job_id`,
			[turnRunId]
		);
	}

	async function exposure(turnRunId: string): Promise<number> {
		const { rows } = await admin.query(
			'SELECT public.agentic_chat_workflow_exposure_micro_usd_v1($1)::bigint AS value',
			[turnRunId]
		);
		return Number(rows[0]!.value);
	}

	/** Invariants every cut shares: one answer, one terminal event, no domain writes. */
	async function expectOneTerminalAnswer(turnRunId: string) {
		const facts = await e2eFacts(admin, turnRunId);
		expect(facts.messages).toHaveLength(1);
		expect(facts.events.filter((event) => event.event_type === 'done')).toHaveLength(1);
		expect(facts.effects).toBe(0);
		expect(facts.turn.mutation_reserved_at).toBeNull();
		expect(facts.turn.irreversible_boundary_at).toBeNull();
		// Settled once: settled rows carry exactly the provider-reported charge.
		for (const row of facts.dispatches.filter((dispatch) => dispatch.state === 'settled')) {
			expect(row.actual).toBe(1_100);
		}
		const held = facts.dispatches
			.filter((row) => row.state === 'uncertain')
			.reduce((sum, row) => sum + row.reserved, 0);
		const settled = facts.dispatches
			.filter((row) => row.state === 'settled')
			.reduce((sum, row) => sum + (row.actual ?? 0), 0);
		expect(await exposure(turnRunId)).toBe(settled + held);
		return facts;
	}

	/** Blocks the editor before its claim reaches the database, then kills the process. */
	const killBeforeSynthesis = (
		worker: Parameters<Parameters<typeof killFirstGeneration>[0]['cut']>[0]
	) =>
		worker.hook(async (name, args, run) => {
			if (name === 'claim_agentic_chat_workflow_step_v1' && args.p_step_key === 'editor') {
				worker.kill();
			}
			return run();
		});

	/** Lets the first answer batch commit, then kills the process before the second. */
	const killMidStream = (
		worker: Parameters<Parameters<typeof killFirstGeneration>[0]['cut']>[0]
	) => {
		let batches = 0;
		worker.hook(async (name, _args, run) => {
			if (name === 'persist_agentic_chat_workflow_text_batch_v1' && ++batches === 2) {
				worker.kill();
			}
			return run();
		});
	};

	/** Commits the synthesis acceptance, then kills the process before it sees the receipt. */
	const killAfterAcceptance = (
		worker: Parameters<Parameters<typeof killFirstGeneration>[0]['cut']>[0]
	) =>
		worker.hook(async (name, _args, run) => {
			const result = await run();
			if (name === 'accept_agentic_chat_workflow_synthesis_v1') worker.kill();
			return result;
		});

	async function durablePrefix(turnRunId: string): Promise<string> {
		const facts = await e2eFacts(admin, turnRunId);
		return facts.run.answer_text as string;
	}

	describe('(a) kill before synthesis', () => {
		it('requeues and continues: accepted specialists are reused, the editor runs once from offset zero', async () => {
			const domainBefore = await e2eDomainRowCounts(admin);
			const first = await killFirstGeneration({
				script: happyScript,
				cut: killBeforeSynthesis
			});
			expect(first.result.outcome).toBe('recovery_required');
			let facts = await e2eFacts(admin, first.turnRunId);
			expect(facts.steps.map((row) => [row.step_key, row.status])).toEqual([
				['editor', 'pending'],
				['planner', 'accepted'],
				['project_analyst', 'accepted'],
				['risk_reviewer', 'accepted']
			]);
			expect(first.provider.callsFor('editor')).toHaveLength(0);

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'requeued', executionGeneration: 1 }]
			});
			const second = await secondGeneration(first.turnRunId);

			expect(second.result).toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(second.provider.callsFor('planner')).toHaveLength(0);
			expect(second.provider.callsFor('project_analyst')).toHaveLength(0);
			expect(second.provider.callsFor('risk_reviewer')).toHaveLength(0);
			expect(second.provider.callsFor('editor')).toHaveLength(1);
			facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.messages[0]).toEqual({
				id: stableAgenticChatWorkflowAnswerMessageIdV1(first.turnRunId, 2),
				content: EDITOR_TEXT
			});
			expect(facts.run).toMatchObject({
				terminal_outcome: 'complete',
				answer_text: EDITOR_TEXT,
				recovery_count: 1
			});
			expect(facts.dispatches.map((row) => [row.step_key, row.state])).toEqual([
				['planner', 'settled'],
				[expect.any(String), 'settled'],
				[expect.any(String), 'settled'],
				['editor', 'settled']
			]);
			expect(await e2eDomainRowCounts(admin)).toEqual(domainBefore);
		}, 60_000);

		it('when it may not retry, the sweep terminalizes a model-free partial from the accepted reports', async () => {
			const first = await killFirstGeneration({
				script: happyScript,
				cut: killBeforeSynthesis
			});
			await exhaustQueueAttempts(first.turnRunId);

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'terminal_reconciled' }]
			});
			const facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.turn).toMatchObject({ status: 'completed', failure_code: null });
			expect(facts.job.status).toBe('completed');
			expect(facts.run).toMatchObject({ phase: 'finished', terminal_outcome: 'partial' });
			expect(facts.messages[0]!.id).toBe(
				stableAgenticChatWorkflowAnswerMessageIdV1(first.turnRunId, 1)
			);
			const text = facts.messages[0]!.content;
			expect(text).toMatch(
				/^Partial review: the combined answer could not be written after its allowed attempts\./
			);
			expect(text).toContain('## Project analyst\n\nThe venue is the next blocker.');
			expect(text).toContain(
				'## Risk and alternatives reviewer\n\nCatering is the main risk.'
			);
			// No model call happened in the sweep: generation 1 never reached the editor.
			expect(first.provider.callsFor('editor')).toHaveLength(0);
		}, 60_000);
	});

	describe('(b) kill mid-stream with part of the answer durable', () => {
		it('requeues and finishes the visible prefix as partial: no regenerated text is appended', async () => {
			const first = await killFirstGeneration({
				script: happyScript,
				textFlushBytes: 16,
				cut: killMidStream
			});
			const prefix = await durablePrefix(first.turnRunId);
			expect(prefix.length).toBeGreaterThan(0);
			expect(EDITOR_TEXT.startsWith(prefix)).toBe(true);
			expect(prefix).not.toBe(EDITOR_TEXT);

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'requeued' }]
			});
			const second = await secondGeneration(first.turnRunId);

			expect(second.result).toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			// Nothing is regenerated: no provider call at all in generation 2.
			expect(second.provider.calls).toHaveLength(0);
			const facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.messages[0]!.content).toBe(
				`${prefix}${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`
			);
			expect(facts.run).toMatchObject({
				terminal_outcome: 'partial',
				answer_text: prefix,
				synthesis_status: 'streaming'
			});
			// The editor request the dead process never settled stays held as uncertain.
			const editor = facts.dispatches.filter((row) => row.step_key === 'editor');
			expect(editor).toEqual([expect.objectContaining({ state: 'uncertain', actual: null })]);
			expect(editor[0]!.reserved).toBeGreaterThan(0);
		}, 60_000);

		it('when it may not retry, the sweep keeps the durable prefix with the fixed notice', async () => {
			const first = await killFirstGeneration({
				script: happyScript,
				textFlushBytes: 16,
				cut: killMidStream
			});
			const prefix = await durablePrefix(first.turnRunId);
			await exhaustQueueAttempts(first.turnRunId);

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'terminal_reconciled' }]
			});
			const facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.turn.status).toBe('completed');
			expect(facts.messages[0]).toEqual({
				id: stableAgenticChatWorkflowAnswerMessageIdV1(first.turnRunId, 1),
				content: `${prefix}${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`
			});
			expect(facts.run.terminal_outcome).toBe('partial');
			expect(facts.dispatches.find((row) => row.step_key === 'editor')?.state).toBe(
				'uncertain'
			);
		}, 60_000);
	});

	describe('(c) kill after final-text acceptance, before terminal', () => {
		it('requeues and reconciles the accepted text with no provider call', async () => {
			const first = await killFirstGeneration({
				script: happyScript,
				cut: killAfterAcceptance
			});
			let facts = await e2eFacts(admin, first.turnRunId);
			expect(facts.turn.status).toBe('running');
			expect(facts.run).toMatchObject({
				synthesis_status: 'accepted',
				answer_text: EDITOR_TEXT
			});
			expect(facts.messages).toHaveLength(0);

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'requeued' }]
			});
			const second = await secondGeneration(first.turnRunId);

			expect(second.result).toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(second.provider.calls).toHaveLength(0);
			facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.messages[0]).toEqual({
				id: stableAgenticChatWorkflowAnswerMessageIdV1(first.turnRunId, 2),
				content: EDITOR_TEXT
			});
			expect(facts.run.terminal_outcome).toBe('complete');
			expect(facts.dispatches.map((row) => row.state)).toEqual([
				'settled',
				'settled',
				'settled',
				'settled'
			]);
		}, 60_000);

		it('when it may not retry, the sweep writes the accepted answer as-is', async () => {
			const first = await killFirstGeneration({
				script: happyScript,
				cut: killAfterAcceptance
			});
			await exhaustQueueAttempts(first.turnRunId);

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'terminal_reconciled' }]
			});
			const facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.messages[0]).toEqual({
				id: stableAgenticChatWorkflowAnswerMessageIdV1(first.turnRunId, 1),
				content: EDITOR_TEXT
			});
			expect(facts.run.terminal_outcome).toBe('complete');
		}, 60_000);
	});

	describe('(d) Stop with a durable prefix', () => {
		it('keeps exactly the visible prefix, fences the late batch, and holds the aborted request', async () => {
			turnNumber += 1;
			const turnRunId = await admitE2ETurn(shim, turnNumber);
			const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
			const process = workerConnection(shim);
			const provider = scriptedWorkflowProvider(happyScript);
			const worker = buildE2EWorker({
				shim: process.connection,
				client: provider.client,
				runner: { textFlushBytes: 16 }
			});
			const controller = new AbortController();
			const secondBatch = deferred<void>();
			const stopped = deferred<void>();
			let batches = 0;
			process.hook(async (name, _args, run) => {
				if (name === 'persist_agentic_chat_workflow_text_batch_v1' && ++batches === 2) {
					secondBatch.resolve();
					// The late batch reaches the database only after Stop is durable.
					await stopped.promise;
				}
				return run();
			});
			const running = worker.execute(lease, controller.signal);
			await secondBatch.promise;
			const prefix = await durablePrefix(turnRunId);
			expect(prefix.length).toBeGreaterThan(0);

			// The browser's Stop, through the real cancel routine; then the worker's
			// cancellation observer aborts the invocation.
			const cancel = await shim.rpc('request_agentic_chat_turn_cancel', {
				p_turn_run_id: turnRunId,
				p_user_id: E2E_USER_ID,
				p_reason: 'user_cancelled',
				p_source: 'browser'
			});
			expect(cancel.error).toBeNull();
			controller.abort(
				new AgenticChatCancellationError({
					turn_run_id: turnRunId,
					execution_generation: 1,
					signal_id: '70000000-0000-4000-8000-000000000007',
					cancel_reason: 'user_cancelled',
					cancel_source: 'browser',
					cancel_requested_at: new Date().toISOString(),
					consumed_at: new Date().toISOString()
				} as never)
			);
			stopped.resolve();
			const result = await running;
			await worker.stop();

			expect(result).toMatchObject({ outcome: 'cancelled', terminalStatus: 'cancelled' });
			const facts = await expectOneTerminalAnswer(turnRunId);
			expect(facts.turn).toMatchObject({ status: 'cancelled', failure_code: 'cancelled' });
			// Exactly the text that was visible when Stop landed: no notice, no regenerated text.
			expect(facts.run.answer_text).toBe(prefix);
			expect(facts.messages[0]).toEqual({
				id: stableAgenticChatWorkflowAnswerMessageIdV1(turnRunId, 1),
				content: prefix
			});
			expect(facts.run).toMatchObject({ phase: 'finished', terminal_outcome: 'cancelled' });
			expect(facts.dispatches.map((row) => [row.step_key, row.state])).toEqual([
				['planner', 'settled'],
				[expect.any(String), 'settled'],
				[expect.any(String), 'settled'],
				['editor', 'uncertain']
			]);
			expect(provider.callsFor('editor')).toHaveLength(1);
		}, 60_000);

		it('Stop after the worker died: the sweep cancels with the durable prefix and one message', async () => {
			const first = await killFirstGeneration({
				script: happyScript,
				textFlushBytes: 16,
				cut: killMidStream
			});
			const prefix = await durablePrefix(first.turnRunId);
			const cancel = await shim.rpc('request_agentic_chat_turn_cancel', {
				p_turn_run_id: first.turnRunId,
				p_user_id: E2E_USER_ID,
				p_reason: 'user_cancelled',
				p_source: 'browser'
			});
			expect(cancel.error).toBeNull();

			await expect(sweep(first.turnRunId)).resolves.toMatchObject({
				results: [{ outcome: 'terminal_reconciled' }]
			});
			const facts = await expectOneTerminalAnswer(first.turnRunId);
			expect(facts.turn.status).toBe('cancelled');
			expect(facts.messages[0]!.content).toBe(prefix);
			expect(facts.run.terminal_outcome).toBe('cancelled');
			expect(facts.dispatches.find((row) => row.step_key === 'editor')?.state).toBe(
				'uncertain'
			);
		}, 60_000);
	});
});
