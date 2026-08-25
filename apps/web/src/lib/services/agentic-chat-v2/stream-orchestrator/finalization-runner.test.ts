// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution, LLMStreamPassMetadata } from './shared';
import {
	buildProjectCreateSuccessConfirmation,
	resolveLengthContinuation,
	runCancellationFinalization,
	runNoToolCallFinalization,
	runNoToolSynthesisFinalization,
	runTerminalFinalization
} from './finalization-runner';

function toolCall(name: string, args: Record<string, unknown> = {}, id = name): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function execution(params: {
	call: ChatToolCall;
	result?: unknown;
	success?: boolean;
	error?: string;
}): FastToolExecution {
	const result: ChatToolResult = {
		tool_call_id: params.call.id,
		result: params.result ?? null,
		success: params.success ?? true,
		error: params.error
	};
	return { toolCall: params.call, result };
}

describe('buildProjectCreateSuccessConfirmation', () => {
	it('grounds the confirmation in the submitted payload and durable receipt', () => {
		const createCall = toolCall('create_onto_project', {
			project: { name: 'The Glass Harbor — Book Development' },
			context_document: { title: 'START HERE — The Glass Harbor' },
			entities: [
				{ kind: 'goal', name: 'Complete a submission-ready novel draft' },
				{ kind: 'plan', name: 'Phase 1 — Story Foundation' },
				{ kind: 'plan', name: 'Phase 2 — Character Architecture' },
				{ kind: 'plan', name: 'Phase 3 — Draft and Revise' },
				{ kind: 'task', title: 'Write the one-sentence story premise', state_key: 'ready' },
				{ kind: 'task', title: 'Draft chapter one', state_key: 'backlog' },
				{ kind: 'document', title: 'Story Bible' },
				{ kind: 'document', title: 'Character Bible' }
			],
			relationships: [{}, {}, {}, {}]
		});
		const confirmation = buildProjectCreateSuccessConfirmation([
			execution({
				call: createCall,
				result: {
					project_id: 'b50d7734-40d7-4232-88b6-b02274097940',
					counts: { goals: 1, plans: 3, tasks: 2, documents: 3, edges: 4 }
				}
			})
		]);

		expect(confirmation).toContain(
			'Created **The Glass Harbor — Book Development** successfully.'
		);
		expect(confirmation).toContain('Project ID: `b50d7734-40d7-4232-88b6-b02274097940`');
		expect(confirmation).toContain(
			'Structure: 1 goal, 3 plans, 2 tasks, 3 documents, and 4 relationships'
		);
		expect(confirmation).toContain('**Complete a submission-ready novel draft**');
		expect(confirmation).toContain('- Phase 1 — Story Foundation');
		expect(confirmation).toContain('- Phase 2 — Character Architecture');
		expect(confirmation).toContain('- Phase 3 — Draft and Revise');
		expect(confirmation).toContain('- Story Bible');
		expect(confirmation).toContain('- START HERE — The Glass Harbor');
		expect(confirmation).toContain('Start with **Write the one-sentence story premise**.');
	});

	it('does not manufacture a confirmation without a durable project ID', () => {
		expect(
			buildProjectCreateSuccessConfirmation([
				execution({
					call: toolCall('create_onto_project', { project: { name: 'Unconfirmed' } }),
					result: { ok: true }
				})
			])
		).toBeNull();
	});
});

describe('resolveLengthContinuation', () => {
	it('requests a continuation for length-truncated text-only passes', () => {
		const metadata: LLMStreamPassMetadata = { pass: 1, finishedReason: 'length' };

		const decision = resolveLengthContinuation({
			llmPassMeta: metadata,
			pendingToolCallCount: 0,
			assistantBuffer: ' Part one. ',
			carriedTruncatedText: 'Intro.',
			lengthContinuationCount: 0,
			maxLengthContinuations: 2,
			noToolSynthesisPass: true
		});

		expect(decision).toMatchObject({
			action: 'continue',
			nextLengthContinuationCount: 1,
			nextCarriedTruncatedText: 'Intro. Part one. ',
			partialAssistantText: 'Part one.',
			forceNoToolSynthesisPass: true
		});
		expect(decision.action === 'continue' ? decision.systemMessage : '').toContain('cut off');
	});

	it('flags exhaustion after the continuation budget is spent', () => {
		const decision = resolveLengthContinuation({
			llmPassMeta: { pass: 3, finishedReason: 'length' },
			pendingToolCallCount: 0,
			assistantBuffer: 'Still going.',
			carriedTruncatedText: '',
			lengthContinuationCount: 2,
			maxLengthContinuations: 2,
			noToolSynthesisPass: false
		});

		expect(decision).toEqual({ action: 'exhausted', answerTruncated: true });
	});
});

describe('runNoToolSynthesisFinalization', () => {
	it('retries once when a forced synthesis pass still asks for tools', async () => {
		const result = await runNoToolSynthesisFinalization({
			assistantBuffer: '',
			carriedTruncatedText: '',
			suppressedNoToolSynthesisToolCallCount: 1,
			noToolSynthesisRetryCount: 0,
			contextType: 'global',
			toolExecutions: [],
			latestUserText: 'Summarize this.',
			assistantText: '',
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(result).toMatchObject({
			action: 'retry',
			nextRetryCount: 1,
			forceNoToolSynthesisPass: true
		});
		expect(result.action === 'retry' ? result.systemMessage : '').toContain(
			'tools are unavailable'
		);
	});

	it('finalizes a successful forced synthesis pass', async () => {
		const emitAssistantRemainder = vi.fn();
		const observeSupervisor = vi.fn();

		const result = await runNoToolSynthesisFinalization({
			assistantBuffer: 'Here is the final answer.',
			carriedTruncatedText: '',
			suppressedNoToolSynthesisToolCallCount: 0,
			noToolSynthesisRetryCount: 0,
			contextType: 'global',
			toolExecutions: [],
			latestUserText: 'Summarize this.',
			assistantText: '',
			emitAssistantRemainder,
			observeSupervisor
		});

		expect(result).toEqual({
			action: 'finalized',
			finalAssistantText: 'Here is the final answer.',
			finishedReason: 'stop'
		});
		expect(emitAssistantRemainder).toHaveBeenCalledWith('Here is the final answer.');
		expect(observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'final_candidate',
				finishedReason: 'stop'
			})
		);
	});

	it('retries a forced synthesis pass that misses an exact option count', async () => {
		const result = await runNoToolSynthesisFinalization({
			assistantBuffer: 'Option 1 — Hide the map. This protects Mara for now.',
			carriedTruncatedText: '',
			suppressedNoToolSynthesisToolCallCount: 0,
			noToolSynthesisRetryCount: 0,
			contextType: 'project',
			toolExecutions: [],
			latestUserText: 'Give me three distinct options for Ilyan.',
			assistantText: '',
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(result).toMatchObject({
			action: 'retry',
			nextRetryCount: 1,
			forceNoToolSynthesisPass: true
		});
		expect(result.action === 'retry' ? result.systemMessage : '').toContain(
			'exactly 3 compact'
		);
	});

	it('retries a complete option set that omits the named subject and story position', async () => {
		const result = await runNoToolSynthesisFinalization({
			assistantBuffer:
				'Option 1 — Hide the map.\nOption 2 — Confess.\nOption 3 — Delay the hearing.',
			carriedTruncatedText: '',
			suppressedNoToolSynthesisToolCallCount: 0,
			noToolSynthesisRetryCount: 0,
			contextType: 'project',
			toolExecutions: [],
			latestUserText:
				'What should happen with Ilyan in chapter 5? Give me three distinct options.',
			assistantText: '',
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(result).toMatchObject({
			action: 'retry',
			nextRetryCount: 1,
			forceNoToolSynthesisPass: true
		});
		const systemMessage = result.action === 'retry' ? result.systemMessage : '';
		expect(systemMessage).toContain('"Ilyan"');
		expect(systemMessage).toContain('"chapter 5"');
	});

	it('finalizes an exact option set that retains its explicit request anchors', async () => {
		const result = await runNoToolSynthesisFinalization({
			assistantBuffer:
				'For Ilyan in Chapter 5:\nOption 1 — Hide the map.\nOption 2 — Confess.\nOption 3 — Delay the hearing.',
			carriedTruncatedText: '',
			suppressedNoToolSynthesisToolCallCount: 0,
			noToolSynthesisRetryCount: 0,
			contextType: 'project',
			toolExecutions: [],
			latestUserText:
				'What should happen with Ilyan in chapter 5? Give me three distinct options.',
			assistantText: '',
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(result).toMatchObject({ action: 'finalized', finishedReason: 'stop' });
	});

	it('reports synthesis_failed instead of a false tool-round limit after retry exhaustion', async () => {
		const result = await runNoToolSynthesisFinalization({
			assistantBuffer: '',
			carriedTruncatedText: '',
			suppressedNoToolSynthesisToolCallCount: 1,
			noToolSynthesisRetryCount: 1,
			contextType: 'project',
			toolExecutions: [],
			latestUserText: 'Create the document.',
			assistantText: '',
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(result).toEqual({
			action: 'failed',
			finishedReason: 'synthesis_failed'
		});
	});
});

describe('runCancellationFinalization', () => {
	it('emits partial assistant text when cancellation happens before tool calls', async () => {
		const emitAssistantRemainder = vi.fn();

		const result = await runCancellationFinalization({
			activePendingToolCallCount: 0,
			activeAssistantBuffer: ' Partial cancelled answer. ',
			assistantText: '',
			finalAssistantText: '',
			emitAssistantRemainder
		});

		expect(result.finalAssistantText).toBe('Partial cancelled answer.');
		expect(emitAssistantRemainder).toHaveBeenCalledWith('Partial cancelled answer.');
	});
});

describe('runTerminalFinalization', () => {
	it('streams tool-limit notices with the same separator as the prior inline path', async () => {
		const emitAssistantDelta = vi.fn();

		const result = await runTerminalFinalization({
			assistantText: 'I found the project.',
			finalAssistantText: '',
			finishedReason: 'tool_call_limit',
			toolLimitNotice: 'I hit the tool-call safety limit.',
			answerTruncated: false,
			latestUserText: 'Summarize the project.',
			toolExecutions: [],
			emitAssistantDelta,
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(emitAssistantDelta).toHaveBeenCalledWith('\n\nI hit the tool-call safety limit.');
		expect(result.finalAssistantText).toBe('I hit the tool-call safety limit.');
		expect(result.finishedReason).toBe('tool_call_limit');
	});

	it('does not emit duplicate remainder text after a tool-limit guard fallback', async () => {
		const readExecution = execution({
			call: toolCall('search_project', { query: 'launch task' }, 'read-1'),
			result: {
				results: [
					{
						id: 'task_1',
						entity_type: 'task',
						title: 'Launch task',
						state_key: 'todo'
					}
				]
			}
		});
		const emitAssistantDelta = vi.fn();
		const emitAssistantRemainder = vi.fn();

		const result = await runTerminalFinalization({
			assistantText: 'I found the project.',
			finalAssistantText: '',
			finishedReason: 'tool_call_limit',
			toolLimitNotice: 'I hit the tool-call safety limit.',
			answerTruncated: false,
			latestUserText: 'Summarize the launch task.',
			toolExecutions: [readExecution],
			emitAssistantDelta,
			emitAssistantRemainder,
			observeSupervisor: vi.fn()
		});

		const emittedDelta = emitAssistantDelta.mock.calls[0]?.[0] ?? '';
		expect(emittedDelta).toContain('\n\nI gathered context before the turn ended.');
		expect(result.finalizationGuardResult).toMatchObject({
			applied: true,
			reason: 'empty_after_reads'
		});
		expect(emitAssistantRemainder).not.toHaveBeenCalled();
	});

	it('applies the incomplete-mutation guard when a requested write never lands', async () => {
		const readExecution = execution({
			call: toolCall('search_project', { query: 'task' }, 'read-1'),
			result: { results: [] }
		});
		const emitAssistantRemainder = vi.fn();
		const observeSupervisor = vi.fn();

		const result = await runTerminalFinalization({
			assistantText: '',
			finalAssistantText: '',
			finishedReason: 'stop',
			toolLimitNotice: null,
			answerTruncated: false,
			latestUserText: 'Mark the task done.',
			mutationRequested: true,
			toolExecutions: [readExecution],
			emitAssistantDelta: vi.fn(),
			emitAssistantRemainder,
			observeSupervisor
		});

		expect(result.finalizationGuardResult).toMatchObject({
			applied: true,
			reason: 'incomplete_mutation_after_reads',
			finishedReason: 'mutation_unfulfilled'
		});
		expect(result.finishedReason).toBe('mutation_unfulfilled');
		expect(result.finalAssistantText).toContain('nothing was updated');
		expect(emitAssistantRemainder).toHaveBeenCalledWith(
			expect.stringContaining('nothing was updated')
		);
		expect(observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'final_candidate',
				finishedReason: 'mutation_unfulfilled'
			})
		);
	});

	it('returns synthesis_empty for generic no-evidence read fallbacks', async () => {
		const readExecution = execution({
			call: toolCall('search_project', { query: 'missing launch note' }, 'read-1'),
			result: { results: [] }
		});
		const emitAssistantRemainder = vi.fn();
		const observeSupervisor = vi.fn();

		const result = await runTerminalFinalization({
			assistantText: '',
			finalAssistantText: '',
			finishedReason: 'stop',
			toolLimitNotice: null,
			answerTruncated: false,
			latestUserText: 'What did you find about the missing launch note?',
			toolExecutions: [readExecution],
			emitAssistantDelta: vi.fn(),
			emitAssistantRemainder,
			observeSupervisor
		});

		expect(result.finishedReason).toBe('synthesis_empty');
		expect(result.finalizationGuardResult).toMatchObject({
			applied: true,
			reason: 'empty_after_reads',
			finishedReason: 'synthesis_empty'
		});
		expect(result.finalAssistantText).toContain(
			'turn ended before a final response was produced'
		);
		expect(emitAssistantRemainder).toHaveBeenCalledWith(
			expect.stringContaining('turn ended before a final response was produced')
		);
		expect(observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'final_candidate',
				finishedReason: 'synthesis_empty'
			})
		);
	});

	it('does not overwrite supervisor questions in terminal finalization', async () => {
		const readExecution = execution({
			call: toolCall('search_project', { query: 'task' }, 'read-1'),
			result: { results: [] }
		});
		const emitAssistantRemainder = vi.fn();

		const result = await runTerminalFinalization({
			assistantText: 'Which task should I update?',
			finalAssistantText: 'Which task should I update?',
			finishedReason: 'supervisor_question',
			toolLimitNotice: null,
			answerTruncated: false,
			latestUserText: 'Mark the task done.',
			toolExecutions: [readExecution],
			emitAssistantDelta: vi.fn(),
			emitAssistantRemainder,
			observeSupervisor: vi.fn()
		});

		expect(result.finalizationGuardResult).toBeUndefined();
		expect(result.finalAssistantText).toBe('Which task should I update?');
		expect(emitAssistantRemainder).not.toHaveBeenCalled();
	});

	it('preserves a length finish reason when the answer exhausted continuation budget', async () => {
		const result = await runTerminalFinalization({
			assistantText: 'Partial answer',
			finalAssistantText: 'Partial answer',
			finishedReason: 'stop',
			toolLimitNotice: null,
			answerTruncated: true,
			latestUserText: 'Explain the project.',
			toolExecutions: [],
			emitAssistantDelta: vi.fn(),
			emitAssistantRemainder: vi.fn(),
			observeSupervisor: vi.fn()
		});

		expect(result.finishedReason).toBe('length');
		expect(result.finalAssistantText).toBe('Partial answer');
	});
});

describe('runNoToolCallFinalization repair routing', () => {
	const base = {
		assistantBuffer: 'Here is what I found about competitor pricing across five vendors.',
		carriedTruncatedText: '',
		contextType: 'project' as const,
		latestUserText: 'i think we need to figure out the research on pricing',
		gatewayModeActive: true,
		projectCreateStopRepairInjected: false,
		gatewayMutationStopRepairInjected: false,
		skillGateStopRepairInjected: false,
		researchNoPersistStopRepairInjected: false,
		skillGate: null,
		assistantText: '',
		emitAssistantRemainder: async () => {},
		observeSupervisor: async () => {}
	};

	it('retries project creation with the one-call web workflow', async () => {
		const result = await runNoToolCallFinalization({
			...base,
			assistantBuffer: 'I created the project.',
			contextType: 'project_create',
			latestUserText: 'Create a launch project with one goal and two tasks.',
			toolExecutions: []
		});

		expect(result.action).toBe('repair');
		if (result.action === 'repair') {
			expect(result.kind).toBe('project_create');
			expect(result.instruction).toContain('one complete create_onto_project call');
			expect(result.instruction).toContain('include them in entities in this same call');
			expect(result.instruction).not.toContain('declare_turn_contract');
			expect(result.instruction).not.toContain('create_onto_goal');
			expect(result.instruction).not.toContain('create_onto_task');
		}
	});

	it('returns a research_no_persist repair when research persisted nothing', async () => {
		const result = await runNoToolCallFinalization({
			...base,
			toolExecutions: Array.from({ length: 6 }, (_, i) =>
				execution({ call: toolCall('web_search', { query: `q${i}` }, `ws-${i}`) })
			)
		});
		expect(result.action).toBe('repair');
		if (result.action === 'repair') {
			expect(result.kind).toBe('research_no_persist');
			expect(result.instruction).toContain('saved none of it');
		}
	});

	it('finalizes normally once a document write succeeded', async () => {
		const result = await runNoToolCallFinalization({
			...base,
			toolExecutions: [
				...Array.from({ length: 6 }, (_, i) =>
					execution({ call: toolCall('web_search', { query: `q${i}` }, `ws-${i}`) })
				),
				execution({ call: toolCall('create_onto_document', { title: 'Pricing' }, 'doc-1') })
			]
		});
		expect(result.action).toBe('finalized');
	});
});
