// apps/worker/tests/agenticChatWorkflowRestart.postgres.test.ts
//
// Tasker 87: a real worker-process kill and restart. A separate Node process runs the
// real worker path (tests/helpers/workflowWorkerProcess.ts) against a disposable,
// socket-only local PostgreSQL, with the real OpenRouter client forwarded to a loopback
// HTTP stub this test serves. The process is killed with SIGKILL after one specialist
// result is accepted and while the other specialist's request is open at the provider.
// The real stalled-recovery sweep requeues it, a second process finishes it, and the
// accepted specialist is never called again. No hosted database, no QA worker, and no
// paid call exists anywhere in this file.
import { type ChildProcess, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseAgenticChatExecutionControlAdapter } from '../src/workers/agentic-chat/turn/execution-control';
import { SupabaseAgenticChatRecoverySnapshotAdapter } from '../src/workers/agentic-chat/host/recovery-snapshot';
import {
	AgenticChatStalledRecoverySweep,
	SupabaseAgenticChatStalledCandidateSource
} from '../src/workers/agentic-chat/host/stalled-recovery';
import { AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1 } from '../src/workers/agentic-chat/workflow/workflow-dispatch';
import { SupabaseAgenticChatWorkflowStore } from '../src/workers/agentic-chat/workflow/workflow-store';
import { stableAgenticChatWorkflowAnswerMessageIdV1 } from '../src/workers/agentic-chat/workflow/workflow-terminal';
import {
	admitE2ETurn,
	e2eDomainRowCounts,
	e2eFacts,
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
	type WorkflowRole,
	editorReply,
	plannerReply,
	reportReply,
	roleOf
} from './helpers/workflowProviderScript';

const describePostgres = postgresAvailable ? describe : describe.skip;
const WORKER_ROOT = process.cwd();

type StubCall = { role: WorkflowRole; at: string; model: string; models: string[] };

/** Loopback stand-in for OpenRouter's chat completions stream. */
async function startProviderStub() {
	const calls: StubCall[] = [];
	const open = new Set<ServerResponse>();
	let stallReviewer = true;
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(chunk as Buffer);
		const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
		const role = roleOf(String(body.messages?.[0]?.content ?? ''));
		calls.push({
			role,
			at: new Date().toISOString(),
			model: String(body.model),
			models: Array.isArray(body.models) ? body.models : []
		});
		const id = `stub-${calls.length}`;
		response.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': id });
		if (role === 'risk_reviewer' && stallReviewer) {
			// The request crossed the provider boundary; no receipt ever comes back.
			response.flushHeaders();
			open.add(response);
			response.on('close', () => open.delete(response));
			return;
		}
		const reply =
			role === 'planner'
				? plannerReply()
				: role === 'editor'
					? editorReply()
					: reportReply(role);
		if (reply.kind !== 'text') throw new Error('stub replies are text');
		const size = Math.ceil(reply.text.length / 3);
		for (let index = 0; index < reply.text.length; index += size) {
			const content = reply.text.slice(index, index + size);
			response.write(
				`data: ${JSON.stringify({ id, model: body.model, choices: [{ delta: { content } }] })}\n\n`
			);
		}
		const completionTokens = reply.completionTokens ?? 400;
		response.end(
			`data: ${JSON.stringify({
				id,
				model: body.model,
				choices: [{ delta: {}, finish_reason: 'stop' }],
				usage: {
					prompt_tokens: 2_000,
					completion_tokens: completionTokens,
					total_tokens: 2_000 + completionTokens,
					cost: 0.0011
				}
			})}\n\ndata: [DONE]\n\n`
		);
	});
	await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { port } = server.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${port}`,
		calls,
		releaseReviewer() {
			stallReviewer = false;
		},
		close() {
			for (const response of open) response.destroy();
			server.closeAllConnections();
			server.close();
		}
	};
}

type WorkerEvent = { event: string; pid: number; at: string; [key: string]: unknown };

/** One real worker process on the disposable database. */
function spawnWorker(env: Record<string, string>) {
	const events: WorkerEvent[] = [];
	let stderr = '';
	const child: ChildProcess = spawn(
		process.execPath,
		['--import', 'tsx', '--conditions=development', 'tests/helpers/workflowWorkerProcess.ts'],
		{ cwd: WORKER_ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	let buffered = '';
	child.stdout!.on('data', (data: Buffer) => {
		buffered += data.toString('utf8');
		for (let newline = buffered.indexOf('\n'); newline >= 0; newline = buffered.indexOf('\n')) {
			const line = buffered.slice(0, newline);
			buffered = buffered.slice(newline + 1);
			try {
				events.push(JSON.parse(line) as WorkerEvent);
			} catch {
				// Only the harness's JSON report lines matter.
			}
		}
	});
	child.stderr!.on('data', (data: Buffer) => {
		stderr = `${stderr}${data.toString('utf8')}`.slice(-8_000);
	});
	const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolveExit) => child.on('exit', (code, signal) => resolveExit({ code, signal }))
	);
	return {
		child,
		events,
		exited,
		stderr: () => stderr,
		async waitFor(event: string, timeoutMs = 30_000): Promise<WorkerEvent> {
			const started = Date.now();
			for (;;) {
				const found = events.find((entry) => entry.event === event);
				if (found) return found;
				const failed = events.find((entry) => entry.event === 'error');
				if (failed) throw new Error(`worker failed: ${String(failed.error)}\n${stderr}`);
				if (Date.now() - started > timeoutMs) {
					throw new Error(`worker never reported ${event}\n${stderr}`);
				}
				await new Promise((resolveWait) => setTimeout(resolveWait, 20));
			}
		}
	};
}

describePostgres(
	'workflow restart: a real worker process killed after one accepted specialist',
	() => {
		let pg: DisposablePostgres;
		let admin: Client;
		let service: Client;
		let shim: ReturnType<typeof createPgSupabaseShim>;
		let stub: Awaited<ReturnType<typeof startProviderStub>>;

		beforeAll(async () => {
			pg = await startDisposableWorkflowPostgres(
				resolve(WORKER_ROOT, '../..'),
				'buildos-workflow-restart-pg-'
			);
			const { Client: PgClient } = await import('pg');
			admin = new PgClient(pg.connection);
			await admin.connect();
			service = await serviceClient(pg.connection);
			shim = createPgSupabaseShim(service);
			await seedE2EOwner(admin);
			stub = await startProviderStub();
		}, 120_000);

		afterAll(async () => {
			stub?.close();
			await service?.end().catch(() => undefined);
			await admin?.end().catch(() => undefined);
			pg?.stop();
		});

		async function stepRows(turnRunId: string) {
			const { rows } = await admin.query(
				`SELECT step_key, status, attempts_used, attempt_ids, accepted_attempt_id, current_attempt_generation
			FROM public.chat_turn_workflow_steps WHERE turn_run_id = $1 ORDER BY step_key`,
				[turnRunId]
			);
			return Object.fromEntries(rows.map((row) => [row.step_key as string, row]));
		}

		async function runIdentity(turnRunId: string) {
			const { rows } = await admin.query(
				`SELECT request_hash, context_id, context_hash, context_accepted_generation, plan_hash, recovery_count
			FROM public.chat_turn_workflow_runs WHERE turn_run_id = $1`,
				[turnRunId]
			);
			return rows[0] as Record<string, unknown>;
		}

		it('never calls the accepted specialist again after SIGKILL and restart', async () => {
			const domainBefore = await e2eDomainRowCounts(admin);
			const turnRunId = await admitE2ETurn(shim, 1);
			const env = {
				WORKFLOW_PG_CONNECTION: JSON.stringify(pg.connection),
				WORKFLOW_TURN_RUN_ID: turnRunId,
				WORKFLOW_PROVIDER_STUB_ORIGIN: stub.origin
			};

			// Generation 1: a real process, killed once the analyst is accepted and the
			// reviewer's request is open at the provider.
			const first = spawnWorker(env);
			const claimed1 = await first.waitFor('claimed');
			expect(claimed1.executionGeneration).toBe(1);
			const started = Date.now();
			for (;;) {
				const steps = await stepRows(turnRunId);
				const { rows } = await admin.query(
					`SELECT state FROM public.chat_turn_workflow_dispatches
				WHERE turn_run_id = $1 AND step_key = 'risk_reviewer'`,
					[turnRunId]
				);
				if (
					steps.project_analyst?.status === 'accepted' &&
					rows.some((row) => row.state === 'dispatching') &&
					stub.calls.some((call) => call.role === 'risk_reviewer')
				)
					break;
				if (Date.now() - started > 20_000) {
					throw new Error(`generation 1 never reached the cut\n${first.stderr()}`);
				}
				await new Promise((resolveWait) => setTimeout(resolveWait, 20));
			}
			const beforeKill = {
				steps: await stepRows(turnRunId),
				identity: await runIdentity(turnRunId)
			};
			const killedAt = new Date().toISOString();
			first.child.kill('SIGKILL');
			expect(await first.exited).toEqual({ code: null, signal: 'SIGKILL' });
			expect(first.events.some((entry) => entry.event === 'finished')).toBe(false);

			// Detection and requeue: the real stalled-recovery sweep, past the stall threshold.
			const candidates = new SupabaseAgenticChatStalledCandidateSource(shim as never);
			const sweep = new AgenticChatStalledRecoverySweep(
				{
					candidates: {
						list: async (input) =>
							(await candidates.list(input)).filter(
								(candidate) => candidate.turnRunId === turnRunId
							)
					},
					control: new SupabaseAgenticChatExecutionControlAdapter(shim as never),
					snapshots: new SupabaseAgenticChatRecoverySnapshotAdapter(shim as never),
					workflowRuns: new SupabaseAgenticChatWorkflowStore(shim as never)
				},
				{ now: () => new Date(Date.now() + 10 * 60_000), stallTimeoutMs: 420_000 }
			);
			const detectedAt = new Date().toISOString();
			const report = await sweep.runOnce();
			expect(report.results).toEqual([
				expect.objectContaining({
					outcome: 'requeued',
					executionGeneration: 1,
					error: null
				})
			]);
			const requeue = await admin.query(
				`SELECT jobs.status, jobs.attempts, jobs.updated_at, jobs.scheduled_for
			FROM public.queue_jobs jobs JOIN public.chat_turn_runs turns ON turns.queue_job_id = jobs.id
			WHERE turns.id = $1`,
				[turnRunId]
			);
			expect(requeue.rows[0]).toMatchObject({ status: 'pending', attempts: 1 });
			const afterRecovery = await e2eFacts(admin, turnRunId);
			expect(
				afterRecovery.dispatches.find((row) => row.step_key === 'risk_reviewer')?.state
			).toBe('uncertain');

			// Generation 2: a fresh process on the same database; the provider now answers.
			stub.releaseReviewer();
			const callsBeforeRestart = stub.calls.length;
			const second = spawnWorker(env);
			const claimed2 = await second.waitFor('claimed');
			expect(claimed2.executionGeneration).toBe(2);
			const finished = await second.waitFor('finished', 60_000);
			expect(await second.exited).toEqual({ code: 0, signal: null });
			expect(finished.result).toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed',
				executionGeneration: 2
			});

			// The accepted specialist (and planner) were never called again.
			const restartCalls = stub.calls.slice(callsBeforeRestart).map((call) => call.role);
			expect(restartCalls.sort()).toEqual(['editor', 'risk_reviewer']);
			const count = (role: WorkflowRole) =>
				stub.calls.filter((call) => call.role === role).length;
			expect({
				planner: count('planner'),
				project_analyst: count('project_analyst'),
				risk_reviewer: count('risk_reviewer'),
				editor: count('editor')
			}).toEqual({ planner: 1, project_analyst: 1, risk_reviewer: 2, editor: 1 });
			// The production workflow route: only priced models, with the priced fallback.
			expect(stub.calls[0]).toMatchObject({
				model: 'deepseek/deepseek-v4.1-flash',
				models: ['deepseek/deepseek-v4-flash']
			});
			for (const call of stub.calls) {
				for (const model of [call.model, ...call.models]) {
					expect(Object.keys(AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1)).toContain(
						model
					);
				}
			}

			// Original attempt identities and request/context hashes are preserved.
			const afterSteps = await stepRows(turnRunId);
			for (const key of ['planner', 'project_analyst']) {
				expect(afterSteps[key]).toMatchObject({
					status: 'accepted',
					attempts_used: 1,
					accepted_attempt_id: beforeKill.steps[key]!.accepted_attempt_id,
					attempt_ids: beforeKill.steps[key]!.attempt_ids
				});
			}
			expect(afterSteps.risk_reviewer).toMatchObject({
				status: 'accepted',
				attempts_used: 2
			});
			expect(afterSteps.risk_reviewer!.attempt_ids).toEqual([
				...beforeKill.steps.risk_reviewer!.attempt_ids,
				afterSteps.risk_reviewer!.accepted_attempt_id
			]);
			const identity = await runIdentity(turnRunId);
			expect(identity).toEqual({ ...beforeKill.identity, recovery_count: 1 });
			expect(identity.context_accepted_generation).toBe(1);

			// One final answer, uncertain exposure retained, zero domain writes.
			const facts = await e2eFacts(admin, turnRunId);
			expect(facts.turn).toMatchObject({ status: 'completed', execution_generation: 2 });
			expect(facts.job.status).toBe('completed');
			expect(facts.messages).toEqual([
				{
					id: stableAgenticChatWorkflowAnswerMessageIdV1(turnRunId, 2),
					content: EDITOR_TEXT
				}
			]);
			expect(facts.events.filter((event) => event.event_type === 'done')).toHaveLength(1);
			expect(facts.run).toMatchObject({ terminal_outcome: 'complete', recovery_count: 1 });
			const reviewer = facts.dispatches.filter((row) => row.step_key === 'risk_reviewer');
			expect(reviewer.map((row) => [row.state, row.reserved_generation])).toEqual([
				['uncertain', 1],
				['settled', 2]
			]);
			const { rows: exposure } = await admin.query(
				'SELECT public.agentic_chat_workflow_exposure_micro_usd_v1($1)::bigint AS value',
				[turnRunId]
			);
			expect(Number(exposure[0]!.value)).toBe(4 * 1_100 + reviewer[0]!.reserved);
			expect(facts.effects).toBe(0);
			expect(await e2eDomainRowCounts(admin)).toEqual(domainBefore);

			const { rows: terminal } = await admin.query(
				'SELECT terminalized_at FROM public.chat_turn_runs WHERE id = $1',
				[turnRunId]
			);
			const timeline = {
				turnRunId,
				generation1: { pid: claimed1.pid, claimedAt: claimed1.at, killedAt },
				detectedAt,
				requeuedAt: new Date(requeue.rows[0]!.updated_at).toISOString(),
				retryScheduledFor: new Date(requeue.rows[0]!.scheduled_for).toISOString(),
				generation2: { pid: claimed2.pid, claimedAt: claimed2.at, finishedAt: finished.at },
				terminalizedAt: new Date(terminal[0]!.terminalized_at).toISOString(),
				providerCalls: stub.calls.map((call) => ({ role: call.role, at: call.at })),
				attempts: Object.fromEntries(
					Object.entries(afterSteps).map(([key, row]) => [key, row.attempt_ids])
				),
				hashes: {
					request: identity.request_hash,
					context: identity.context_hash,
					plan: identity.plan_hash
				}
			};
			expect(claimed2.pid).not.toBe(claimed1.pid);
			if (process.env.WORKFLOW_RESTART_TIMELINE) {
				writeFileSync(
					process.env.WORKFLOW_RESTART_TIMELINE,
					JSON.stringify(timeline, null, 2)
				);
			}
		}, 120_000);
	}
);
