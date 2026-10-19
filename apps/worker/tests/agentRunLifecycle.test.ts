// apps/worker/tests/agentRunLifecycle.test.ts
// Regression tests drive the real worker; model, operations and database I/O are offline.
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	run: {} as any,
	execs: [] as any[],
	events: [] as any[],
	signals: [] as any[],
	messages: [] as any[],
	turns: [] as any[],
	prompts: [] as any[],
	opCalls: [] as any[],
	runReadError: false,
	claimError: false,
	execReadError: false,
	steerReadError: false,
	beforeTool: null as null | (() => void),
	failFinalize: false,
	afterOp: null as null | (() => void)
}));

vi.mock('../src/lib/supabase', () => {
	function resolve(table: string, calls: any[]) {
		const update = calls.find((c) => c[0] === 'update')?.[1];
		const insert = calls.find((c) => c[0] === 'insert')?.[1];
		const matches = (row: any) =>
			calls.every(([op, key, value]) => {
				if (op === 'eq' || op === 'is') return row[key] === value;
				if (op === 'in') return value.includes(row[key]);
				if (op === 'contains')
					return Object.entries(value).every(([k, v]) => row[key]?.[k] === v);
				return true;
			});
		const ok = (data: any) => ({ data: structuredClone(data), error: null });
		if (table === 'agent_runs') {
			if (
				(!update && state.runReadError) ||
				(update?.status === 'running' && state.claimError)
			)
				return { data: null, error: { message: 'injected admission outage' } };
			if (update && update.status !== 'running' && state.failFinalize) {
				state.failFinalize = false;
				return { data: null, error: { message: 'injected finalize outage' } };
			}
			if (!matches(state.run)) return ok(null);
			if (update) Object.assign(state.run, update);
			return ok(state.run);
		}
		if (
			!insert &&
			((table === 'agent_tool_executions' && state.execReadError) ||
				(table === 'agent_run_events' && state.steerReadError))
		) {
			return { data: null, error: { message: 'injected history outage' } };
		}
		const rows =
			table === 'agent_tool_executions'
				? state.execs
				: table === 'agent_run_events'
					? state.events
					: table === 'agent_run_signals'
						? state.signals
						: table === 'chat_messages'
							? state.messages
							: [];
		if (insert) {
			if (table === 'agent_run_events' && insert.event_type === 'run.tool_call')
				state.beforeTool?.();
			rows.push({
				id: `${table}-${rows.length}`,
				created_at: new Date().toISOString(),
				...insert
			});
			return ok(null);
		}
		const selected = rows.filter(matches);
		if (update) selected.forEach((row) => Object.assign(row, update));
		return ok(calls.some((c) => c[0] === 'maybeSingle') ? (selected[0] ?? null) : selected);
	}
	return {
		supabase: {
			from(table: string) {
				const calls: any[] = [];
				const chain: any = {};
				for (const op of [
					'select',
					'eq',
					'in',
					'is',
					'contains',
					'limit',
					'order',
					'update',
					'insert',
					'abortSignal'
				]) {
					chain[op] = (...args: any[]) => {
						calls.push([op, ...args]);
						return chain;
					};
				}
				chain.single = async () => resolve(table, calls);
				chain.maybeSingle = async () => {
					calls.push(['maybeSingle']);
					return resolve(table, calls);
				};
				chain.then = (yes: any, no: any) =>
					Promise.resolve(resolve(table, calls)).then(yes, no);
				return chain;
			},
			rpc: vi.fn(async (name: string, args: any) => {
				if (name !== 'checkpoint_agent_run_execution')
					throw new Error(`Unexpected RPC: ${name}`);
				if (
					state.run.execution_generation !== args.p_execution_generation ||
					state.run.status !== 'running'
				)
					return { data: false, error: null };
				if (args.p_patch.status && state.failFinalize) {
					state.failFinalize = false;
					return { data: null, error: { message: 'injected finalize outage' } };
				}
				if (args.p_completion_content && state.run.parent_session_id)
					state.messages.push({
						metadata: {
							run_status: args.p_patch.status,
							execution_generation: args.p_execution_generation
						}
					});
				if (args.p_execution)
					state.execs.push({
						agent_run_id: state.run.id,
						created_at: new Date().toISOString(),
						gateway_op: args.p_execution.op,
						...args.p_execution
					});
				for (const signal of state.signals.filter(
					(s) => args.p_signal_ids.includes(s.id) && s.consumed_at === null
				)) {
					if (signal.kind === 'steer')
						state.events.push({
							run_id: state.run.id,
							event_type: 'run.steer',
							payload: signal.payload,
							created_at: new Date().toISOString()
						});
					signal.consumed_at = new Date().toISOString();
				}
				Object.assign(state.run, structuredClone(args.p_patch));
				return { data: true, error: null };
			})
		}
	};
});

vi.mock('../src/lib/services/smart-llm-service', async () => {
	const actual = await import('@buildos/smart-llm');
	return {
		LLMSpendLimitError: actual.LLMSpendLimitError,
		SmartLLMService: class {
			async getJSONResponse(options: any) {
				state.prompts.push(options);
				const next = state.turns.shift();
				if (!next) throw new Error('Audit ran out of scripted turns');
				return typeof next === 'function' ? next(options) : next;
			}
		}
	};
});

vi.mock('@buildos/shared-agent-ops', async (importOriginal) => {
	const actual = await importOriginal<any>();
	return {
		...actual,
		buildAgentRunOpCatalog: () => ['onto.task.create'],
		syncInboxItemForAgentRun: vi.fn(async () => {}),
		syncInboxItemForProjectSuggestion: vi.fn(async () => {}),
		executeAgentOp: vi.fn(async (context: any, op: string, args: any) => {
			state.opCalls.push({ context, op, args });
			state.afterOp?.();
			return {
				ok: true,
				op,
				data: { title: args.title, staged: context.mutationMode === 'stage' },
				entityKind: 'task',
				entityId: context.mutationMode === 'stage' ? null : 'task-1',
				...(context.mutationMode === 'stage'
					? {
							proposedChange: {
								op,
								action: 'create',
								entity_type: 'task',
								entity_id: null,
								before: null,
								after: args,
								args
							}
						}
					: {})
			};
		})
	};
});

import { processAgentRunJob } from '../src/workers/agent-run/agentRunWorker';

const done = { action: 'submit_result', status: 'completed', summary: 'Done', answer: 'Done' };
const create = {
	action: 'call_op',
	op: 'onto.task.create',
	args: { project_id: 'project-1', title: 'Task A' }
};
function job(extra: any = {}, signal = new AbortController().signal) {
	return {
		id: 'job-1',
		data: { run_id: 'run-1', ...extra.data },
		attempts: 0,
		signal,
		...extra
	} as never;
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			throw new Error('Network prohibited in audit');
		})
	);
	vi.stubEnv('PRIVATE_GOOGLE_CLIENT_ID', '');
	vi.stubEnv('GOOGLE_CLIENT_ID', '');
	state.run = {
		id: 'run-1',
		user_id: 'user-1',
		status: 'queued',
		run_template: 'agent',
		depth: 0,
		parent_run_id: null,
		parent_session_id: null,
		context_type: 'project',
		project_id: 'project-1',
		scope_mode: 'read_write',
		allowed_ops: ['onto.task.create'],
		review_required: false,
		goal: 'Create a task',
		instructions: '',
		expected_output: '',
		effort: 'standard',
		budgets: { max_cost_usd: 1, max_tool_calls: 20, wall_clock_ms: 60000 },
		commit_started_at: null,
		orchestration_state: null,
		execution_generation: 0,
		result: null,
		change_set: null,
		metrics: {}
	};
	for (const key of [
		'execs',
		'events',
		'signals',
		'messages',
		'turns',
		'prompts',
		'opCalls'
	] as const)
		state[key] = [];
	state.runReadError = false;
	state.claimError = false;
	state.execReadError = false;
	state.steerReadError = false;
	state.beforeTool = null;
	state.failFinalize = false;
	state.afterOp = null;
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it('control: stages a proposal when the worker is uninterrupted', async () => {
	state.run.review_required = true;
	state.turns = [create, done];
	const result = await processAgentRunJob(job());
	expect(result.status).toBe('proposal_ready');
	expect(state.run.change_set.changes).toHaveLength(1);
});

it('preserves staged changes through pause and resume', async () => {
	state.run.review_required = true;
	state.turns = [create];
	state.afterOp = () =>
		state.signals.push({
			id: 'pause-1',
			run_id: 'run-1',
			kind: 'pause',
			payload: {},
			consumed_at: null
		});
	expect((await processAgentRunJob(job())).status).toBe('paused');
	state.afterOp = null;
	state.run.status = 'queued'; // resume endpoint queues the same run
	state.turns = [done, done]; // second submit covers the one staging-repair attempt
	const result = await processAgentRunJob(
		job({ data: { run_id: 'run-1', continuation_from: 'paused' } })
	);
	expect(result.status).toBe('proposal_ready');
	expect(state.run.change_set.changes).toHaveLength(1);
});

it('does not publish a completion from a superseded executor', async () => {
	state.run.parent_session_id = 'chat-1';
	state.turns = [
		() => {
			state.run.execution_generation += 1;
			return done;
		}
	];
	expect((await processAgentRunJob(job())).status).toBe('superseded');
	expect(state.messages).toHaveLength(0);
});

it('publishes completion after a needs-input continuation', async () => {
	state.run.parent_session_id = 'chat-1';
	state.turns = [
		{
			action: 'submit_result',
			status: 'needs_input',
			summary: 'Which date?',
			open_questions: ['Which date?']
		}
	];
	expect((await processAgentRunJob(job())).status).toBe('needs_input');
	state.run.status = 'queued'; // answer endpoint
	state.turns = [done];
	expect(
		(
			await processAgentRunJob(
				job({ data: { run_id: 'run-1', continuation_from: 'needs_input' } })
			)
		).status
	).toBe('completed');
	expect(state.messages.at(-1).metadata.run_status).toBe('completed');
	expect(state.messages).toHaveLength(2);
});

it('stops remaining batch writes after infrastructure abort', async () => {
	const controller = new AbortController();
	state.turns = [{ action: 'call_ops', ops: [create, { ...create, args: { title: 'Task B' } }] }];
	state.afterOp = () => controller.abort(new Error('queue timeout'));
	await expect(processAgentRunJob(job({}, controller.signal))).rejects.toThrow('aborted');
	expect(state.opCalls).toHaveLength(1);
});

it.each(['execReadError', 'steerReadError'] as const)(
	'fails closed when retry history cannot be read: %s',
	async (failure) => {
		state.run.status = 'running';
		state[failure] = true;
		state.turns = [create, done];
		await expect(processAgentRunJob(job({ attempts: 1 }))).rejects.toThrow('history');
		expect(state.opCalls).toHaveLength(0);
	}
);

it('preserves cancellation if its terminal update fails', async () => {
	state.signals.push({
		id: 'cancel-1',
		run_id: 'run-1',
		kind: 'cancel',
		payload: {},
		consumed_at: null
	});
	state.failFinalize = true;
	await expect(processAgentRunJob(job())).rejects.toThrow('finalize outage');
	state.turns = [done];
	expect((await processAgentRunJob(job({ attempts: 1 }))).status).toBe('cancelled');
	expect(state.prompts).toHaveLength(0);
});

it('restores the previous question when the answer endpoint has queued the run', async () => {
	state.run.result = {
		summary: 'Need a date',
		answer: 'Which date should I use?',
		open_questions: ['Which date?']
	};
	state.turns = [done];
	await processAgentRunJob(job({ data: { run_id: 'run-1', continuation_from: 'needs_input' } }));
	expect(state.prompts[0].userPrompt).toContain('Which date should I use?');
});

it('retains proposals through needs-input and a later answer', async () => {
	state.run.review_required = true;
	state.turns = [
		create,
		{ action: 'submit_result', status: 'needs_input', open_questions: ['Which date?'] }
	];
	expect((await processAgentRunJob(job())).status).toBe('needs_input');
	const proposalId = state.run.change_set.changes[0].id;
	state.run.status = 'queued';
	state.turns = [done];
	expect(
		(
			await processAgentRunJob(
				job({ data: { run_id: 'run-1', continuation_from: 'needs_input' } })
			)
		).status
	).toBe('proposal_ready');
	expect(state.run.change_set.changes[0].id).toBe(proposalId);
	expect(state.opCalls).toHaveLength(1);
});

it('retains a staged proposal when finalization fails and the queue retries', async () => {
	state.run.review_required = true;
	state.failFinalize = true;
	state.turns = [create, done];
	await expect(processAgentRunJob(job())).rejects.toThrow('finalize outage');
	const proposalId = state.run.change_set.changes[0].id;
	state.turns = [done];
	expect((await processAgentRunJob(job({ attempts: 1 }))).status).toBe('proposal_ready');
	expect(state.run.change_set.changes[0].id).toBe(proposalId);
	expect(state.opCalls).toHaveLength(1);
});

it('leaves infrastructure-aborted model calls retryable instead of finalizing failed', async () => {
	const controller = new AbortController();
	state.turns = [
		() => {
			controller.abort();
			throw new Error('request cancelled');
		}
	];
	await expect(processAgentRunJob(job({}, controller.signal))).rejects.toThrow('aborted');
	expect(state.run.status).toBe('running');
	expect(state.messages).toHaveLength(0);
});

it('does not execute a returned write when a newer generation owns the run', async () => {
	state.turns = [
		() => {
			state.run.execution_generation++;
			return create;
		}
	];
	expect((await processAgentRunJob(job())).status).toBe('superseded');
	expect(state.opCalls).toHaveLength(0);
});

it.each([
	{ run_template: 'deep_research' },
	{
		run_template: 'agent',
		depth: 1,
		parent_run_id: 'parent-1',
		orchestration_state: { role: 'deep_research_child' }
	}
])('refuses historical research trees even with the old flag enabled: %j', async (shape) => {
	vi.stubEnv('PRIVATE_DEEP_RESEARCH_ENABLED', 'true');
	Object.assign(state.run, shape);
	expect((await processAgentRunJob(job())).status).toBe('cancelled');
	expect(state.prompts).toHaveLength(0);
	expect(state.opCalls).toHaveLength(0);
});

it('does not claim a run currently owned by proposal approval', async () => {
	state.run.status = 'running';
	state.run.commit_started_at = new Date().toISOString();
	state.run.execution_generation = 3;
	expect((await processAgentRunJob(job({ attempts: 1 }))).status).toBe('skipped');
	expect(state.run.execution_generation).toBe(3);
	expect(state.prompts).toHaveLength(0);
});

it('honors an abort that arrives during operation preflight', async () => {
	const controller = new AbortController();
	state.turns = [create];
	state.beforeTool = () => controller.abort();
	await expect(processAgentRunJob(job({}, controller.signal))).rejects.toThrow('aborted');
	expect(state.opCalls).toHaveLength(0);
});

it('retains the prior question and answer in compact web research context', async () => {
	Object.assign(state.run, {
		effort: 'deep',
		scope_mode: 'read_only',
		allowed_ops: ['util.web.search', 'util.web.visit'],
		result: { answer: 'Which market should I research?', open_questions: ['Which market?'] }
	});
	state.signals = [
		{
			id: 'steer-1',
			run_id: 'run-1',
			kind: 'steer',
			payload: { message: 'Use France' },
			consumed_at: null
		}
	];
	state.turns = [done];
	await processAgentRunJob(job({ data: { run_id: 'run-1', continuation_from: 'needs_input' } }));
	expect(state.prompts[0].userPrompt).toContain('Which market should I research?');
	expect(state.prompts[0].userPrompt).toContain('Use France');
});

it.each(['runReadError', 'claimError'] as const)(
	'throws %s so the queue retries instead of completing an unstarted run',
	async (failure) => {
		state[failure] = true;
		await expect(processAgentRunJob(job())).rejects.toThrow('admission outage');
		expect(state.prompts).toHaveLength(0);
		expect(state.opCalls).toHaveLength(0);
		expect(state.run.status).toBe('queued');
		state[failure] = false;
		state.turns = [done];
		expect((await processAgentRunJob(job({ attempts: 1 }))).status).toBe('completed');
	}
);
