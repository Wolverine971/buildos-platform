// packages/smart-llm/src/model-selection.test.ts
import { describe, expect, it } from 'vitest';
import { TOOL_CALLING_MODEL_ORDER } from './model-config';
import { ensureToolCompatibleModels } from './model-selection';

describe('ensureToolCompatibleModels', () => {
	it('preserves requested order while filtering to tool-capable models', () => {
		const requested = [
			'google/gemini-2.5-flash-lite',
			'qwen/qwen3-32b',
			'openai/gpt-4o-mini',
			'anthropic/claude-haiku-4.5',
			'deepseek/deepseek-chat'
		];

		expect(ensureToolCompatibleModels(requested)).toEqual([
			'qwen/qwen3-32b',
			'openai/gpt-4o-mini',
			'anthropic/claude-haiku-4.5',
			'deepseek/deepseek-chat'
		]);
	});

	it('falls back to the default tool-calling order when no requested models are tool-capable', () => {
		const requested = ['google/gemini-2.5-flash-lite', 'google/gemini-2.0-flash-001'];
		expect(ensureToolCompatibleModels(requested)).toEqual([...TOOL_CALLING_MODEL_ORDER]);
	});
});
