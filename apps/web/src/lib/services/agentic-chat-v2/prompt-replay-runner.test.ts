// apps/web/src/lib/services/agentic-chat-v2/prompt-replay-runner.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uuidMock } = vi.hoisted(() => ({
	uuidMock: vi.fn()
}));

vi.mock('uuid', () => ({
	v4: uuidMock
}));

import { replayAndEvaluatePromptScenario } from './prompt-replay-runner';

type TableName =
	| 'chat_turn_runs'
	| 'chat_prompt_snapshots'
	| 'chat_turn_events'
	| 'chat_tool_executions'
	| 'chat_messages'
	| 'chat_prompt_eval_runs'
	| 'chat_prompt_eval_assertions';

type FixtureState = Record<TableName, Record<string, unknown>[]>;

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
		if (mode === 'many') return Promise.resolve({ data: rows, error: null });
		if (mode === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null });
		return Promise.resolve({
			data: rows[0] ?? null,
			error: rows[0] ? null : { message: 'Not found' }
		});
	};

	const sortRows = (
		rows: Record<string, unknown>[],
		field: string,
		ascending = true
	): Record<string, unknown>[] =>
		[...rows].sort((left, right) => {
			const leftValue = left[field];
			const rightValue = right[field];
			if (leftValue === rightValue) return 0;
			return ascending
				? String(leftValue ?? '').localeCompare(String(rightValue ?? ''))
				: String(rightValue ?? '').localeCompare(String(leftValue ?? ''));
		});

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
			update(patch: Record<string, unknown>) {
				return {
					eq: (field: string, value: unknown) => {
						workingRows = workingRows.filter((row) => row[field] === value);
						return {
							eq: (field2: string, value2: unknown) => {
								const matchedRows = workingRows.filter(
									(row) => row[field2] === value2
								);
								for (const row of matchedRows) {
									Object.assign(row, patch);
								}
								return Promise.resolve({ data: matchedRows, error: null });
							}
						};
					}
				};
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
		getState(table: TableName) {
			return state[table];
		},
		getInserted(table: TableName) {
			return inserted[table] ?? [];
		}
	};
}

describe('prompt replay runner', () => {
	beforeEach(() => {
		uuidMock.mockReset();
		uuidMock.mockImplementationOnce(() => 'stream-run-1');
		uuidMock.mockImplementationOnce(() => 'client-turn-suffix-1');
		uuidMock.mockImplementationOnce(() => 'eval-run-1');
		uuidMock.mockImplementationOnce(() => 'assert-1');
		uuidMock.mockImplementationOnce(() => 'assert-2');
		uuidMock.mockImplementation(() => 'uuid-fallback');
	});

	it('replays a scenario through the live stream contract and persists eval results', async () => {
		const supabase = createSupabaseMock({
			chat_turn_runs: [
				{
					id: 'turn-run-1',
					session_id: 'session-1',
					user_id: 'admin-1',
					stream_run_id: 'stream-run-1',
					source: 'live_ui',
					status: 'completed',
					finished_reason: 'stop',
					first_lane: 'overview',
					first_skill_path: null,
					first_canonical_op: 'util.project.overview',
					validation_failure_count: 0,
					assistant_message_id: 'assistant-message-1',
					finished_at: '2026-04-03T12:00:05.000Z'
				}
			],
			chat_prompt_snapshots: [
				{
					id: 'snapshot-1',
					turn_run_id: 'turn-run-1',
					approx_prompt_tokens: 900,
					rendered_dump_text: 'FASTCHAT V2 PROMPT SNAPSHOT'
				}
			],
			chat_turn_events: [
				{
					id: 'event-1',
					turn_run_id: 'turn-run-1',
					event_type: 'prompt_snapshot_created',
					sequence_index: 1,
					payload: {}
				},
				{
					id: 'event-2',
					turn_run_id: 'turn-run-1',
					event_type: 'tool_result_received',
					sequence_index: 2,
					payload: { canonical_op: 'util.project.overview' }
				},
				{
					id: 'event-3',
					turn_run_id: 'turn-run-1',
					event_type: 'done_emitted',
					sequence_index: 3,
					payload: {}
				}
			],
			chat_tool_executions: [
				{
					id: 'tool-1',
					turn_run_id: 'turn-run-1',
					sequence_index: 1,
					gateway_op: 'util.project.overview',
					success: true
				}
			],
			chat_messages: [
				{
					id: 'assistant-message-1',
					content: 'I checked 9takes and summarized the active tasks and recent changes.'
				}
			]
		});

		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				[
					'data: {"type":"session","session":{"id":"session-1"}}',
					'',
					'data: {"type":"text_delta","content":"I checked 9takes. "}',
					'',
					'data: {"type":"done","finished_reason":"stop"}',
					''
				].join('\n'),
				{
					status: 200,
					headers: { 'content-type': 'text/event-stream' }
				}
			)
		);

		const result = await replayAndEvaluatePromptScenario({
			fetch: fetchMock,
			supabase,
			userId: 'admin-1',
			scenarioSlug: 'project.named_status',
			source: 'admin_replay'
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/agent/v2/stream',
			expect.objectContaining({
				method: 'POST'
			})
		);
		expect(result.streamRunId).toBe('stream-run-1');
		expect(result.sessionId).toBe('session-1');
		expect(result.streamSummary).toMatchObject({
			sessionId: 'session-1',
			assistantText: 'I checked 9takes.',
			finishedReason: 'stop'
		});
		expect(result.eval.result.status).toBe('passed');
		expect(supabase.getState('chat_turn_runs')[0]).toMatchObject({
			id: 'turn-run-1',
			source: 'admin_replay'
		});
		expect(supabase.getInserted('chat_prompt_eval_runs')).toHaveLength(1);
		expect(supabase.getInserted('chat_prompt_eval_assertions').length).toBeGreaterThan(0);
	});
});
