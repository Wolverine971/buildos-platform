// apps/worker/tests/agenticChatWorkflowEndToEnd.postgres.test.ts
//
// Tasker 86 → 87 on the frozen SQL in a disposable, socket-only local PostgreSQL:
// admission, claim, preparation, the durable runner behind the runner port, live
// delivery through the real stream publisher, and the real terminal writer. The
// provider is the real OpenRouter client over a scripted network. No hosted database,
// no QA worker, and no paid call exists anywhere in this file.
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stableAgenticChatWorkflowAnswerMessageIdV1 } from '../src/workers/agentic-chat/workflow/workflow-terminal';
import {
	type DisposablePostgres,
	createPgSupabaseShim,
	postgresAvailable,
	serviceClient,
	startDisposableWorkflowPostgres
} from './helpers/workflowPostgres';
import {
	admitE2ETurn,
	buildE2EWorker,
	e2eDomainRowCounts,
	e2eFacts,
	leaseAndClaimE2E,
	seedE2EOwner
} from './helpers/workflowEndToEnd';
import {
	EDITOR_TEXT,
	happyScript,
	scriptedWorkflowProvider
} from './helpers/workflowProviderScript';

const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('workflow v4 end to end on the frozen SQL', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let service: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;

	beforeAll(async () => {
		pg = await startDisposableWorkflowPostgres(resolve(process.cwd(), '../..'));
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

	it('prepares, runs, streams, and finalizes one review with one resume and zero domain writes', async () => {
		const domainBefore = await e2eDomainRowCounts(admin);
		const turnRunId = await admitE2ETurn(shim, 1);
		const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
		const provider = scriptedWorkflowProvider(happyScript);
		const worker = buildE2EWorker({ shim, client: provider.client });
		const rpcStart = shim.rpcCalls.length;
		const result = await worker.execute(lease);
		await worker.stop();

		expect(result).toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed',
			queueReconciled: true
		});
		const facts = await e2eFacts(admin, turnRunId);
		expect(facts.turn).toMatchObject({ status: 'completed', failure_code: null });
		expect(facts.job.status).toBe('completed');
		expect(facts.run).toMatchObject({
			phase: 'finished',
			terminal_outcome: 'complete',
			synthesis_status: 'accepted',
			answer_text: EDITOR_TEXT
		});
		expect(facts.messages).toEqual([
			{ id: stableAgenticChatWorkflowAnswerMessageIdV1(turnRunId, 1), content: EDITOR_TEXT }
		]);
		expect(facts.dispatches.map((row) => [row.step_key, row.state, row.actual])).toEqual([
			['planner', 'settled', 1_100],
			[expect.any(String), 'settled', 1_100],
			[expect.any(String), 'settled', 1_100],
			['editor', 'settled', 1_100]
		]);
		// One resume per generation: the preparer's `preparing` checkpoint only.
		const calls = shim.rpcCalls.slice(rpcStart);
		expect(
			calls.filter((name) => name === 'resume_agentic_chat_workflow_projection_v1')
		).toHaveLength(1);
		// Every durable event in order, ending with the single terminal event.
		const sequences = facts.events.map((event) => Number(event.sequence_index));
		expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
		expect(facts.events.at(-1)).toMatchObject({ event_type: 'done' });
		// Live delivery follows durable order. The fixture has no stream-acknowledgement
		// routine, so after the first broadcast the publisher degrades to reconcile hints,
		// exactly as production does when acknowledgement fails. The terminal broadcast is
		// accepted only at durable sequence + 1, which proves the publisher tracked every
		// committed progress event and answer text batch without a sequence gap.
		const live = worker.broadcasts
			.filter((message) => message.kind === 'event')
			.map((message) => message.payload as Record<string, any>);
		expect(live[0]).toMatchObject({ sequence_index: 1, event_type: 'workflow_progress' });
		expect(live.at(-1)).toMatchObject({
			event_type: 'done',
			status: 'completed',
			sequence_index: sequences.at(-1)
		});
		expect(worker.broadcasts.some((message) => message.kind === 'reconcile_hint')).toBe(true);
		// A read-only review changes no domain rows and records no effects.
		expect(await e2eDomainRowCounts(admin)).toEqual(domainBefore);
		expect(facts.effects).toBe(0);
		expect(facts.turn.mutation_reserved_at).toBeNull();
		expect(facts.turn.irreversible_boundary_at).toBeNull();
	}, 60_000);

	it('replays a terminal write whose response was lost and ends with one answer', async () => {
		const turnRunId = await admitE2ETurn(shim, 2);
		const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
		const worker = buildE2EWorker({
			shim,
			client: scriptedWorkflowProvider(happyScript).client
		});
		let dropped = false;
		shim.intercept(async (name, _args, run) => {
			const result = await run();
			if (name.startsWith('finalize_agentic_chat_turn') && !dropped) {
				dropped = true;
				// Committed in the database; the worker never sees the receipt.
				return { data: null, error: { code: '08006', message: 'connection reset' } };
			}
			return result;
		});
		const result = await worker.execute(lease);
		shim.intercept(null);
		await worker.stop();

		expect(dropped).toBe(true);
		expect(result).toMatchObject({ outcome: 'completed', terminalStatus: 'completed' });
		const facts = await e2eFacts(admin, turnRunId);
		expect(facts.turn.status).toBe('completed');
		expect(facts.messages).toHaveLength(1);
		expect(facts.events.filter((event) => event.event_type === 'done')).toHaveLength(1);
		expect(facts.job.status).toBe('completed');
	}, 60_000);
});
