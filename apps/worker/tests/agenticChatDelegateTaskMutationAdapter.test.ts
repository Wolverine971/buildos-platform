// apps/worker/tests/agenticChatDelegateTaskMutationAdapter.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatDelegateTaskMutationAdapter,
	classifyDispatchError
} from '../src/workers/agentic-chat/delegateTaskMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const EFFECT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'delegate_task',
		operationName: 'util.agent.delegate',
		downstreamIdempotencySupported: false,
		arguments: {
			goal: 'Prepare the marketing reorientation proposal',
			label: 'Reorient marketing',
			project_id: PROJECT_ID,
			instructions: `Update the exact discovered working set in project ${PROJECT_ID}; stage every change for review.`,
			expected_output: 'One coherent staged change set.',
			max_tool_calls: 32,
			max_cost_usd: 0.75
		},
		providerToolCallId: 'provider-delegate-task',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				message: 'Reorient this project toward weekend hikers',
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'project_write_document',
						toolNames: ['delegate_task'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'delegate_task',
									description: 'Prepare a reviewable project proposal',
									parameters: { type: 'object', properties: {} }
								}
							}
						]
					}
				}
			}
		},
		signal: new AbortController().signal,
		...overrides
	} as never;
}

function dispatchReceipt() {
	return {
		data: {
			run: {
				id: RUN_ID,
				user_id: USER_ID,
				project_id: PROJECT_ID,
				context_type: 'project',
				scope_mode: 'read_write',
				review_required: true,
				status: 'queued'
			},
			job_id: JOB_ID
		},
		error: null
	};
}

describe('AgenticChatDelegateTaskMutationAdapter', () => {
	it('atomically dispatches a focused review-required Agent Run without applying changes', async () => {
		const dispatch = vi.fn(async () => dispatchReceipt());
		const assertProjectWriteAccess = vi.fn(async () => undefined);
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			ok: true,
			run_ids: [RUN_ID],
			queue_job_id: JOB_ID,
			label: 'Reorient marketing',
			status: 'queued',
			context_type: 'project',
			project_id: PROJECT_ID,
			scope_mode: 'read_write',
			effort: 'standard',
			run_template: 'agent',
			max_cost_usd: 0.75,
			review: true,
			requires_user_action: false,
			message:
				'Dispatched background proposal agent "Reorient marketing". It can only stage changes; nothing will be applied until the user approves the resulting change set.'
		});
		expect(assertProjectWriteAccess).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
		expect(dispatch).toHaveBeenCalledOnce();
		expect(dispatch).toHaveBeenCalledWith({
			p_run: expect.objectContaining({
				user_id: USER_ID,
				parent_session_id: SESSION_ID,
				project_id: PROJECT_ID,
				context_type: 'project',
				scope_mode: 'read_write',
				review_required: true,
				budgets: { max_tool_calls: 32, max_cost_usd: 0.75 }
			}),
			p_job_metadata: expect.objectContaining({
				run_id: EFFECT_ID,
				correlationId: EFFECT_ID,
				project_id: PROJECT_ID,
				review_required: true
			}),
			p_priority: 7
		});
	});

	it('rejects a cross-project dispatch before access or database work', async () => {
		const dispatch = vi.fn();
		const assertProjectWriteAccess = vi.fn();
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess
		});
		const input = mutationInput() as any;
		input.arguments.project_id = RUN_ID;

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(assertProjectWriteAccess).not.toHaveBeenCalled();
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('fails closed on invalid budgets and uncertain atomic dispatch outcomes', async () => {
		const dispatch = vi.fn(async () => {
			throw new Error('response lost');
		});
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess: vi.fn(async () => undefined)
		});
		const invalid = mutationInput() as any;
		invalid.arguments.max_cost_usd = 2;
		await expect(adapter.execute(invalid)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(dispatch).not.toHaveBeenCalled();

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'delegate_task_dispatch_uncertain'
		});
	});

	it('treats a mismatched atomic receipt as uncertain instead of claiming dispatch', async () => {
		const receipt = dispatchReceipt();
		receipt.data.run.review_required = false;
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch: vi.fn(async () => receipt),
			assertProjectWriteAccess: vi.fn(async () => undefined)
		});

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'delegate_task_receipt_invalid'
		});
	});
});

// Finding 15 (AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02): every delegate_task
// failure since 08-28 was one production turn (0fa59a3e, 2026-08-30 19:56 UTC)
// whose six dispatches all hit `column "trigger" is of type agent_run_trigger
// but expression is of type text` from create_agent_run_with_job. These tests
// replay the exact argument shapes that turn sent and pin the adapter <-> RPC
// contract so the class of defect (a p_run key the SQL never reads, or an enum
// column inserted without a cast) fails in plain vitest instead of production.
const PRODUCTION_TURN_0FA59A3E_ARGUMENT_SHAPES: ReadonlyArray<Record<string, unknown>> = [
	{
		goal: 'Stage a reviewable reorientation of the campaign toward overwhelmed solo founders.',
		label: 'Reorient campaign to solo founders',
		project_id: PROJECT_ID,
		instructions:
			'Do NOT apply or approve any changes. Stage everything as a review-required change set only.'
	},
	{
		goal: 'Stage a reviewable reorientation of the campaign toward overwhelmed solo founders.',
		project_id: PROJECT_ID,
		instructions: `Use exact UUIDs: ${RUN_ID}, ${JOB_ID}.`,
		max_cost_usd: 0.75,
		max_tool_calls: 35
	},
	{ goal: 'Stage a reviewable reorientation of the campaign.', project_id: PROJECT_ID },
	{
		goal: 'Stage a reviewable reorientation of the campaign.',
		project_id: PROJECT_ID,
		max_tool_calls: 5
	},
	{
		goal: 'Stage reviewable reorientation proposal for the campaign.',
		project_id: PROJECT_ID,
		max_cost_usd: 0.01,
		max_tool_calls: 1
	}
];

const TRIGGER_CAST_DEFECT = {
	code: '42804',
	message: 'column "trigger" is of type agent_run_trigger but expression is of type text'
};

type CapturedDispatchArgs = {
	p_run: Record<string, unknown>;
	p_job_metadata: Record<string, unknown>;
	p_priority: number;
};

async function captureDispatchArgs(args: Record<string, unknown>): Promise<CapturedDispatchArgs> {
	const captured: CapturedDispatchArgs[] = [];
	const dispatch = vi.fn(async (dispatchArgs: unknown) => {
		captured.push(dispatchArgs as CapturedDispatchArgs);
		return dispatchReceipt();
	});
	const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
		dispatch,
		assertProjectWriteAccess: vi.fn(async () => undefined)
	});
	const input = mutationInput() as any;
	input.arguments = { ...args };
	await adapter.execute(input);
	expect(captured).toHaveLength(1);
	return captured[0]!;
}

describe('delegate_task production regression (Finding 15, turn 0fa59a3e)', () => {
	it.each(PRODUCTION_TURN_0FA59A3E_ARGUMENT_SHAPES.map((shape, index) => [index + 1, shape]))(
		'dispatches production argument shape %i with a typed chat trigger',
		async (_index, shape) => {
			const { p_run, p_job_metadata, p_priority } = await captureDispatchArgs(shape);
			expect(p_run.trigger).toBe('chat');
			expect(p_job_metadata.trigger).toBe('chat');
			expect(p_run.context_type).toBe('project');
			expect(p_run.scope_mode).toBe('read_write');
			expect(p_run.review_required).toBe(true);
			expect(p_run.project_id).toBe(PROJECT_ID);
			expect(p_run.budgets).toEqual({
				max_tool_calls: shape.max_tool_calls ?? 30,
				max_cost_usd: shape.max_cost_usd ?? 0.5
			});
			expect(p_priority).toBe(7);
		}
	);

	it('reports the enum cast defect as a non-retryable backend contract mismatch', async () => {
		const dispatch = vi.fn(async () => ({ data: null, error: TRIGGER_CAST_DEFECT }));
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess: vi.fn(async () => undefined)
		});
		const input = mutationInput() as any;
		input.arguments = { ...PRODUCTION_TURN_0FA59A3E_ARGUMENT_SHAPES[1] };

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'delegate_task_backend_contract_mismatch',
			message: expect.stringMatching(
				/42804: column "trigger" is of type agent_run_trigger[\s\S]*retrying with different arguments will not help[\s\S]*Do not call delegate_task again/
			)
		});
		expect(dispatch).toHaveBeenCalledOnce();
	});

	it('classifies dispatch errors by SQLSTATE class, not by message wording', () => {
		const contract = [
			TRIGGER_CAST_DEFECT,
			{
				code: '42883',
				message:
					'function public.create_agent_run_with_job(jsonb, jsonb, integer) does not exist'
			},
			{
				code: '42703',
				message: 'column "source_decision" of relation "agent_runs" does not exist'
			},
			{ code: '42P01', message: 'relation "public.agent_runs" does not exist' },
			{
				code: 'PGRST202',
				message:
					'Could not find the function public.create_agent_run_with_job in the schema cache'
			}
		];
		for (const error of contract) {
			expect(classifyDispatchError(error), error.code).toMatchObject({
				disposition: 'known_failed',
				failureCode: 'delegate_task_backend_contract_mismatch'
			});
		}
		expect(
			classifyDispatchError({
				code: 'P0001',
				message: 'agent_run_limit_exceeded: user already has 3 active agent runs'
			})
		).toMatchObject({ failureCode: 'delegate_task_capacity_exhausted' });
		expect(
			classifyDispatchError({
				code: 'P0001',
				message: 'Agent Run slots are reserved by active deep research'
			})
		).toMatchObject({ failureCode: 'delegate_task_capacity_exhausted' });
		expect(
			classifyDispatchError({
				code: '23505',
				message: 'duplicate key value violates unique constraint'
			})
		).toMatchObject({
			failureCode: 'delegate_task_dispatch_failed',
			message: 'duplicate key value violates unique constraint'
		});
		expect(classifyDispatchError({})).toMatchObject({
			failureCode: 'delegate_task_dispatch_failed',
			message: 'Agent Run dispatch failed'
		});
	});
});

describe('delegate_task <-> create_agent_run_with_job contract', () => {
	const MIGRATIONS_DIR = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));
	const DATABASE_TYPES_PATH = fileURLToPath(
		new URL('../../../packages/shared-types/src/database.types.ts', import.meta.url)
	);
	const FUNCTION_SIGNATURE = /CREATE OR REPLACE FUNCTION public\.create_agent_run_with_job\(/;

	function latestAtomicDispatchFunction(): { file: string; body: string } {
		const candidates = readdirSync(MIGRATIONS_DIR)
			.filter((file) => file.endsWith('.sql'))
			.sort()
			.filter((file) => FUNCTION_SIGNATURE.test(readFileSync(MIGRATIONS_DIR + file, 'utf8')));
		expect(candidates.length, 'no migration defines create_agent_run_with_job').toBeGreaterThan(
			0
		);
		const file = candidates[candidates.length - 1]!;
		const sql = readFileSync(MIGRATIONS_DIR + file, 'utf8');
		const start = sql.search(FUNCTION_SIGNATURE);
		const end = sql.indexOf('$$;', sql.indexOf('AS $$', start));
		return { file, body: sql.slice(start, end) };
	}

	function agentRunsEnumColumns(): Map<string, string> {
		const source = readFileSync(DATABASE_TYPES_PATH, 'utf8');
		const rowStart = source.indexOf('agent_runs: {');
		const rowEnd = source.indexOf('Insert: {', rowStart);
		const row = source.slice(rowStart, rowEnd);
		const columns = new Map<string, string>();
		for (const match of row.matchAll(/(\w+): Database\["public"\]\["Enums"\]\["(\w+)"\]/g)) {
			columns.set(match[1]!, match[2]!);
		}
		return columns;
	}

	it('sends exactly the p_run keys the deployed RPC reads', async () => {
		const { file, body } = latestAtomicDispatchFunction();
		const readBySql = new Set(
			[...body.matchAll(/p_run\s*(?:->>|->|\?)\s*'([a-z_]+)'/g)].map((match) => match[1]!)
		);
		const { p_run } = await captureDispatchArgs(PRODUCTION_TURN_0FA59A3E_ARGUMENT_SHAPES[0]!);
		const sentByAdapter = new Set(Object.keys(p_run));
		expect([...sentByAdapter].sort(), `p_run keys vs ${file}`).toEqual([...readBySql].sort());
	});

	it('casts every enum column of agent_runs that the RPC reads from p_run', () => {
		const { file, body } = latestAtomicDispatchFunction();
		const enumColumns = agentRunsEnumColumns();
		expect(enumColumns.get('trigger'), 'agent_runs.trigger enum in generated types').toBe(
			'agent_run_trigger'
		);
		for (const [column, enumName] of enumColumns) {
			const readFromJson = new RegExp(`p_run\\s*->>\\s*'${column}'`).test(body);
			if (!readFromJson) continue;
			expect(body, `${file}: ${column} must be cast to public.${enumName}`).toMatch(
				new RegExp(`\\(p_run\\s*->>\\s*'${column}'\\)::public\\.${enumName}`)
			);
		}
	});
});
