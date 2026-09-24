// apps/worker/tests/agenticChatReadToolStorageProjection.test.ts
//
// The read-tool runner stores the pass-through storage projection in every
// durable sink (ledger row, tool_result event, stream projection, terminal
// record) while the model still receives the full result for the turn.
// Arguments are stored as written: the ledger row and the tool_call event keep
// the real query and goal (Research Log and the live tool chips read them).
import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import { AgenticChatReadToolRunner } from '../src/workers/agentic-chat/turn/read-tool-runner';
import {
	type TerminalContextState,
	emptyProjection,
	toProjectionJson
} from '../src/workers/agentic-chat/turn/turn-run';
import type { AgenticChatReadToolExecutionV1 } from '../src/workers/agentic-chat/tools/tool-execution';

const TURN_RUN_ID = '11111111-1111-4111-8111-111111111111';

function execution(result: JsonObject): AgenticChatReadToolExecutionV1 {
	return {
		result,
		executionTimeMs: 50,
		tokensConsumed: null,
		affectedEntities: [],
		toolCategory: 'read',
		resultCount: null,
		zeroResult: null,
		requiresUserAction: null
	};
}

async function runRead(
	toolName: string,
	result: JsonObject,
	progress: Array<{ message: string; data: JsonObject }> = [],
	args: JsonObject = { url: 'https://shop.example' },
	validationFailure?: { error: string; toolCategory: string | null }
) {
	const projection = emptyProjection();
	const published: Array<{ eventType: string; currentActivity: string; eventPayload: any }> = [];
	const services = {
		assertCurrentReadToolFence: vi.fn(async () => undefined),
		startSemantic: vi.fn((_input, state, step) => {
			published.push(step);
			state.semanticEvents.push({ ...step.eventPayload, event_type: step.eventType });
			return { enqueued: Promise.resolve(), accepted: Promise.resolve() };
		}),
		publishSemantic: vi.fn(async (_input, state, step) => {
			published.push(step);
			state.currentActivity = step.currentActivity;
			state.semanticEvents.push({ ...step.eventPayload, event_type: step.eventType });
		}),
		observeToolExecution: vi.fn(),
		persistSessionHandoff: vi.fn()
	};
	const persistRead = vi.fn(async () => undefined);
	const persistFailure = vi.fn(async () => undefined);
	const readTool = {
		execute: vi.fn(async (input: any) => {
			for (const step of progress) input.onProgress?.(step);
			return execution(result);
		})
	};
	const terminalContext: TerminalContextState = {
		contextShift: null,
		toolExecutions: [],
		nextToolSequenceIndex: 1,
		toolExecutionSequenceByCallId: new Map(),
		toolRoundCount: 0,
		permanentMutationFailures: { byTool: new Map(), byCall: new Map() }
	};
	const runner = new AgenticChatReadToolRunner(
		{ readTool, toolExecutions: { persistRead, persistFailure } } as any,
		services as any
	);
	const returned = await runner.execute(
		{
			job: { log: vi.fn(async () => undefined) },
			executionInput: {
				claim: {
					turnRunId: TURN_RUN_ID,
					queueJobId: '22222222-2222-4222-8222-222222222222',
					userId: '33333333-3333-4333-8333-333333333333',
					sessionId: '44444444-4444-4444-8444-444444444444',
					executionGeneration: 1
				},
				streamRunId: 'stream-1',
				clientTurnId: 'client-1'
			},
			processingToken: 'token-1',
			projection,
			terminalContext,
			markToolExecution: vi.fn()
		} as any,
		{
			type: 'read_tool',
			callTransitionId: '55555555-5555-4555-8555-555555555555',
			resultTransitionId: '66666666-6666-4666-8666-666666666666',
			providerToolCallId: `call-${toolName}`,
			toolName,
			arguments: args,
			...(validationFailure ? { validationFailure } : {})
		} as any,
		1,
		{} as any,
		new AbortController().signal
	);
	// Progress publications are fire-and-forget; let them land.
	await new Promise((resolve) => setImmediate(resolve));
	return {
		returned: returned as any,
		ledger: (persistRead.mock.calls[0] as any)?.[0].execution.result,
		ledgerArguments: ((persistRead.mock.calls[0] ?? persistFailure.mock.calls[0]) as any)[0]
			.arguments,
		readInput: (readTool.execute.mock.calls[0] as any)?.[0],
		published,
		projection: toProjectionJson(projection),
		terminal: terminalContext.toolExecutions[0]?.result.result
	};
}

describe('read-tool runner storage projection', () => {
	it('stores a content-free calendar trace in every sink while the model reads the full result', async () => {
		const full = {
			events: [
				{
					source: 'google',
					external_event_id: 'g-1',
					title: 'Therapy with Dr. Reyes',
					start_at: '2026-09-26T14:00:00Z',
					end_at: '2026-09-26T15:00:00Z',
					event: {
						summary: 'Therapy with Dr. Reyes',
						description: 'Bring the intake form',
						start: { dateTime: '2026-09-26T14:00:00Z' }
					}
				}
			],
			google_event_count: 1,
			merged_event_count: 1
		};
		const run = await runRead('list_calendar_events', full);
		expect(run.returned.execution.result).toBe(full);
		const toolResult = run.published.find((step) => step.eventType === 'tool_result');
		const sinks = [
			run.ledger,
			toolResult?.eventPayload.result.result,
			run.terminal,
			(run.projection.semantic_events as any[]).find(
				(event) => event.event_type === 'tool_result'
			)?.result.result
		];
		for (const stored of sinks) {
			expect(stored).toMatchObject({
				content_redacted: true,
				events: [{ source: 'google', external_event_id: 'g-1', all_day: false }]
			});
			expect(JSON.stringify(stored)).not.toContain('Reyes');
			expect(JSON.stringify(stored)).not.toContain('intake form');
		}
	});

	it('keeps workspace reads as they are', async () => {
		const full = { task: { id: 't-1', title: 'Draft the pitch deck' } };
		const run = await runRead('get_onto_task_details', full);
		expect(run.ledger).toBe(full);
		expect(run.returned.execution.result).toBe(full);
	});

	it('drops page text from stored web_navigate progress and results', async () => {
		const full = {
			outcome: 'found',
			start_url: 'https://shop.example',
			answer_page: {
				url: 'https://shop.example/refunds',
				title: 'Refunds',
				content: 'Refunds within 30 days of delivery'
			},
			path: [],
			visited_urls: ['https://shop.example']
		};
		const run = await runRead('web_navigate', full, [
			{
				message: 'Jev: not here (4%) → "Help with my order" (91%) · 310ms',
				data: {
					kind: 'decided',
					page: 1,
					url: 'https://shop.example',
					answer: 0.04,
					next: {
						label: 'Help with my order',
						url: 'https://shop.example/refunds',
						probability: 0.91
					},
					alternatives: [],
					ms: 310
				}
			}
		]);
		expect(run.returned.execution.result).toBe(full);
		const progress = run.published.find((step) => step.eventType === 'tool_progress');
		expect(progress?.currentActivity).toBe('Jev: not here (4%) → next link (91%) · 310ms');
		expect(progress?.eventPayload.message).toBe(progress?.currentActivity);
		const stored = JSON.stringify([run.ledger, run.published, run.projection]);
		expect(stored).not.toContain('Help with my order');
		expect(stored).not.toContain('within 30 days');
		expect(run.ledger).toMatchObject({
			content_redacted: true,
			answer_page: {
				url: 'https://shop.example/refunds',
				title: 'Refunds',
				content_chars: 34
			}
		});
	});

	it('stores the real arguments in the ledger, the tool_call event, and the stream projection', async () => {
		const args = { query: 'custody lawyer near Glen Burnie', max_results: 4 };
		const run = await runRead('web_search', { results: [] }, [], args);
		expect(run.readInput.arguments).toBe(args);
		expect(run.returned.arguments).toBe(args);
		const call = run.published.find((step) => step.eventType === 'tool_call');
		const projectedCall = (run.projection.semantic_events as any[]).find(
			(event) => event.event_type === 'tool_call'
		);
		for (const stored of [
			run.ledgerArguments,
			JSON.parse(call?.eventPayload.tool_call.function.arguments),
			JSON.parse(projectedCall?.tool_call.function.arguments)
		]) {
			expect(stored).toEqual(args);
		}
		expect(run.ledger).toMatchObject({ content_redacted: true });
	});

	it('stores a rejected call of a pass-through tool with its real arguments', async () => {
		const args = { url: 'https://shop.example', goal: 'my refund for order 4417' };
		const run = await runRead('web_navigate', {}, [], args, {
			error: 'max_pages must be at most 8',
			toolCategory: null
		});
		expect(run.ledgerArguments).toEqual(args);
		const call = run.published.find((step) => step.eventType === 'tool_call');
		expect(JSON.parse(call?.eventPayload.tool_call.function.arguments)).toEqual(args);
	});
});
