// apps/worker/tests/agentRunDeepResearchKillSwitch.test.ts
//
// PRIVATE_DEEP_RESEARCH_ENABLED (default off) must stop every deep-research
// job the worker is handed — stale clients, resumes, sweep re-enqueues, jobs
// queued before the switch went off — before the claim, the model client, or a
// cost reservation. Ordinary `agent` runs must be untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };

const db = vi.hoisted(() => ({
	run: null as Record<string, unknown> | null,
	calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
	rpcCalls: [] as Array<{ fn: string; args: unknown }>
}));

vi.mock('../src/lib/supabase', () => {
	function resolve(table: string, ops: Call[]) {
		const update = ops.find((call) => call.op === 'update');
		if (table === 'agent_runs' && update) {
			const payload = update.args[0] as Record<string, unknown>;
			// The kill-switch cancel succeeds; an ordinary claim (status
			// 'running') reports "already claimed" so the test stops right after
			// proving the run reached the claim instead of being refused.
			return payload.status === 'cancelled'
				? { data: { id: db.run?.id }, error: null }
				: { data: null, error: null };
		}
		if (table === 'agent_runs') return { data: db.run, error: null };
		return { data: null, error: null };
	}
	function builder(table: string) {
		const ops: Call[] = [];
		const chain: Record<string, unknown> = {};
		for (const op of [
			'select',
			'eq',
			'in',
			'is',
			'contains',
			'limit',
			'order',
			'update',
			'insert'
		]) {
			chain[op] = (...args: unknown[]) => {
				const call = { table, op, args };
				ops.push(call);
				db.calls.push(call);
				return chain;
			};
		}
		chain.single = async () => resolve(table, ops);
		chain.maybeSingle = async () => resolve(table, ops);
		chain.then = (
			onFulfilled: (value: unknown) => unknown,
			onRejected?: (e: unknown) => unknown
		) => Promise.resolve(resolve(table, ops)).then(onFulfilled, onRejected);
		return chain;
	}
	return {
		supabase: {
			from: (table: string) => builder(table),
			rpc: async (fn: string, args: unknown) => {
				db.rpcCalls.push({ fn, args });
				return { data: null, error: null };
			}
		}
	};
});

import { isDeepResearchEnabled } from '../src/config/deepResearch';
import { isDeepResearchTreeRun } from '../src/workers/agent-run/deepResearchOrchestrator';
import { processAgentRunJob } from '../src/workers/agent-run/agentRunWorker';

const RUN_ID = '00000000-0000-4000-8000-0000000000aa';
const PARENT_ID = '00000000-0000-4000-8000-0000000000bb';

function runRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: RUN_ID,
		user_id: '00000000-0000-4000-8000-000000000001',
		status: 'queued',
		run_template: 'deep_research',
		depth: 0,
		parent_run_id: null,
		parent_session_id: null,
		label: 'Research competitors',
		goal: 'Research competitors',
		context_type: 'global',
		project_id: null,
		scope_mode: 'read_only',
		effort: 'deep',
		allowed_ops: null,
		review_required: false,
		budgets: { max_cost_usd: 0.5 },
		orchestration_state: null,
		execution_generation: 2,
		result: null,
		...overrides
	};
}

function job() {
	return {
		id: 'job-1',
		data: { run_id: RUN_ID },
		attempts: 0,
		log: vi.fn(async () => {})
	} as never;
}

function agentRunUpdates(): Array<Record<string, unknown>> {
	return db.calls
		.filter((call) => call.table === 'agent_runs' && call.op === 'update')
		.map((call) => call.args[0] as Record<string, unknown>);
}

describe('deep research kill switch flag', () => {
	it('is off unless explicitly set to true', () => {
		expect(isDeepResearchEnabled({})).toBe(false);
		expect(isDeepResearchEnabled({ PRIVATE_DEEP_RESEARCH_ENABLED: '' })).toBe(false);
		expect(isDeepResearchEnabled({ PRIVATE_DEEP_RESEARCH_ENABLED: 'false' })).toBe(false);
		expect(isDeepResearchEnabled({ PRIVATE_DEEP_RESEARCH_ENABLED: '1' })).toBe(false);
		expect(isDeepResearchEnabled({ PRIVATE_DEEP_RESEARCH_ENABLED: 'TRUE' })).toBe(true);
	});

	it('treats the root and its marked researcher children as deep research, nothing else', () => {
		expect(isDeepResearchTreeRun(runRow() as never)).toBe(true);
		expect(
			isDeepResearchTreeRun(
				runRow({
					run_template: 'agent',
					depth: 1,
					parent_run_id: PARENT_ID,
					orchestration_state: { role: 'deep_research_child' }
				}) as never
			)
		).toBe(true);
		expect(isDeepResearchTreeRun(runRow({ run_template: 'agent' }) as never)).toBe(false);
		// An ordinary depth-1 agent child without the marker is not research.
		expect(
			isDeepResearchTreeRun(
				runRow({ run_template: 'agent', depth: 1, parent_run_id: PARENT_ID }) as never
			)
		).toBe(false);
	});
});

describe('processAgentRunJob deep research refusal', () => {
	const originalFlag = process.env.PRIVATE_DEEP_RESEARCH_ENABLED;
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		delete process.env.PRIVATE_DEEP_RESEARCH_ENABLED;
		db.calls.length = 0;
		db.rpcCalls.length = 0;
		db.run = null;
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			throw new Error('no network in this test');
		});
	});

	afterEach(() => {
		fetchSpy.mockRestore();
		if (originalFlag === undefined) delete process.env.PRIVATE_DEEP_RESEARCH_ENABLED;
		else process.env.PRIVATE_DEEP_RESEARCH_ENABLED = originalFlag;
	});

	it('cancels a queued deep_research run before any claim, model, or cost call', async () => {
		db.run = runRow();

		const outcome = await processAgentRunJob(job());

		expect(outcome).toMatchObject({ run_id: RUN_ID, status: 'cancelled' });
		expect(outcome.message).toContain('Deep research is turned off');
		const updates = agentRunUpdates();
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({
			status: 'cancelled',
			error: 'deep_research_disabled',
			execution_generation: 3
		});
		expect(updates.some((payload) => payload.status === 'running')).toBe(false);
		// No ledger reservation, synthesis wake, or provider call.
		expect(db.rpcCalls).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('cancels a running coordinator handed back by a sweep re-enqueue', async () => {
		db.run = runRow({
			status: 'running',
			orchestration_state: { version: 1, stage: 'synthesis_queued' }
		});

		const outcome = await processAgentRunJob(job());

		expect(outcome.status).toBe('cancelled');
		const cancelUpdate = db.calls.find(
			(call) => call.table === 'agent_runs' && call.op === 'update'
		);
		expect(cancelUpdate).toBeDefined();
		// Compare-and-swap on the status the worker read, fencing older executors.
		expect(
			db.calls.some(
				(call) =>
					call.table === 'agent_runs' &&
					call.op === 'eq' &&
					call.args[0] === 'status' &&
					call.args[1] === 'running'
			)
		).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('cancels a queued researcher child and lets its coordinator settle', async () => {
		db.run = runRow({
			run_template: 'agent',
			depth: 1,
			parent_run_id: PARENT_ID,
			orchestration_state: { role: 'deep_research_child' },
			allowed_ops: ['util.web.search', 'util.web.visit']
		});

		const outcome = await processAgentRunJob(job());

		expect(outcome.status).toBe('cancelled');
		expect(db.rpcCalls).toEqual([
			{ fn: 'queue_deep_research_synthesis', args: { p_parent_run_id: PARENT_ID } }
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('leaves an already-terminal deep research run alone', async () => {
		db.run = runRow({ status: 'partial' });

		const outcome = await processAgentRunJob(job());

		expect(outcome.status).toBe('skipped');
		expect(agentRunUpdates()).toEqual([]);
	});

	it('does not touch ordinary agent runs: they proceed to the normal claim', async () => {
		db.run = runRow({ run_template: 'agent', effort: 'standard' });

		const outcome = await processAgentRunJob(job());

		// The fake reports the claim as lost, which is only reachable past the gate.
		expect(outcome).toMatchObject({ status: 'skipped' });
		expect(outcome.message).toContain('already claimed');
		const updates = agentRunUpdates();
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({ status: 'running' });
	});

	it('lets deep research through to the normal claim only when explicitly enabled', async () => {
		process.env.PRIVATE_DEEP_RESEARCH_ENABLED = 'true';
		db.run = runRow();

		const outcome = await processAgentRunJob(job());

		expect(outcome.message).toContain('already claimed');
		expect(agentRunUpdates()[0]).toMatchObject({ status: 'running' });
	});
});
