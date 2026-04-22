// apps/web/src/lib/services/openrouter-v2/model-lanes.test.ts

import { describe, expect, it } from 'vitest';
import { ACTIVE_EXPERIMENT_MODEL, AGENT_STATE_RECONCILIATION_MODEL } from '@buildos/smart-llm';
import { resolveLaneModels, resolveLaneReasoning } from './model-lanes';

describe('resolveLaneModels', () => {
	it('returns default text lane models when no explicit selection is provided', () => {
		const result = resolveLaneModels({ lane: 'text' });

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('returns default tool lane models when exacto is disabled', () => {
		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: false });

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('returns upgraded JSON lane defaults', () => {
		const result = resolveLaneModels({ lane: 'json' });

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('uses exacto defaults for tool lane when enabled', () => {
		const result = resolveLaneModels({ lane: 'tool_calling', exactoToolsEnabled: true });

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('prioritizes explicit compatible models and keeps unique ordering', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: ACTIVE_EXPERIMENT_MODEL,
			models: [ACTIVE_EXPERIMENT_MODEL, 'openai/gpt-4o-mini']
		});

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('filters explicit unknown or lane-incompatible models before defaults', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: 'custom/model',
			models: ['custom/model', 'nvidia/nemotron-3-super-120b-a12b:free']
		});

		expect(result).not.toContain('custom/model');
		expect(result).not.toContain('nvidia/nemotron-3-super-120b-a12b:free');
		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('filters non-active side-route models unless they are explicitly allowlisted', () => {
		const result = resolveLaneModels({
			lane: 'json',
			model: AGENT_STATE_RECONCILIATION_MODEL
		});

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('can route a JSON side-route to an allowlisted model without active defaults', () => {
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

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('honors JSON profile hints with JSON-capable models only', () => {
		const result = resolveLaneModels({ lane: 'json', profile: 'fast' });

		expect(result).not.toContain('custom/model');
		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});

	it('keeps tool lane defaults ahead of broad profile fallbacks', () => {
		const result = resolveLaneModels({
			lane: 'tool_calling',
			profile: 'balanced',
			exactoToolsEnabled: false
		});

		expect(result).toEqual([ACTIVE_EXPERIMENT_MODEL]);
	});
});

describe('resolveLaneReasoning', () => {
	it('returns text defaults for text lane', () => {
		expect(resolveLaneReasoning('text')).toEqual({ exclude: true });
	});

	it('excludes reasoning traces for tool lane', () => {
		expect(resolveLaneReasoning('tool_calling')).toEqual({ exclude: true });
	});

	it('returns undefined for json lane', () => {
		expect(resolveLaneReasoning('json')).toBeUndefined();
	});
});
