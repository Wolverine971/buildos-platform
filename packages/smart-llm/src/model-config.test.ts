// packages/smart-llm/src/model-config.test.ts
import { describe, expect, it } from 'vitest';
import {
	DEEPSEEK_V4_FLASH_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	GLM_52_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	KIMI_CODING_MODEL,
	KIMI_K3_MODEL,
	MINIMAX_M3_MODEL,
	NEX_N2_MINI_MODEL,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	resolveModelPricingProfile,
	TENCENT_HY3_MODEL,
	TENCENT_HY3_PREVIEW_MODEL,
	XIAOMI_MIMO_V25_MODEL
} from './model-config';

describe('resolveModelPricingProfile', () => {
	it('normalizes provider date-suffixed model ids for pricing', () => {
		const result = resolveModelPricingProfile('deepseek/deepseek-v4-flash-20260423');

		expect(result?.modelId).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(result?.profile.cost).toBeGreaterThan(0);
		expect(result?.profile.outputCost).toBeGreaterThan(0);
	});

	it('matches configured snapshot aliases when providers return compact dates', () => {
		const result = resolveModelPricingProfile('qwen/qwen3.7-plus-20260602');

		expect(result?.modelId).toBe('qwen/qwen3.7-plus');
		expect(result?.profile.cost).toBeGreaterThan(0);
		expect(result?.profile.outputCost).toBeGreaterThan(0);
	});

	it('normalizes DeepSeek V4 dated endpoint ids for pricing', () => {
		const flash = resolveModelPricingProfile('deepseek/deepseek-v4-flash-20260423');
		const pro = resolveModelPricingProfile('deepseek/deepseek-v4-pro-20260423');

		expect(flash?.modelId).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(flash?.profile.cost).toBe(0.098);
		expect(flash?.profile.outputCost).toBe(0.196);
		expect(pro?.modelId).toBe(DEEPSEEK_V4_PRO_MODEL);
		expect(pro?.profile.cost).toBe(0.435);
		expect(pro?.profile.outputCost).toBe(0.87);
	});

	it('normalizes newly added OpenRouter endpoint ids for pricing', () => {
		const glm = resolveModelPricingProfile('z-ai/glm-5.2-20260616');
		const minimax = resolveModelPricingProfile('minimax/minimax-m3-20260531');
		const mimo = resolveModelPricingProfile('xiaomi/mimo-v2.5-20260422');
		const hy3 = resolveModelPricingProfile('tencent/hy3-preview-20260421');
		const currentHy3 = resolveModelPricingProfile('tencent/hy3-20260706');
		const nex = resolveModelPricingProfile('nex-agi/nex-n2-mini');
		const poolside = resolveModelPricingProfile('poolside/laguna-xs-2.1-20260625');

		expect(glm?.modelId).toBe(GLM_52_MODEL);
		expect(glm?.profile.cost).toBe(0.9226);
		expect(glm?.profile.outputCost).toBe(2.8996);
		expect(minimax?.modelId).toBe(MINIMAX_M3_MODEL);
		expect(minimax?.profile.cost).toBe(0.3);
		expect(minimax?.profile.outputCost).toBe(1.2);
		expect(mimo?.modelId).toBe(XIAOMI_MIMO_V25_MODEL);
		expect(mimo?.profile.cost).toBe(0.14);
		expect(mimo?.profile.outputCost).toBe(0.28);
		expect(hy3?.modelId).toBe(TENCENT_HY3_PREVIEW_MODEL);
		expect(hy3?.profile.cost).toBe(0.066);
		expect(hy3?.profile.outputCost).toBe(0.26);
		expect(currentHy3?.modelId).toBe(TENCENT_HY3_MODEL);
		expect(currentHy3?.profile.cost).toBe(0.2);
		expect(currentHy3?.profile.outputCost).toBe(0.8);
		expect(nex?.modelId).toBe(NEX_N2_MINI_MODEL);
		expect(nex?.profile.cost).toBe(0.025);
		expect(nex?.profile.outputCost).toBe(0.1);
		expect(poolside?.modelId).toBe(POOLSIDE_LAGUNA_XS_21_MODEL);
		expect(poolside?.profile.cost).toBe(0.06);
		expect(poolside?.profile.outputCost).toBe(0.12);
	});

	it('normalizes Kimi coding endpoint ids for pricing', () => {
		const result = resolveModelPricingProfile('moonshotai/kimi-k2.7-code-20260612');

		expect(result?.modelId).toBe(KIMI_CODING_MODEL);
		expect(result?.profile.cost).toBe(0.75);
		expect(result?.profile.outputCost).toBe(3.5);
	});

	it('prices the premium evaluation and maximum-work roster', () => {
		const luna = resolveModelPricingProfile(GPT_56_LUNA_MODEL);
		const grok = resolveModelPricingProfile(GROK_45_MODEL);
		const kimi = resolveModelPricingProfile(KIMI_K3_MODEL);

		expect(luna?.profile.cost).toBe(1);
		expect(luna?.profile.outputCost).toBe(6);
		expect(grok?.profile.cost).toBe(2);
		expect(grok?.profile.outputCost).toBe(6);
		expect(kimi?.profile.cost).toBe(3);
		expect(kimi?.profile.outputCost).toBe(15);
	});

	it('falls back to a requested model when the resolved model is not configured', () => {
		const result = resolveModelPricingProfile('provider/unknown-model', [
			DEEPSEEK_V4_FLASH_MODEL
		]);

		expect(result?.modelId).toBe(DEEPSEEK_V4_FLASH_MODEL);
	});
});
