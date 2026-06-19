// apps/web/src/lib/services/openrouter-v2/model-lanes.test.ts

import { describe, expect, it } from 'vitest';
import {
	ACTIVE_EXPERIMENT_MODEL,
	AGENT_STATE_RECONCILIATION_MODEL,
	JSON_PROFILE_MODELS,
	OPENROUTER_V2_JSON_MODELS,
	OPENROUTER_V2_MULTIMODAL_MODELS,
	OPENROUTER_V2_TEXT_MODELS,
	OPENROUTER_V2_TOOL_MODELS,
	OPENROUTER_V2_TOOL_MODELS_EXACTO,
	TEXT_PROFILE_MODELS
} from '@buildos/smart-llm';
import { resolveLaneModels, resolveLaneReasoning } from './model-lanes';

describe('resolveLaneModels', () => {
	it('returns default text lane models when no explicit selection is provided', () => {
		const result = resolveLaneModels({ lane: 'text' });

		expect(result).toEqual([...OPENROUTER_V2_TEXT_MODELS]);
	});

	it('returns default tool lane models when exacto is disabled', () => {
		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: false });

		expect(result).toEqual([...OPENROUTER_V2_TOOL_MODELS]);
	});

	it('returns upgraded JSON lane defaults', () => {
		const result = resolveLaneModels({ lane: 'json' });

		expect(result).toEqual([...OPENROUTER_V2_JSON_MODELS]);
	});

	it('returns multimodal lane defaults for image-capable turns', () => {
		const result = resolveLaneModels({ lane: 'multimodal' });

		expect(result).toEqual([...OPENROUTER_V2_MULTIMODAL_MODELS]);
	});

	it('uses exacto defaults for tool lane when enabled', () => {
		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: true });

		expect(result).toEqual([...OPENROUTER_V2_TOOL_MODELS_EXACTO]);
	});

	it('prioritizes explicit compatible models and keeps unique ordering', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: ACTIVE_EXPERIMENT_MODEL,
			models: [ACTIVE_EXPERIMENT_MODEL, 'legacy/openai-model']
		});

		expect(result).toEqual(
			[ACTIVE_EXPERIMENT_MODEL, ...OPENROUTER_V2_JSON_MODELS].filter(
				(model, index, models) => models.indexOf(model) === index
			)
		);
	});

	it('filters explicit unknown or lane-incompatible models before defaults', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: 'custom/model',
			models: ['custom/model', 'legacy/free-model']
		});

		expect(result).not.toContain('custom/model');
		expect(result).not.toContain('legacy/free-model');
		expect(result).toEqual([...OPENROUTER_V2_JSON_MODELS]);
	});

	it('falls back to JSON defaults for the reconciliation model without allowlist overrides', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: AGENT_STATE_RECONCILIATION_MODEL
		});

		expect(result).toEqual([...OPENROUTER_V2_JSON_MODELS]);
	});

	it('can route reconciliation JSON without adding active defaults', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: AGENT_STATE_RECONCILIATION_MODEL,
			models: [AGENT_STATE_RECONCILIATION_MODEL],
			allowedModelIds: [AGENT_STATE_RECONCILIATION_MODEL],
			includeDefaultModels: false
		});

		expect(result).toEqual([AGENT_STATE_RECONCILIATION_MODEL]);
	});

	it('honors text profile hints before text lane defaults', () => {
		const result = resolveLaneModels({ lane: 'text', profile: 'quality' });

		expect(result).toEqual(
			[...TEXT_PROFILE_MODELS.quality, ...OPENROUTER_V2_TEXT_MODELS].filter(
				(model, index, models) => models.indexOf(model) === index
			)
		);
	});

	it('honors JSON profile hints with JSON-capable models only', () => {
		const result = resolveLaneModels({ lane: 'json', profile: 'fast' });

		expect(result).not.toContain('custom/model');
		expect(result).toEqual(
			[...JSON_PROFILE_MODELS.fast, ...OPENROUTER_V2_JSON_MODELS].filter(
				(model, index, models) => models.indexOf(model) === index
			)
		);
	});

	it('keeps tool lane defaults ahead of broad profile fallbacks', () => {
		const result = resolveLaneModels({
			lane: 'tool_calling',
			profile: 'balanced',
			exactoToolsEnabled: false
		});

		expect(result).toEqual([...OPENROUTER_V2_TOOL_MODELS]);
	});
});

describe('resolveLaneReasoning', () => {
	it('returns text defaults for text lane', () => {
		expect(resolveLaneReasoning('text')).toEqual({ exclude: true });
	});

	it('preserves low-effort reasoning traces for tool lane continuity', () => {
		expect(resolveLaneReasoning('tool_calling')).toEqual({ effort: 'low', exclude: false });
	});

	it('returns low-effort hidden reasoning for json lane', () => {
		expect(resolveLaneReasoning('json')).toEqual({ effort: 'low', exclude: true });
	});

	it('excludes reasoning traces for multimodal lane', () => {
		expect(resolveLaneReasoning('multimodal')).toEqual({ exclude: true });
	});
});
