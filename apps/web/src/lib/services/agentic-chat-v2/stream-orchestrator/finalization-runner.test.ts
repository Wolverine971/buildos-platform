// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution, LLMStreamPassMetadata } from './shared';
import {
	resolveLengthContinuation,
	runCancellationFinalization,
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
			toolExecutions: [readExecution],
			emitAssistantDelta: vi.fn(),
			emitAssistantRemainder,
			observeSupervisor
		});

		expect(result.finalizationGuardResult).toMatchObject({
			applied: true,
			reason: 'incomplete_mutation_after_reads'
		});
		expect(result.finalAssistantText).toContain('nothing was updated');
		expect(emitAssistantRemainder).toHaveBeenCalledWith(
			expect.stringContaining('nothing was updated')
		);
		expect(observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'final_candidate',
				finishedReason: 'stop'
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
