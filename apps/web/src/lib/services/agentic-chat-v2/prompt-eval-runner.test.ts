// apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts
import { describe, expect, it } from 'vitest';
import {
	evaluateAndPersistPromptEval,
	loadPromptEvalResultsForTurnRuns,
	normalizePromptEvalRunnerType
} from './prompt-eval-runner';

type TableName =
	| 'chat_turn_runs'
	| 'chat_prompt_snapshots'
	| 'chat_turn_events'
	| 'chat_tool_executions'
	| 'chat_messages'
	| 'chat_prompt_eval_runs'
	| 'chat_prompt_eval_assertions';

type FixtureState = Record<TableName, Record<string, unknown>[]>;

function sortRows(
	rows: Record<string, unknown>[],
	field: string,
	ascending = true
): Record<string, unknown>[] {
	return [...rows].sort((left, right) => {
		const leftValue = left[field];
		const rightValue = right[field];
		if (leftValue === rightValue) return 0;
		if (leftValue === undefined || leftValue === null) return ascending ? 1 : -1;
		if (rightValue === undefined || rightValue === null) return ascending ? -1 : 1;
		return ascending
			? String(leftValue).localeCompare(String(rightValue))
			: String(rightValue).localeCompare(String(leftValue));
	});
}

function createSupabaseMock(fixtures: Partial<FixtureState> = {}) {
	const state: FixtureState = {
		chat_turn_runs: fixtures.chat_turn_runs ?? [],
		chat_prompt_snapshots: fixtures.chat_prompt_snapshots ?? [],
		chat_turn_events: fixtures.chat_turn_events ?? [],
		chat_tool_executions: fixtures.chat_tool_executions ?? [],
		chat_messages: fixtures.chat_messages ?? [],
		chat_prompt_eval_runs: fixtures.chat_prompt_eval_runs ?? [],
		chat_prompt_eval_assertions: fixtures.chat_prompt_eval_assertions ?? []
	};

	const inserted: Partial<Record<TableName, Record<string, unknown>[]>> = {};

	const terminalResult = (
		rows: Record<string, unknown>[],
		mode: 'many' | 'maybeSingle' | 'single'
	) => {
		if (mode === 'many') {
			return Promise.resolve({ data: rows, error: null });
		}
		if (mode === 'maybeSingle') {
			return Promise.resolve({ data: rows[0] ?? null, error: null });
		}
		return Promise.resolve({
			data: rows[0] ?? null,
			error: rows[0] ? null : { message: 'Not found' }
		});
	};

	const buildQuery = (table: TableName) => {
		let workingRows = [...state[table]];

		return {
			select() {
				return this;
			},
			eq(field: string, value: unknown) {
				workingRows = workingRows.filter((row) => row[field] === value);
				return this;
			},
			in(field: string, values: unknown[]) {
				const valueSet = new Set(values);
				workingRows = workingRows.filter((row) => valueSet.has(row[field]));
				return this;
			},
			order(field: string, options?: { ascending?: boolean }) {
				return terminalResult(
					sortRows(workingRows, field, options?.ascending !== false),
					'many'
				);
			},
			maybeSingle() {
				return terminalResult(workingRows, 'maybeSingle');
			},
			single() {
				return terminalResult(workingRows, 'single');
			},
			insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
				const rows = Array.isArray(payload) ? payload : [payload];
				const clonedRows = rows.map(
					(row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>
				);
				state[table].push(...clonedRows);
				inserted[table] = [...(inserted[table] ?? []), ...clonedRows];
				return Promise.resolve({ data: clonedRows, error: null });
			}
		};
	};

	return {
		from(table: TableName) {
			return buildQuery(table);
		},
		getInserted(table: TableName) {
			return inserted[table] ?? [];
		}
	};
}

describe('prompt eval runner', () => {
	it('persists eval runs and assertion rows for a matching named-project overview scenario', async () => {
		const supabase = createSupabaseMock({
			chat_turn_runs: [
				{
					id: 'run-1',
					status: 'completed',
					finished_reason: 'stop',
					first_lane: 'overview',
					first_skill_path: null,
					first_canonical_op: 'util.project.overview',
					validation_failure_count: 0,
					user_message_id: 'user-message-1',
					assistant_message_id: 'assistant-message-1'
				}
			],
			chat_prompt_snapshots: [
				{
					id: 'snapshot-1',
					turn_run_id: 'run-1',
					approx_prompt_tokens: 912,
					rendered_dump_text: 'FASTCHAT V2 PROMPT SNAPSHOT'
				}
			],
			chat_turn_events: [
				{
					id: 'event-1',
					turn_run_id: 'run-1',
					event_type: 'prompt_snapshot_created',
					sequence_index: 1,
					payload: {}
				},
				{
					id: 'event-2',
					turn_run_id: 'run-1',
					event_type: 'tool_result_received',
					sequence_index: 2,
					payload: { canonical_op: 'util.project.overview' }
				},
				{
					id: 'event-3',
					turn_run_id: 'run-1',
					event_type: 'done_emitted',
					sequence_index: 3,
					payload: {}
				}
			],
			chat_tool_executions: [
				{
					id: 'tool-1',
					turn_run_id: 'run-1',
					sequence_index: 1,
					gateway_op: 'util.project.overview',
					success: true,
					error_message: null
				}
			],
			chat_messages: [
				{
					id: 'user-message-1',
					content: 'What is going on with 9takes?'
				},
				{
					id: 'assistant-message-1',
					content: 'I checked 9takes and summarized the active tasks and recent changes.'
				}
			]
		});

		const persisted = await evaluateAndPersistPromptEval({
			supabase,
			turnRunId: 'run-1',
			scenarioSlug: 'project.named_status',
			createdByUserId: 'admin-1'
		});

		expect(persisted.result.status).toBe('passed');
		expect(persisted.evalRun).toMatchObject({
			turn_run_id: 'run-1',
			scenario_slug: 'project.named_status',
			runner_type: 'admin_manual',
			status: 'passed',
			created_by: 'admin-1'
		});

		const insertedRuns = supabase.getInserted('chat_prompt_eval_runs');
		const insertedAssertions = supabase.getInserted('chat_prompt_eval_assertions');
		expect(insertedRuns).toHaveLength(1);
		expect(insertedAssertions.length).toBeGreaterThan(0);
		expect(insertedAssertions.every((row) => row.eval_run_id === insertedRuns[0].id)).toBe(
			true
		);
		expect(
			insertedAssertions.every(
				(row) =>
					row.status === 'passed' || row.status === 'failed' || row.status === 'skipped'
			)
		).toBe(true);
	});

	it('loads eval runs and assertions for a set of turn runs', async () => {
		const supabase = createSupabaseMock({
			chat_prompt_eval_runs: [
				{
					id: 'eval-2',
					turn_run_id: 'run-2',
					scenario_slug: 'workspace.my_projects_status',
					scenario_version: '1',
					runner_type: 'admin_manual',
					status: 'failed',
					created_at: '2026-04-03T12:00:02.000Z'
				},
				{
					id: 'eval-1',
					turn_run_id: 'run-1',
					scenario_slug: 'project.named_status',
					scenario_version: '1',
					runner_type: 'admin_manual',
					status: 'passed',
					created_at: '2026-04-03T12:00:01.000Z'
				}
			],
			chat_prompt_eval_assertions: [
				{
					id: 'assert-1',
					eval_run_id: 'eval-1',
					assertion_key: 'first_lane_matches',
					status: 'passed',
					created_at: '2026-04-03T12:00:01.100Z'
				},
				{
					id: 'assert-2',
					eval_run_id: 'eval-2',
					assertion_key: 'observed_op:util.workspace.overview',
					status: 'failed',
					created_at: '2026-04-03T12:00:02.100Z'
				}
			]
		});

		const loaded = await loadPromptEvalResultsForTurnRuns(supabase, ['run-1', 'run-2']);

		expect(loaded.evalRuns.map((row) => row.id)).toEqual(['eval-2', 'eval-1']);
		expect(loaded.assertions.map((row) => row.id)).toEqual(['assert-1', 'assert-2']);
	});

	it('normalizes blank runner types back to admin_manual', () => {
		expect(normalizePromptEvalRunnerType(undefined)).toBe('admin_manual');
		expect(normalizePromptEvalRunnerType('')).toBe('admin_manual');
		expect(normalizePromptEvalRunnerType(' nightly_batch ')).toBe('nightly_batch');
	});
});
