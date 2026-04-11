// apps/web/src/lib/services/openrouter-v2/model-lanes.test.ts

import { describe, expect, it } from 'vitest';
import { resolveLaneModels, resolveLaneReasoning } from './model-lanes';

describe('resolveLaneModels', () => {
	it('returns default text lane models when no explicit selection is provided', () => {
		const result = resolveLaneModels({ lane: 'text' });

		expect(result[0]).toBe('qwen/qwen3.5-flash-02-23');
		expect(result).toContain('google/gemini-3.1-flash-lite-preview');
		expect(result).toContain('openai/gpt-4.1-nano');
	});

	it('returns default tool lane models when exacto is disabled', () => {
		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: false });

		expect(result[0]).toBe('x-ai/grok-4.1-fast');
		expect(result).toContain('minimax/minimax-m2.7');
		expect(result).toContain('qwen/qwen3.6-plus');
		expect(result).toContain('openai/gpt-oss-120b');
	});

	it('returns upgraded JSON lane defaults', () => {
		const result = resolveLaneModels({ lane: 'json' });

		expect(result[0]).toBe('qwen/qwen3.6-plus');
		expect(result).toContain('deepseek/deepseek-v3.2');
		expect(result).toContain('openai/gpt-oss-120b');
		expect(result).toContain('openai/gpt-4.1-nano');
	});

	it('uses exacto defaults for tool lane when enabled', () => {
		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: true });

		expect(result[0]).toBe('deepseek/deepseek-v3.1-terminus:exacto');
		expect(result).toContain('openai/gpt-4o-mini');
	});

	it('prioritizes explicit compatible models and keeps unique ordering', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: 'deepseek/deepseek-v3.2',
			models: ['deepseek/deepseek-v3.2', 'openai/gpt-4o-mini']
		});

		expect(result[0]).toBe('deepseek/deepseek-v3.2');
		expect(result.filter((entry) => entry === 'deepseek/deepseek-v3.2')).toHaveLength(1);
	});

	it('filters explicit unknown or lane-incompatible models before defaults', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: 'custom/model',
			models: ['custom/model', 'nvidia/nemotron-3-super-120b-a12b:free']
		});

		expect(result).not.toContain('custom/model');
		expect(result[0]).toBe('nvidia/nemotron-3-super-120b-a12b:free');
	});

	it('honors text profile hints before text lane defaults', () => {
		const result = resolveLaneModels({ lane: 'text', profile: 'quality' });

		expect(result[0]).toBe('qwen/qwen3.6-plus');
		expect(result).toContain('qwen/qwen3.5-flash-02-23');
	});

	it('honors JSON profile hints with JSON-capable models only', () => {
		const result = resolveLaneModels({ lane: 'json', profile: 'fast' });

		expect(result[0]).toBe('qwen/qwen3.5-flash-02-23');
		expect(result).not.toContain('custom/model');
	});

	it('keeps tool lane defaults ahead of broad profile fallbacks', () => {
		const result = resolveLaneModels({
			lane: 'tool_calling',
			profile: 'balanced',
			exactoToolsEnabled: false
		});

		expect(result[0]).toBe('x-ai/grok-4.1-fast');
		expect(result[1]).toBe('minimax/minimax-m2.7');
		expect(result).toContain('qwen/qwen3.5-flash-02-23');
	});
});

describe('resolveLaneReasoning', () => {
	it('returns text defaults for text lane', () => {
		expect(resolveLaneReasoning('text')).toEqual({ exclude: true });
	});

	it('returns low effort for tool lane', () => {
		expect(resolveLaneReasoning('tool_calling')).toEqual({ effort: 'low', exclude: true });
	});

	it('returns undefined for json lane', () => {
		expect(resolveLaneReasoning('json')).toBeUndefined();
	});
});
