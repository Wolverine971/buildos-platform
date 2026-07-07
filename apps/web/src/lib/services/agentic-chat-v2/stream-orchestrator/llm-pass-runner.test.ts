// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import { runLlmStreamPass, type FastChatModelMessage } from './llm-pass-runner';

function toolCall(name: string, args: Record<string, unknown>, id = name): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function baseParams(overrides: Partial<Parameters<typeof runLlmStreamPass>[0]> = {}) {
	const clearHeartbeat = vi.fn();
	const params = {
		llm: {
			streamText: vi.fn(async function* () {
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any,
		passMessages: [{ role: 'user', content: 'Hello' }] as FastChatModelMessage[],
		tools: [],
		hasTools: false,
		noToolSynthesisPass: false,
		passNumber: 1,
		userId: 'user_1',
		sessionId: 'session_1',
		normalizedContext: 'global' as const,
		onAssistantBufferChange: vi.fn(),
		onPendingToolCallCountChange: vi.fn(),
		tryEmitEarlyAssistantLeadIn: vi.fn(async () => {}),
		updateLiveContextUsage: vi.fn(async () => {}),
		startLlmHeartbeat: vi.fn(() => clearHeartbeat),
		observeSupervisor: vi.fn(async () => {}),
		...overrides
	};
	return { params, clearHeartbeat };
}

describe('runLlmStreamPass', () => {
	it('streams text, tool calls, usage, and pass metadata', async () => {
		const emittedToolCall = toolCall('search_project', { query: 'timeline' }, 'tool-1');
		const onToolCall = vi.fn(async () => {
			throw new Error('callback failed');
		});
		const { params, clearHeartbeat } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					yield { type: 'text', content: 'Thinking out loud.' };
					yield {
						type: 'reasoning',
						reasoning: 'hidden chain',
						reasoning_details: [{ text: 'hidden details' }]
					};
					yield { type: 'tool_call', tool_call: emittedToolCall };
					yield {
						type: 'done',
						finished_reason: 'tool_calls',
						usage: {
							prompt_tokens: 10,
							completion_tokens: 4,
							total_tokens: 14,
							completion_tokens_details: { reasoning_tokens: 2 }
						},
						model: 'model-a',
						provider: 'provider-a',
						request_id: 'request-a',
						system_fingerprint: 'fingerprint-a',
						cache_status: 'miss'
					} as any;
				})
			} as any,
			hasTools: true,
			onToolCall
		});

		const result = await runLlmStreamPass(params);

		expect(result.assistantBuffer).toBe('Thinking out loud.');
		expect(result.assistantReasoningForReplay).toBe('hidden chain');
		expect(result.assistantReasoningDetailsForReplay).toEqual([{ text: 'hidden details' }]);
		expect(result.pendingToolCalls).toHaveLength(1);
		expect(result.pendingToolCalls[0]).toMatchObject({
			id: 'tool-1',
			function: { name: 'search_project' }
		});
		expect(result.usage).toEqual({
			prompt_tokens: 10,
			completion_tokens: 4,
			total_tokens: 14,
			completion_tokens_details: { reasoning_tokens: 2 }
		});
		expect(result.metadata).toMatchObject({
			pass: 1,
			finishedReason: 'tool_calls',
			promptTokens: 10,
			completionTokens: 4,
			totalTokens: 14,
			reasoningTokens: 2,
			model: 'model-a',
			provider: 'provider-a',
			requestId: 'request-a',
			systemFingerprint: 'fingerprint-a',
			cacheStatus: 'miss',
			reasoningChannelChunks: 1,
			reasoningChannelChars: 'hidden chain'.length + 'hidden details'.length
		});
		expect(params.onAssistantBufferChange).toHaveBeenCalledWith('Thinking out loud.');
		expect(params.tryEmitEarlyAssistantLeadIn).toHaveBeenCalledWith('Thinking out loud.');
		expect(params.onPendingToolCallCountChange).toHaveBeenCalledWith(1);
		expect(params.updateLiveContextUsage).toHaveBeenCalledWith(10);
		expect(onToolCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-1' }));
		expect(params.observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'tool_call_emitted',
				toolCallId: 'tool-1'
			})
		);
		expect(params.observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'llm_pass_completed',
				pass: 1,
				finishedReason: 'tool_calls',
				usage: {
					prompt_tokens: 10,
					completion_tokens: 4,
					total_tokens: 14
				}
			})
		);
		expect(clearHeartbeat).toHaveBeenCalledTimes(1);
	});

	it('suppresses tool calls during forced no-tool synthesis passes', async () => {
		const onToolCall = vi.fn();
		const { params } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					yield {
						type: 'tool_call',
						tool_call: toolCall('search_project', { query: 'still searching' })
					};
					yield { type: 'done', finished_reason: 'stop' };
				})
			} as any,
			noToolSynthesisPass: true,
			onToolCall
		});

		const result = await runLlmStreamPass(params);

		expect(result.pendingToolCalls).toEqual([]);
		expect(result.suppressedNoToolSynthesisToolCallCount).toBe(1);
		expect(result.metadata).toMatchObject({
			forcedNoToolSynthesis: true,
			suppressedNoToolSynthesisToolCalls: 1
		});
		expect(onToolCall).not.toHaveBeenCalled();
		expect(params.onPendingToolCallCountChange).not.toHaveBeenCalled();
	});

	it('throws when the provider stream ends without a done event', async () => {
		const clearHeartbeat = vi.fn();
		const { params } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					yield { type: 'text', content: 'partial' };
				})
			} as any,
			startLlmHeartbeat: vi.fn(() => clearHeartbeat)
		});

		await expect(runLlmStreamPass(params)).rejects.toThrow(
			'LLM stream ended without a completion event'
		);
		expect(clearHeartbeat).toHaveBeenCalledTimes(1);
	});
});
