// packages/smart-llm/src/openrouter-request.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildOpenRouterChatCompletionBody,
	resolveOpenRouterFallbackModels
} from './openrouter-request';

describe('resolveOpenRouterFallbackModels', () => {
	it('deduplicates fallbacks and excludes the requested primary model', () => {
		expect(
			resolveOpenRouterFallbackModels('qwen/qwen3.7-plus', [
				'qwen/qwen3.7-plus',
				' deepseek/deepseek-v4-flash ',
				'deepseek/deepseek-v4-flash',
				'minimax/minimax-m3'
			])
		).toEqual(['deepseek/deepseek-v4-flash', 'minimax/minimax-m3']);
	});

	it("caps serialized fallbacks to OpenRouter's accepted models array size", () => {
		expect(
			resolveOpenRouterFallbackModels('deepseek/deepseek-v4-flash', [
				'qwen/qwen3.7-plus',
				'minimax/minimax-m3',
				'xiaomi/mimo-v2.5',
				'google/gemini-3.1-flash-lite',
				'moonshotai/kimi-k2.6'
			])
		).toEqual(['qwen/qwen3.7-plus', 'minimax/minimax-m3', 'xiaomi/mimo-v2.5']);
	});
});

describe('buildOpenRouterChatCompletionBody', () => {
	it('serializes fallback models with the top-level OpenRouter models field', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			models: ['qwen/qwen3.7-plus', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m3'],
			messages: [{ role: 'user', content: 'Return JSON.' }],
			response_format: { type: 'json_object' },
			stream: false
		});

		expect(body).toMatchObject({
			model: 'qwen/qwen3.7-plus',
			models: ['deepseek/deepseek-v4-flash', 'minimax/minimax-m3'],
			response_format: { type: 'json_object' },
			stream: false
		});
		expect(Object.keys(body)).not.toContain('extra_body');
	});

	it('forwards session_id and prompt_cache_key when a session id is supplied', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			messages: [{ role: 'user', content: 'Stream this.' }],
			stream: true,
			session_id: 'chat-session-123',
			prompt_cache_key: 'chat-session-123'
		});

		expect(body.session_id).toBe('chat-session-123');
		expect(body.prompt_cache_key).toBe('chat-session-123');
	});

	it('truncates an over-long session_id to 256 chars and omits empty cache keys', () => {
		const longId = 'x'.repeat(300);
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			messages: [{ role: 'user', content: 'Stream this.' }],
			stream: true,
			session_id: longId,
			prompt_cache_key: '   '
		});

		expect((body.session_id as string).length).toBe(256);
		expect(Object.keys(body)).not.toContain('prompt_cache_key');
	});
});
