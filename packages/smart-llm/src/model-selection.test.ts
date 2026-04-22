// packages/smart-llm/src/model-selection.test.ts
import { describe, expect, it } from 'vitest';
import {
	ACTIVE_EXPERIMENT_MODEL,
	AGENTIC_MODEL_RECOMMENDATIONS,
	KIMI_EXPERIMENT_MODEL,
	MODEL_CATALOG,
	OPENROUTER_V2_JSON_MODELS,
	OPENROUTER_V2_TEXT_MODELS,
	OPENROUTER_V2_TOOL_MODELS,
	OPENROUTER_V2_TOOL_MODELS_EXACTO,
	PROJECT_NEXT_STEP_MODELS,
	TOOL_CALLING_MODEL_ORDER
} from './model-config';
import {
	ensureToolCompatibleModels,
	selectJSONModels,
	selectModelsByRequirements,
	selectTextModels,
	supportsJsonMode
} from './model-selection';

function collectModelIds(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === 'string');
	}

	if (value && typeof value === 'object') {
		return Object.values(value as Record<string, unknown>).flatMap(collectModelIds);
	}

	return [];
}

describe('ensureToolCompatibleModels', () => {
	it('preserves requested order while filtering to tool-capable models', () => {
		const requested = [
			'google/gemini-2.5-flash-lite',
			'alpha/model',
			'legacy/qwen-32b',
			ACTIVE_EXPERIMENT_MODEL,
			'openai/gpt-4o-mini',
			'anthropic/claude-haiku-4.5',
			'legacy/deepseek-v3'
		];

		expect(ensureToolCompatibleModels(requested)).toEqual([ACTIVE_EXPERIMENT_MODEL]);
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
				'alpha/model': {
					id: 'alpha/model',
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
		expect(result).not.toContain('alpha/model');
	});

	it('excludes models with no active endpoints from requirement-based selection', () => {
		const result = selectModelsByRequirements(
			{
				'free/unavailable': {
					id: 'free/unavailable',
					name: 'Unavailable Free Model',
					speed: 5,
					smartness: 5,
					cost: 0,
					outputCost: 0,
					provider: 'qwen',
					bestFor: ['testing'],
					limitations: ['no-active-endpoints']
				},
				'free/deployable': {
					id: 'free/deployable',
					name: 'Deployable Free Model',
					speed: 4,
					smartness: 4,
					cost: 0,
					outputCost: 0,
					provider: 'nvidia',
					bestFor: ['testing']
				}
			},
			{},
			'json'
		);

		expect(result[0]).toBe('free/deployable');
		expect(result).not.toContain('free/unavailable');
	});

	it('excludes route-only aliases from requirement-based selection', () => {
		const result = selectModelsByRequirements(
			{
				'route/only': {
					id: 'route/only',
					name: 'Route Only Alias',
					speed: 5,
					smartness: 5,
					cost: 0,
					outputCost: 0,
					provider: 'openrouter',
					bestFor: ['testing'],
					limitations: ['route-only']
				},
				'stable/model': {
					id: 'stable/model',
					name: 'Stable Model',
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

		expect(result[0]).toBe('stable/model');
		expect(result).not.toContain('route/only');
	});

	it('uses only the active experiment model for balanced default text routing', () => {
		const models = selectTextModels('balanced', 1200);

		expect(models).toEqual([ACTIVE_EXPERIMENT_MODEL]);
		expect(models.every((model) => !model.includes('alpha'))).toBe(true);
	});

	it('uses only the active experiment model for balanced default JSON routing', () => {
		const models = selectJSONModels('balanced', 'moderate');

		expect(models).toEqual([ACTIVE_EXPERIMENT_MODEL]);
		expect(models.every((model) => !model.includes('alpha'))).toBe(true);
	});

	it('recognizes the new structured-output-capable OpenRouter models', () => {
		expect(supportsJsonMode('qwen/qwen3.5-flash-02-23')).toBe(true);
		expect(supportsJsonMode('qwen/qwen3.6-plus')).toBe(true);
		expect(supportsJsonMode('deepseek/deepseek-v3.2')).toBe(true);
		expect(supportsJsonMode('openai/gpt-4.1-nano')).toBe(true);
		expect(supportsJsonMode('openai/gpt-oss-20b')).toBe(true);
		expect(supportsJsonMode('openai/gpt-oss-20b:free')).toBe(true);
		expect(supportsJsonMode('openai/gpt-oss-120b')).toBe(true);
		expect(supportsJsonMode('google/gemini-3.1-flash-lite-preview')).toBe(true);
		expect(supportsJsonMode('minimax/minimax-m2.7')).toBe(true);
		expect(supportsJsonMode('nvidia/nemotron-3-super-120b-a12b:free')).toBe(true);
		expect(supportsJsonMode(KIMI_EXPERIMENT_MODEL)).toBe(true);
	});

	it('keeps centralized route models in the shared catalog', () => {
		const routedModelIds = new Set([
			...OPENROUTER_V2_TEXT_MODELS,
			...OPENROUTER_V2_JSON_MODELS,
			...OPENROUTER_V2_TOOL_MODELS,
			...OPENROUTER_V2_TOOL_MODELS_EXACTO,
			...PROJECT_NEXT_STEP_MODELS,
			...TOOL_CALLING_MODEL_ORDER,
			...collectModelIds(AGENTIC_MODEL_RECOMMENDATIONS)
		]);

		for (const modelId of routedModelIds) {
			expect(MODEL_CATALOG[modelId], modelId).toBeDefined();
		}
	});
});
