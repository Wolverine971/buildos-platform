// packages/smart-llm/src/model-selection.test.ts
import { describe, expect, it } from 'vitest';
import { TOOL_CALLING_MODEL_ORDER } from './model-config';
import {
	ensureToolCompatibleModels,
	selectJSONModels,
	selectModelsByRequirements,
	selectTextModels
} from './model-selection';

describe('ensureToolCompatibleModels', () => {
	it('preserves requested order while filtering to tool-capable models', () => {
		const requested = [
			'google/gemini-2.5-flash-lite',
			'openrouter/hunter-alpha',
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

	it('handles zero-cost models when ranking by requirements', () => {
		const result = selectModelsByRequirements(
			{
				'free/model': {
					id: 'free/model',
					name: 'Free Model',
					speed: 4.5,
					smartness: 4.5,
					cost: 0,
					outputCost: 0,
					provider: 'openrouter',
					bestFor: ['testing']
				},
				'paid/model': {
					id: 'paid/model',
					name: 'Paid Model',
					speed: 4,
					smartness: 4,
					cost: 0.2,
					outputCost: 0.4,
					provider: 'openai',
					bestFor: ['testing']
				}
			},
			{},
			'json'
		);

		expect(result[0]).toBe('free/model');
	});

	it('prefers stable models over alpha aliases for requirement-based selection', () => {
		const result = selectModelsByRequirements(
			{
				'openrouter/hunter-alpha': {
					id: 'openrouter/hunter-alpha',
					name: 'Hunter Alpha',
					speed: 4.6,
					smartness: 4.6,
					cost: 0,
					outputCost: 0,
					provider: 'openrouter',
					bestFor: ['agentic-workflows'],
					limitations: ['alpha-model']
				},
				'stable/model': {
					id: 'stable/model',
					name: 'Stable Model',
					speed: 4.2,
					smartness: 4.5,
					cost: 0.08,
					outputCost: 0.24,
					provider: 'qwen',
					bestFor: ['agentic-workflows']
				}
			},
			{},
			'json'
		);

		expect(result[0]).toBe('stable/model');
		expect(result).not.toContain('openrouter/hunter-alpha');
	});

	it('keeps alpha aliases out of balanced default text routing', () => {
		const models = selectTextModels('balanced', 1200);

		expect(models[0]).toBe('x-ai/grok-4.1-fast');
		expect(models).not.toContain('openrouter/hunter-alpha');
		expect(models).not.toContain('openrouter/healer-alpha');
	});

	it('keeps alpha aliases out of balanced default JSON routing', () => {
		const models = selectJSONModels('balanced', 'moderate');

		expect(models[0]).toBe('x-ai/grok-4.1-fast');
		expect(models).not.toContain('openrouter/hunter-alpha');
		expect(models).not.toContain('openrouter/healer-alpha');
	});
});
