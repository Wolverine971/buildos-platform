// apps/worker/tests/chatNextStepGeneration.test.ts
//
// The next step that follows a project chat: it is written from the changes the chat
// saved (its write receipts in chat_tool_executions), skipped when the chat saved
// nothing, and never replaces a next step the user wrote.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetJSONResponse = vi.hoisted(() => vi.fn());
const mockSupabaseFrom = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/supabase', () => ({ supabase: { from: mockSupabaseFrom } }));
vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(function () {
		return { getJSONResponse: mockGetJSONResponse };
	})
}));
vi.mock('../src/lib/errorLogger', () => ({ logWorkerError: vi.fn() }));

import { processSessionActivityAndNextSteps } from '../src/workers/chat/chatSessionActivityProcessor';

const PROJECT_ID = 'project-1';
const TASK_ID = '11111111-1111-4111-8111-111111111111';

type Call = [method: string, args: unknown[]];
type Result = { data: unknown; error: { message: string } | null; count?: number | null };

/** A PostgREST-style query: every filter returns the query, and awaiting it gives the result. */
function query(result: (calls: Call[]) => Result, calls: Call[] = []) {
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) {
		builder[method] = (...args: unknown[]) => {
			calls.push([method, args]);
			return builder;
		};
	}
	builder.single = async () => result(calls);
	builder.maybeSingle = async () => result(calls);
	builder.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
		Promise.resolve(result(calls)).then(resolve, reject);
	return builder;
}

function writeExecution(entity: Record<string, unknown>, tool = 'create_onto_task') {
	return {
		tool_name: tool,
		tool_category: 'ontology_action',
		success: true,
		affected_entities: [entity],
		created_at: '2026-11-14T15:00:00.000Z'
	};
}

describe('processSessionActivityAndNextSteps', () => {
	let session: Record<string, unknown> | null;
	let executions: Array<Record<string, unknown>>;
	let executionsError: { message: string } | null;
	let project: Record<string, unknown> | null;
	/** Rows the guarded next-step update reports as written. */
	let updatedCount: number;
	let executionCalls: Call[];
	let projectUpdates: Array<{
		payload: Record<string, unknown>;
		options: unknown;
		calls: Call[];
	}>;
	let tablesRead: string[];

	beforeEach(() => {
		vi.clearAllMocks();
		session = {
			id: 'session-1',
			context_type: 'project',
			entity_id: PROJECT_ID,
			user_id: 'user-1'
		};
		executions = [
			writeExecution({
				kind: 'task',
				id: TASK_ID,
				title: 'Outline chapter 3',
				projectId: PROJECT_ID,
				operation: 'created'
			})
		];
		executionsError = null;
		project = {
			name: 'Book project',
			description: null,
			type_key: 'project.creative.book',
			state_key: 'active',
			next_step_short: 'Draft the one-page book overview.',
			next_step_long: null,
			next_step_source: 'ai'
		};
		updatedCount = 1;
		executionCalls = [];
		projectUpdates = [];
		tablesRead = [];

		mockGetJSONResponse.mockResolvedValue({
			nextStepShort: 'Write the chapter 3 outline.',
			nextStepLong: `Start with [[task:${TASK_ID}|Outline chapter 3]].`
		});

		mockSupabaseFrom.mockImplementation((table: string) => {
			tablesRead.push(table);
			switch (table) {
				case 'chat_sessions':
					return query(() => ({
						data: session,
						error: session ? null : { message: 'none' }
					}));
				case 'chat_tool_executions':
					return query(
						() =>
							executionsError
								? { data: null, error: executionsError }
								: { data: executions, error: null },
						executionCalls
					);
				case 'onto_projects':
					return {
						select: () => query(() => ({ data: project, error: null })),
						update: (payload: Record<string, unknown>, options?: unknown) => {
							const calls: Call[] = [];
							projectUpdates.push({ payload, options, calls });
							return query(
								() => ({ data: null, count: updatedCount, error: null }),
								calls
							);
						}
					};
				case 'onto_tasks':
					// The link check asks for ids; the "recently completed" read gets none.
					return query((calls) => ({
						data: calls.some(([method, args]) => method === 'in' && args[0] === 'id')
							? [{ id: TASK_ID }]
							: [],
						error: null
					}));
				case 'onto_goals':
				case 'onto_project_logs':
				case 'onto_documents':
				case 'onto_edges':
					return query(() => ({ data: [], error: null }));
				case 'chat_messages':
					return query(() => ({
						data: [{ role: 'user', content: 'Add a task to outline chapter 3.' }],
						error: null
					}));
				default:
					// chat_operations (never had a row) and onto_project_logs inserts are gone.
					throw new Error(`Unexpected table: ${table}`);
			}
		});
	});

	it('writes the next step from the changes the chat saved', async () => {
		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result).toEqual({ nextStepUpdated: true, projectId: PROJECT_ID });

		// This chat's successful writes only: reads and failed executions carry no receipt.
		expect(executionCalls).toEqual(
			expect.arrayContaining([
				['eq', ['session_id', 'session-1']],
				['eq', ['success', true]],
				['or', ['tool_category.is.null,tool_category.neq.read']]
			])
		);
		expect(tablesRead).not.toContain('chat_operations');

		const llmArgs = mockGetJSONResponse.mock.calls[0][0];
		expect(llmArgs.operationType).toBe('chat_project_next_step');
		expect(llmArgs.reasoning).toEqual({ enabled: false });
		expect(llmArgs.userPrompt).toContain(
			`## Recent Changes in This Session\n- created [[task:${TASK_ID}|Outline chapter 3]]`
		);

		expect(projectUpdates).toHaveLength(1);
		expect(projectUpdates[0]!.payload).toMatchObject({
			next_step_short: 'Write the chapter 3 outline.',
			next_step_long: `Start with [[task:${TASK_ID}|Outline chapter 3]].`,
			next_step_source: 'ai'
		});
		// The write itself refuses a user-written next step (and keeps null sources).
		expect(projectUpdates[0]!.calls).toContainEqual([
			'or',
			['next_step_source.is.null,next_step_source.neq.user']
		]);
		// Production PostgREST rejects an update with an `or` filter that returns rows, so
		// the write counts rows instead of selecting them.
		expect(projectUpdates[0]!.options).toEqual({ count: 'exact' });
		expect(projectUpdates[0]!.calls.map(([method]) => method)).not.toContain('select');
	});

	it('makes no model call and writes nothing when the chat saved no changes', async () => {
		executions = [];

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result).toEqual({
			nextStepUpdated: false,
			projectId: PROJECT_ID,
			skippedReason: 'no_saved_changes'
		});
		expect(mockGetJSONResponse).not.toHaveBeenCalled();
		expect(tablesRead).toEqual(['chat_sessions', 'chat_tool_executions']);
	});

	it('treats a chat whose executions touched no record as having saved nothing', async () => {
		// A successful write tool call that changed nothing has an empty receipt.
		executions = [{ ...writeExecution({}), affected_entities: [] }];

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result.skippedReason).toBe('no_saved_changes');
		expect(mockGetJSONResponse).not.toHaveBeenCalled();
	});

	it("does not count changes saved to another project as this project's", async () => {
		executions = [
			writeExecution({
				kind: 'task',
				id: TASK_ID,
				title: 'Task in another project',
				projectId: 'project-2',
				operation: 'created'
			})
		];

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result.skippedReason).toBe('no_saved_changes');
		expect(mockGetJSONResponse).not.toHaveBeenCalled();
		expect(projectUpdates).toHaveLength(0);
	});

	it('never overwrites a next step the user wrote, and spends no model call on it', async () => {
		project = { ...project, next_step_source: 'user' };

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result).toEqual({
			nextStepUpdated: false,
			projectId: PROJECT_ID,
			skippedReason: 'not_generated'
		});
		expect(mockGetJSONResponse).not.toHaveBeenCalled();
		expect(projectUpdates).toHaveLength(0);
	});

	it('reports no update when the user wrote a next step while the model was running', async () => {
		// The guarded write matched no row.
		updatedCount = 0;

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(mockGetJSONResponse).toHaveBeenCalledTimes(1);
		expect(projectUpdates).toHaveLength(1);
		expect(result.nextStepUpdated).toBe(false);
	});

	it('drops a link the model invented instead of saving a dead reference', async () => {
		mockGetJSONResponse.mockResolvedValueOnce({
			nextStepShort: 'Review the template.',
			nextStepLong:
				'Open [[document:99999999-9999-4999-8999-999999999999|Story Blueprint Template]] first.'
		});

		await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(projectUpdates[0]!.payload.next_step_long).toBe(
			'Open Story Blueprint Template first.'
		);
	});

	it('does not fail the caller when the saved changes cannot be read', async () => {
		executionsError = { message: 'statement timeout' };

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result).toEqual({
			nextStepUpdated: false,
			projectId: PROJECT_ID,
			skippedReason: 'not_generated'
		});
		expect(mockGetJSONResponse).not.toHaveBeenCalled();
	});

	it('skips a chat that is not in a project without reading its executions', async () => {
		session = { ...session, context_type: 'global', entity_id: null };

		const result = await processSessionActivityAndNextSteps('session-1', 'user-1');

		expect(result).toEqual({
			nextStepUpdated: false,
			projectId: null,
			skippedReason: 'not_project_session'
		});
		expect(tablesRead).toEqual(['chat_sessions']);
	});
});
