// packages/smart-llm/src/openrouter-request.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildOpenRouterChatCompletionBody,
	resolveOpenRouterFallbackModels
} from './openrouter-request';

describe('resolveOpenRouterFallbackModels', () => {
	it('deduplicates fallbacks and excludes the requested primary model', () => {
		expect(
			resolveOpenRouterFallbackModels('qwen/qwen3.6-plus', [
				'qwen/qwen3.6-plus',
				' deepseek/deepseek-v3.2 ',
				'deepseek/deepseek-v3.2',
				'openai/gpt-oss-120b'
			])
		).toEqual(['deepseek/deepseek-v3.2', 'openai/gpt-oss-120b']);
	});

	it("caps serialized fallbacks to OpenRouter's accepted models array size", () => {
		expect(
			resolveOpenRouterFallbackModels('x-ai/grok-4.1-fast', [
				'minimax/minimax-m2.7',
				'qwen/qwen3.6-plus',
				'openai/gpt-oss-120b',
				'qwen/qwen3.5-flash-02-23',
				'openai/gpt-4.1-nano'
			])
		).toEqual(['minimax/minimax-m2.7', 'qwen/qwen3.6-plus', 'openai/gpt-oss-120b']);
	});
});

describe('buildOpenRouterChatCompletionBody', () => {
	it('serializes fallback models with the top-level OpenRouter models field', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.6-plus',
			models: ['qwen/qwen3.6-plus', 'deepseek/deepseek-v3.2', 'openai/gpt-oss-120b'],
			messages: [{ role: 'user', content: 'Return JSON.' }],
			response_format: { type: 'json_object' },
			stream: false
		});

		expect(body).toMatchObject({
			model: 'qwen/qwen3.6-plus',
			models: ['deepseek/deepseek-v3.2', 'openai/gpt-oss-120b'],
			response_format: { type: 'json_object' },
			stream: false
		});
		expect(Object.keys(body)).not.toContain('extra_body');
	});
});
