// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function waitForAbort(signal: AbortSignal | undefined, message = 'The operation was aborted') {
	return new Promise<never>((_, reject) => {
		if (signal?.aborted) {
			reject(Object.assign(new Error(message), { name: 'AbortError' }));
			return;
		}
		signal?.addEventListener(
			'abort',
			() => {
				reject(Object.assign(new Error(message), { name: 'AbortError' }));
			},
			{ once: true }
		);
	});
}

describe('runLlmStreamPass', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

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
		expect(typeof result.metadata.startedAtMs).toBe('number');
		expect(typeof result.metadata.durationMs).toBe('number');
		expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
		expect(typeof result.metadata.timeToFirstTokenMs).toBe('number');
		expect(result.metadata.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
		expect(result.metadata.firstTokenAtMs).toBe(
			result.metadata.startedAtMs! + result.metadata.timeToFirstTokenMs!
		);
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
			suppressedNoToolSynthesisToolCalls: 1,
			suppressedNoToolSynthesisToolCallDetails: [
				{
					name: 'search_project',
					argumentsPreview: '{"query":"still searching"}'
				}
			]
		});
		expect(onToolCall).not.toHaveBeenCalled();
		expect(params.onPendingToolCallCountChange).not.toHaveBeenCalled();
		expect(params.llm.streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: 'none',
				temperature: 0.1
			})
		);
	});

	it('passes per-pass model routing through to the LLM stream and metadata', async () => {
		const { params } = baseParams({
			modelRouting: {
				passRole: 'initial_plan',
				profile: 'speed',
				models: ['tencent/hy3', 'deepseek/deepseek-v4-flash'],
				modelTieringVariant: 'fast_initial_plan'
			}
		});

		const result = await runLlmStreamPass(params);

		expect(params.llm.streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				profile: 'speed',
				models: ['tencent/hy3', 'deepseek/deepseek-v4-flash']
			})
		);
		expect(result.metadata).toMatchObject({
			passRole: 'initial_plan',
			requestedProfile: 'speed',
			requestedModels: ['tencent/hy3', 'deepseek/deepseek-v4-flash'],
			modelTieringVariant: 'fast_initial_plan'
		});
	});

	it('retries a transient stream error and returns the successful attempt', async () => {
		let invocation = 0;
		const { params, clearHeartbeat } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					invocation += 1;
					if (invocation === 1) {
						yield { type: 'text', content: 'discarded partial text.' };
						yield {
							type: 'error',
							error: 'OpenRouter API error: 503 Service Unavailable'
						};
						return;
					}
					yield { type: 'text', content: 'Recovered answer.' };
					yield {
						type: 'done',
						finished_reason: 'stop',
						usage: {
							prompt_tokens: 12,
							completion_tokens: 3,
							total_tokens: 15
						}
					};
				})
			} as any,
			retryDelayMs: () => 0
		});

		const result = await runLlmStreamPass(params);

		expect(params.llm.streamText).toHaveBeenCalledTimes(2);
		expect(result.assistantBuffer).toBe('Recovered answer.');
		expect(result.metadata).toMatchObject({
			pass: 1,
			attempts: 2,
			streamRetryCount: 1,
			lastStreamRetryError: 'OpenRouter API error: 503 Service Unavailable',
			finishedReason: 'stop',
			promptTokens: 12,
			completionTokens: 3,
			totalTokens: 15
		});
		expect(params.onAssistantBufferChange).toHaveBeenCalledWith('');
		expect(params.onPendingToolCallCountChange).toHaveBeenCalledWith(0);
		expect(clearHeartbeat).toHaveBeenCalledTimes(2);
		expect(typeof result.metadata.startedAtMs).toBe('number');
		expect(typeof result.metadata.durationMs).toBe('number');
		expect(result.metadata.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
		// The first attempt's discarded text must not count toward first-token
		// timing; only the successful (retried) attempt's first content counts.
		expect(result.metadata.firstTokenAtMs).toBe(
			result.metadata.startedAtMs! + result.metadata.timeToFirstTokenMs!
		);
	});

	it('does not retry non-transient stream errors', async () => {
		const { params, clearHeartbeat } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					yield { type: 'error', error: 'OpenRouter API error: 400 invalid request' };
				})
			} as any,
			retryDelayMs: () => 0
		});

		await expect(runLlmStreamPass(params)).rejects.toThrow(
			'OpenRouter API error: 400 invalid request'
		);
		expect(params.llm.streamText).toHaveBeenCalledTimes(1);
		expect(clearHeartbeat).toHaveBeenCalledTimes(1);
	});

	it('throws when the provider stream ends without a done event', async () => {
		const clearHeartbeat = vi.fn();
		const { params } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					yield { type: 'text', content: 'partial' };
				})
			} as any,
			startLlmHeartbeat: vi.fn(() => clearHeartbeat),
			retryDelayMs: () => 0
		});

		await expect(runLlmStreamPass(params)).rejects.toThrow(
			'LLM stream ended without a completion event'
		);
		expect(params.llm.streamText).toHaveBeenCalledTimes(2);
		expect(clearHeartbeat).toHaveBeenCalledTimes(2);
	});

	it('retries after a per-pass stream timeout and returns the recovered attempt', async () => {
		vi.useFakeTimers();
		let invocation = 0;
		const { params, clearHeartbeat } = baseParams({
			llm: {
				streamText: vi.fn(async function* (options: { signal?: AbortSignal }) {
					invocation += 1;
					if (invocation === 1) {
						await waitForAbort(options.signal);
						return;
					}
					yield { type: 'text', content: 'Recovered after timeout.' };
					yield {
						type: 'done',
						finished_reason: 'stop',
						usage: {
							prompt_tokens: 9,
							completion_tokens: 4,
							total_tokens: 13
						}
					};
				})
			} as any,
			passTimeoutMs: 25,
			retryDelayMs: () => 0
		});

		const resultPromise = runLlmStreamPass(params);
		await vi.advanceTimersByTimeAsync(25);
		const result = await resultPromise;

		expect(params.llm.streamText).toHaveBeenCalledTimes(2);
		expect(result.assistantBuffer).toBe('Recovered after timeout.');
		expect(result.metadata).toMatchObject({
			attempts: 2,
			streamRetryCount: 1,
			lastStreamRetryError: 'LLM stream pass timed out after 25ms',
			finishedReason: 'stop',
			promptTokens: 9,
			completionTokens: 4,
			totalTokens: 13
		});
		expect(clearHeartbeat).toHaveBeenCalledTimes(2);
	});

	it('retries when a per-pass timeout makes the provider stream return without done', async () => {
		vi.useFakeTimers();
		let invocation = 0;
		const { params, clearHeartbeat } = baseParams({
			llm: {
				streamText: vi.fn(async function* (options: { signal?: AbortSignal }) {
					invocation += 1;
					if (invocation === 1) {
						await new Promise<void>((resolve) => {
							options.signal?.addEventListener('abort', () => resolve(), {
								once: true
							});
						});
						return;
					}
					yield { type: 'text', content: 'Recovered after silent abort.' };
					yield { type: 'done', finished_reason: 'stop' };
				})
			} as any,
			passTimeoutMs: 25,
			retryDelayMs: () => 0
		});

		const resultPromise = runLlmStreamPass(params);
		await vi.advanceTimersByTimeAsync(25);
		const result = await resultPromise;

		expect(params.llm.streamText).toHaveBeenCalledTimes(2);
		expect(result.assistantBuffer).toBe('Recovered after silent abort.');
		expect(result.metadata).toMatchObject({
			attempts: 2,
			streamRetryCount: 1,
			lastStreamRetryError: 'LLM stream pass timed out after 25ms',
			finishedReason: 'stop'
		});
		expect(clearHeartbeat).toHaveBeenCalledTimes(2);
	});

	it('does not retry a parent turn abort before the per-pass timeout fires', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const { params, clearHeartbeat } = baseParams({
			llm: {
				streamText: vi.fn(async function* (options: { signal?: AbortSignal }) {
					await waitForAbort(options.signal, 'Request aborted');
				})
			} as any,
			signal: controller.signal,
			passTimeoutMs: 25,
			retryDelayMs: () => 0
		});

		const resultPromise = runLlmStreamPass(params);
		const rejectionExpectation = expect(resultPromise).rejects.toThrow('Request aborted');
		setTimeout(() => controller.abort(), 10);
		await vi.advanceTimersByTimeAsync(10);

		await rejectionExpectation;
		expect(params.llm.streamText).toHaveBeenCalledTimes(1);
		expect(clearHeartbeat).toHaveBeenCalledTimes(1);
	});

	it('does not retry a missing done event after the abort signal fires', async () => {
		const controller = new AbortController();
		const clearHeartbeat = vi.fn();
		const { params } = baseParams({
			llm: {
				streamText: vi.fn(async function* () {
					yield { type: 'text', content: 'partial cancelled output' };
					controller.abort();
				})
			} as any,
			signal: controller.signal,
			startLlmHeartbeat: vi.fn(() => clearHeartbeat),
			retryDelayMs: () => 0
		});

		await expect(runLlmStreamPass(params)).rejects.toThrow('Request aborted');
		expect(params.llm.streamText).toHaveBeenCalledTimes(1);
		expect(clearHeartbeat).toHaveBeenCalledTimes(1);
	});
});
