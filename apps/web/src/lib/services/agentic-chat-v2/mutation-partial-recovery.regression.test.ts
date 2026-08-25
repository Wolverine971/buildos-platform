// apps/web/src/lib/services/agentic-chat-v2/mutation-partial-recovery.regression.test.ts
//
// Deterministic reproduction of the 2026-07-31 Phase 1 gate failure
// `research-turn-finalizes` / repetition 3: after seven successful reads, the
// final tool-enabled pass streamed a 1,262-character answer but no terminal
// event; both attempts exhausted, the runtime discarded the partial because
// the turn's conditional "add anything untracked" made it mutation-requested,
// and the user got a generic stream error with no assistant message.
//
// The corrected boundary: a mutation-requested turn recovers the partial when
// ZERO successful writes exist (nothing half-done can be misreported),
// mutation-outcome integrity rewrites or discloses unexecuted-write claims,
// and the turn completes as `completed_degraded`. Once a write HAS succeeded,
// the turn still fails loudly — and the terminal error now carries the true
// tool counters and the recovery decision for the route to persist.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { materializeGatewayTools } from '@buildos/agentic-chat-runtime/catalog';
import { streamFastChat } from './stream-orchestrator/index';
import { LlmStreamPassTerminalError } from './stream-orchestrator/llm-pass-runner';

const PROJECT_ID = 'b7f5c9e2-4a31-4d0a-9be6-0f2f8f4f9d3a';
const MESSAGE =
	'Look at the Q3 roadmap, check what tasks exist, recommend what I should work on next, and add a task for anything untracked.';
const CONDITIONAL_CREATE_CONTRACT = {
	version: 1 as const,
	source: 'declared' as const,
	outcomes: [
		{
			id: 'capture-untracked-task',
			action: 'create' as const,
			entityKind: 'task' as const,
			targetIds: [],
			requiredFields: ['title'],
			minimumSuccessfulEffects: 1
		}
	]
};

// >= 120 chars and >= 18 words, with no write-success claim.
const USABLE_PARTIAL =
	'Based on the Q3 roadmap and the current task list, the highest-leverage next step is the launch checklist: the beta email and the pricing page are both unowned, and the roadmap lists them as launch blockers for the September milestone.';

// Same shape, but it claims a write that never executed.
const CLAIMING_PARTIAL =
	"I've created a task for the pricing page work so nothing is untracked going forward. The beta email already has an owner and the launch checklist is otherwise complete, so the September milestone is fully covered by existing tasks.";

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

function buildLlm(params: { firstRoundToolCall: ChatToolCall; partialText: string }) {
	let invocation = 0;
	return {
		streamText: vi.fn(async function* () {
			invocation += 1;
			if (invocation === 1) {
				yield { type: 'tool_call', tool_call: params.firstRoundToolCall };
				yield { type: 'done', finished_reason: 'tool_calls' };
				return;
			}
			// Every later attempt streams the partial and ends WITHOUT a terminal
			// event — the observed transport failure shape.
			yield { type: 'text', content: params.partialText };
		})
	} as any;
}

function runConditionalMutationTurn(params: {
	llm: any;
	toolExecutor: (call: ChatToolCall) => Promise<ChatToolResult>;
	toolNames: string[];
}) {
	return streamFastChat({
		llm: params.llm,
		userId: 'synthetic-user',
		sessionId: 'synthetic-session',
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		history: [],
		message: MESSAGE,
		initialTurnContract: CONDITIONAL_CREATE_CONTRACT,
		tools: tools(params.toolNames),
		toolExecutor: vi.fn(params.toolExecutor),
		onDelta: async () => {}
	});
}

const readToolExecutor = async (call: ChatToolCall): Promise<ChatToolResult> => ({
	tool_call_id: call.id,
	success: true,
	result: {
		tasks: [{ id: 'task-1', title: 'Ship the beta email', state_key: 'todo' }],
		message: 'Found 1 ontology task.'
	}
});

describe('mutation-requested transport partial recovery (incident 2026-07-31)', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('recovers the partial as completed_degraded when reads succeeded and no write executed', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const llm = buildLlm({
			firstRoundToolCall: toolCall('list_onto_tasks', { project_id: PROJECT_ID }, 'read-1'),
			partialText: USABLE_PARTIAL
		});

		const resultPromise = runConditionalMutationTurn({
			llm,
			toolExecutor: readToolExecutor,
			toolNames: ['list_onto_tasks', 'create_onto_task']
		});
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result.completionOutcome?.status).toBe('completed_degraded');
		expect(result.finalAssistantText).toContain(USABLE_PARTIAL);
		// The unexecuted conditional write is disclosed, not papered over.
		expect(result.finalAssistantText).toMatch(/has not run yet|Still unfinished/);
		expect(result.finishedReason).toBe('synthesis_recovered');
		expect(result.llmPasses?.at(-1)?.recoveredAsDegradedCompletion).toBe(true);
	});

	it('rewrites a recovered partial that claims a write which never executed', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const llm = buildLlm({
			firstRoundToolCall: toolCall('list_onto_tasks', { project_id: PROJECT_ID }, 'read-1'),
			partialText: CLAIMING_PARTIAL
		});

		const resultPromise = runConditionalMutationTurn({
			llm,
			toolExecutor: readToolExecutor,
			toolNames: ['list_onto_tasks', 'create_onto_task']
		});
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result.completionOutcome?.status).toBe('completed_degraded');
		expect(result.finalAssistantText).not.toContain("I've created a task");
		expect(result.finalAssistantText).toMatch(/no write call ran|has not run yet/i);
	});

	it('still fails loudly after a successful write, with counters and the recovery decision stamped', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const llm = buildLlm({
			firstRoundToolCall: toolCall(
				'create_onto_task',
				{ project_id: PROJECT_ID, title: 'Own the pricing page' },
				'write-1'
			),
			partialText: USABLE_PARTIAL
		});

		const resultPromise = runConditionalMutationTurn({
			llm,
			toolExecutor: async (call) => ({
				tool_call_id: call.id,
				success: true,
				result: {
					task: { id: 'task-2', title: 'Own the pricing page' },
					message: 'Created ontology task "Own the pricing page"'
				}
			}),
			toolNames: ['list_onto_tasks', 'create_onto_task']
		});
		resultPromise.catch(() => {});
		await vi.runAllTimersAsync();

		const error = await resultPromise.then(
			() => {
				throw new Error('expected the turn to fail');
			},
			(caught) => caught
		);

		expect(error).toBeInstanceOf(LlmStreamPassTerminalError);
		const terminal = error as LlmStreamPassTerminalError;
		expect(terminal.recoveryBlockedReason).toBe('mutation_write_executed');
		expect(terminal.discardedPartialChars).toBeGreaterThan(0);
		expect(terminal.turnProgress?.toolCallsMade).toBe(1);
		expect(terminal.turnProgress?.toolExecutionCount).toBe(1);
		expect(terminal.turnProgress?.toolRounds).toBeGreaterThanOrEqual(1);
	});
});
