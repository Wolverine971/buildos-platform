// apps/web/src/lib/services/openrouter-v2/model-lanes.test.ts

import { afterEach, describe, expect, it } from 'vitest';
import { resolveLaneModels, resolveLaneReasoning } from './model-lanes';

const ORIGINAL_ENV = {
	OPENROUTER_V2_DEFAULT_MODELS: process.env.OPENROUTER_V2_DEFAULT_MODELS,
	OPENROUTER_V2_LANE_TEXT_MODELS: process.env.OPENROUTER_V2_LANE_TEXT_MODELS,
	OPENROUTER_V2_LANE_JSON_MODELS: process.env.OPENROUTER_V2_LANE_JSON_MODELS,
	OPENROUTER_V2_LANE_TOOL_MODELS: process.env.OPENROUTER_V2_LANE_TOOL_MODELS
};

afterEach(() => {
	if (ORIGINAL_ENV.OPENROUTER_V2_DEFAULT_MODELS === undefined) {
		delete process.env.OPENROUTER_V2_DEFAULT_MODELS;
	} else {
		process.env.OPENROUTER_V2_DEFAULT_MODELS = ORIGINAL_ENV.OPENROUTER_V2_DEFAULT_MODELS;
	}

	if (ORIGINAL_ENV.OPENROUTER_V2_LANE_TEXT_MODELS === undefined) {
		delete process.env.OPENROUTER_V2_LANE_TEXT_MODELS;
	} else {
		process.env.OPENROUTER_V2_LANE_TEXT_MODELS = ORIGINAL_ENV.OPENROUTER_V2_LANE_TEXT_MODELS;
	}

	if (ORIGINAL_ENV.OPENROUTER_V2_LANE_JSON_MODELS === undefined) {
		delete process.env.OPENROUTER_V2_LANE_JSON_MODELS;
	} else {
		process.env.OPENROUTER_V2_LANE_JSON_MODELS = ORIGINAL_ENV.OPENROUTER_V2_LANE_JSON_MODELS;
	}

	if (ORIGINAL_ENV.OPENROUTER_V2_LANE_TOOL_MODELS === undefined) {
		delete process.env.OPENROUTER_V2_LANE_TOOL_MODELS;
	} else {
		process.env.OPENROUTER_V2_LANE_TOOL_MODELS = ORIGINAL_ENV.OPENROUTER_V2_LANE_TOOL_MODELS;
	}
});

describe('resolveLaneModels', () => {
	it('returns default text lane models when no overrides are provided', () => {
		delete process.env.OPENROUTER_V2_DEFAULT_MODELS;
		delete process.env.OPENROUTER_V2_LANE_TEXT_MODELS;

		const result = resolveLaneModels({ lane: 'text' });

		expect(result[0]).toBe('openai/gpt-4o-mini');
		expect(result).toContain('anthropic/claude-haiku-4.5');
	});

	it('uses exacto defaults for tool lane when enabled', () => {
		delete process.env.OPENROUTER_V2_LANE_TOOL_MODELS;

		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: true });

		expect(result[0]).toBe('deepseek/deepseek-v3.1-terminus:exacto');
		expect(result).toContain('openai/gpt-4o-mini');
	});

	it('prioritizes explicit model and keeps unique ordering', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: 'custom/model',
			models: ['custom/model', 'openai/gpt-4o-mini']
		});

		expect(result[0]).toBe('custom/model');
		expect(result.filter((entry) => entry === 'custom/model')).toHaveLength(1);
	});

	it('includes lane overrides from env', () => {
		process.env.OPENROUTER_V2_LANE_JSON_MODELS = 'override/json-a, override/json-b';

		const result = resolveLaneModels({ lane: 'json' });

		expect(result).toContain('override/json-a');
		expect(result).toContain('override/json-b');
	});
});

describe('resolveLaneReasoning', () => {
	it('returns text defaults for text lane', () => {
		expect(resolveLaneReasoning('text')).toEqual({ exclude: true });
	});

	it('returns low effort for tool lane', () => {
		expect(resolveLaneReasoning('tool_calling')).toEqual({ effort: 'low' });
	});

	it('returns undefined for json lane', () => {
		expect(resolveLaneReasoning('json')).toBeUndefined();
	});
});
