// packages/smart-llm/src/model-selection.test.ts
import { describe, expect, it } from 'vitest';
import {
	ACTIVE_EXPERIMENT_MODEL,
	AGENTIC_MODEL_RECOMMENDATIONS,
	DEEPSEEK_V4_FLASH_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	GLM_52_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	JSON_PROFILE_MODELS,
	KIMI_CODING_MODEL,
	KIMI_EXPERIMENT_MODEL,
	KIMI_K3_MODEL,
	MAXIMUM_WORK_MODEL,
	MAXIMUM_WORK_MODEL_ORDER,
	MINIMAX_M3_MODEL,
	MODEL_CATALOG,
	NEX_N2_MINI_MODEL,
	OPENROUTER_V2_JSON_MODELS,
	OPENROUTER_V2_MULTIMODAL_MODELS,
	OPENROUTER_V2_TEXT_MODELS,
	OPENROUTER_V2_TOOL_MODELS,
	OPENROUTER_V2_TOOL_MODELS_EXACTO,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	PROJECT_NEXT_STEP_MODELS,
	QWEN_37_PLUS_EXPERIMENT_MODEL,
	TENCENT_HY3_MODEL,
	TENCENT_HY3_PREVIEW_MODEL,
	TEXT_PROFILE_MODELS,
	XIAOMI_MIMO_V25_MODEL,
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
			'legacy/google-model',
			'alpha/model',
			'legacy/qwen-32b',
			ACTIVE_EXPERIMENT_MODEL,
			'legacy/openai-model',
			'legacy/anthropic-model',
			'legacy/deepseek-v3'
		];

		expect(ensureToolCompatibleModels(requested)).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('falls back to the default tool-calling order when no requested models are tool-capable', () => {
		const requested = ['legacy/google-model', 'legacy/google-model-2'];
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

	it('uses the production fallback order for balanced default text routing', () => {
		const models = selectTextModels('balanced', 1200);

		expect(models).toEqual([...OPENROUTER_V2_TEXT_MODELS]);
		expect(models.every((model) => !model.includes('alpha'))).toBe(true);
	});

	it('uses the production fallback order for balanced default JSON routing', () => {
		const models = selectJSONModels('balanced', 'moderate');

		expect(models).toEqual([...OPENROUTER_V2_JSON_MODELS]);
		expect(models.every((model) => !model.includes('alpha'))).toBe(true);
	});

	it('routes new OpenRouter models only through compatible lanes', () => {
		expect(OPENROUTER_V2_TEXT_MODELS[0]).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).toContain(TENCENT_HY3_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).toContain(POOLSIDE_LAGUNA_XS_21_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).toContain(XIAOMI_MIMO_V25_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).toContain(GEMINI_31_FLASH_LITE_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain(QWEN_37_PLUS_EXPERIMENT_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain(GPT_56_LUNA_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain(GROK_45_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain(KIMI_K3_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain(TENCENT_HY3_PREVIEW_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain(KIMI_CODING_MODEL);
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain('legacy/removed-preview');
		expect(OPENROUTER_V2_TEXT_MODELS).not.toContain('legacy/removed-qwen-plus');

		expect(OPENROUTER_V2_JSON_MODELS[0]).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).toContain(XIAOMI_MIMO_V25_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).toContain(MINIMAX_M3_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).toContain(NEX_N2_MINI_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(QWEN_37_PLUS_EXPERIMENT_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(GPT_56_LUNA_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(GROK_45_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(KIMI_K3_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).toContain(GEMINI_31_FLASH_LITE_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(TENCENT_HY3_PREVIEW_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(TENCENT_HY3_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(POOLSIDE_LAGUNA_XS_21_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain(KIMI_CODING_MODEL);
		expect(OPENROUTER_V2_JSON_MODELS).not.toContain('legacy/removed-qwen-plus');

		expect(OPENROUTER_V2_TOOL_MODELS[0]).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).toContain(GLM_52_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).toContain(TENCENT_HY3_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).toContain(MINIMAX_M3_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).toContain(POOLSIDE_LAGUNA_XS_21_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain(QWEN_37_PLUS_EXPERIMENT_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain(GPT_56_LUNA_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain(GROK_45_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain(KIMI_K3_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain(TENCENT_HY3_PREVIEW_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain(KIMI_CODING_MODEL);
		expect(OPENROUTER_V2_TOOL_MODELS).not.toContain('legacy/removed-qwen-plus');
		expect(OPENROUTER_V2_MULTIMODAL_MODELS[0]).toBe(XIAOMI_MIMO_V25_MODEL);
		expect(OPENROUTER_V2_MULTIMODAL_MODELS).toContain(MINIMAX_M3_MODEL);
		expect(OPENROUTER_V2_MULTIMODAL_MODELS).toContain(NEX_N2_MINI_MODEL);
		expect(OPENROUTER_V2_MULTIMODAL_MODELS).toContain(GEMINI_31_FLASH_LITE_MODEL);
		expect(OPENROUTER_V2_MULTIMODAL_MODELS).not.toContain('legacy/removed-preview');
	});

	it('uses stronger specialist models only for quality and maximum profiles', () => {
		expect(TEXT_PROFILE_MODELS.speed[0]).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(TEXT_PROFILE_MODELS.speed).toContain(POOLSIDE_LAGUNA_XS_21_MODEL);
		expect(ACTIVE_EXPERIMENT_MODEL).toBe(GPT_56_LUNA_MODEL);
		expect(TEXT_PROFILE_MODELS.quality[0]).toBe(GLM_52_MODEL);
		expect(TEXT_PROFILE_MODELS.quality).toContain(DEEPSEEK_V4_PRO_MODEL);
		expect(TEXT_PROFILE_MODELS.quality).toContain(GPT_56_LUNA_MODEL);
		expect(TEXT_PROFILE_MODELS.quality).toContain(GROK_45_MODEL);
		expect(TEXT_PROFILE_MODELS.quality).not.toContain(KIMI_K3_MODEL);
		expect(TEXT_PROFILE_MODELS.quality).not.toContain(KIMI_CODING_MODEL);
		expect(TEXT_PROFILE_MODELS.creative[0]).toBe(GLM_52_MODEL);
		expect(TEXT_PROFILE_MODELS.maximum).toEqual([...MAXIMUM_WORK_MODEL_ORDER]);
		expect(TEXT_PROFILE_MODELS.maximum[0]).toBe(MAXIMUM_WORK_MODEL);
		expect(TEXT_PROFILE_MODELS.maximum).toContain(GPT_56_LUNA_MODEL);
		expect(TEXT_PROFILE_MODELS.maximum).toContain(GROK_45_MODEL);
		expect(TEXT_PROFILE_MODELS.maximum).not.toContain(KIMI_CODING_MODEL);
		expect(TEXT_PROFILE_MODELS.maximum).not.toContain(KIMI_EXPERIMENT_MODEL);

		expect(JSON_PROFILE_MODELS.fast).not.toContain(DEEPSEEK_V4_PRO_MODEL);
		expect(JSON_PROFILE_MODELS.fast).toContain(NEX_N2_MINI_MODEL);
		expect(JSON_PROFILE_MODELS.powerful[0]).toBe(GLM_52_MODEL);
		expect(JSON_PROFILE_MODELS.maximum[0]).toBe(KIMI_K3_MODEL);
		expect(JSON_PROFILE_MODELS.maximum).toContain(GPT_56_LUNA_MODEL);
		expect(JSON_PROFILE_MODELS.maximum).toContain(GROK_45_MODEL);
		expect(JSON_PROFILE_MODELS.maximum).not.toContain(KIMI_CODING_MODEL);
		expect(JSON_PROFILE_MODELS.maximum).not.toContain(TENCENT_HY3_PREVIEW_MODEL);
		expect(JSON_PROFILE_MODELS.maximum).not.toContain(TENCENT_HY3_MODEL);
	});

	it('excludes non-json active models from custom JSON selection', () => {
		const models = selectJSONModels('custom', 'simple', { maxCost: 0.2 });

		expect(models).toContain(NEX_N2_MINI_MODEL);
		expect(models).toContain(XIAOMI_MIMO_V25_MODEL);
		expect(models).not.toContain(TENCENT_HY3_PREVIEW_MODEL);
		expect(models).not.toContain(TENCENT_HY3_MODEL);
		expect(models).not.toContain(POOLSIDE_LAGUNA_XS_21_MODEL);
	});

	it('recognizes the supported structured-output-capable OpenRouter models', () => {
		expect(supportsJsonMode(QWEN_37_PLUS_EXPERIMENT_MODEL)).toBe(true);
		expect(supportsJsonMode(GEMINI_31_FLASH_LITE_MODEL)).toBe(true);
		expect(supportsJsonMode(DEEPSEEK_V4_FLASH_MODEL)).toBe(true);
		expect(supportsJsonMode(DEEPSEEK_V4_PRO_MODEL)).toBe(true);
		expect(supportsJsonMode(GLM_52_MODEL)).toBe(true);
		expect(supportsJsonMode(MINIMAX_M3_MODEL)).toBe(true);
		expect(supportsJsonMode(NEX_N2_MINI_MODEL)).toBe(true);
		expect(supportsJsonMode(XIAOMI_MIMO_V25_MODEL)).toBe(true);
		expect(supportsJsonMode(TENCENT_HY3_PREVIEW_MODEL)).toBe(false);
		expect(supportsJsonMode(TENCENT_HY3_MODEL)).toBe(false);
		expect(supportsJsonMode(POOLSIDE_LAGUNA_XS_21_MODEL)).toBe(false);
		expect(supportsJsonMode(GPT_56_LUNA_MODEL)).toBe(true);
		expect(supportsJsonMode(GROK_45_MODEL)).toBe(true);
		expect(supportsJsonMode(KIMI_K3_MODEL)).toBe(true);
		expect(supportsJsonMode(KIMI_EXPERIMENT_MODEL)).toBe(true);
		expect(supportsJsonMode(KIMI_CODING_MODEL)).toBe(true);
	});

	it('keeps centralized route models in the shared catalog', () => {
		const routedModelIds = new Set([
			...OPENROUTER_V2_TEXT_MODELS,
			...OPENROUTER_V2_JSON_MODELS,
			...OPENROUTER_V2_TOOL_MODELS,
			...OPENROUTER_V2_TOOL_MODELS_EXACTO,
			...OPENROUTER_V2_MULTIMODAL_MODELS,
			...PROJECT_NEXT_STEP_MODELS,
			...TOOL_CALLING_MODEL_ORDER,
			...collectModelIds(AGENTIC_MODEL_RECOMMENDATIONS)
		]);

		for (const modelId of routedModelIds) {
			expect(MODEL_CATALOG[modelId], modelId).toBeDefined();
		}
	});
});
