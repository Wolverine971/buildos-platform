// apps/web/src/lib/services/openrouter-v2/model-lanes.ts

import type { ModelLane } from './types';

const DEFAULT_TEXT_MODELS = [
	'openai/gpt-4o-mini',
	'x-ai/grok-4.1-fast',
	'anthropic/claude-haiku-4.5'
] as const;

const DEFAULT_JSON_MODELS = [
	'openai/gpt-4o-mini',
	'deepseek/deepseek-chat',
	'qwen/qwen3-32b'
] as const;

const DEFAULT_TOOL_MODELS = [
	'openai/gpt-4o-mini',
	'x-ai/grok-4.1-fast',
	'anthropic/claude-haiku-4.5',
	'deepseek/deepseek-chat'
] as const;

const DEFAULT_TOOL_MODELS_EXACTO = [
	'deepseek/deepseek-v3.1-terminus:exacto',
	'qwen/qwen3-coder:exacto',
	'moonshotai/kimi-k2-0905:exacto',
	'openai/gpt-4o-mini'
] as const;

function parseModelList(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function uniqueModels(models: string[]): string[] {
	return Array.from(new Set(models));
}

function getLaneEnvOverrides(lane: ModelLane): string[] {
	switch (lane) {
		case 'text':
			return parseModelList(process.env.OPENROUTER_V2_LANE_TEXT_MODELS);
		case 'json':
			return parseModelList(process.env.OPENROUTER_V2_LANE_JSON_MODELS);
		case 'tool_calling':
			return parseModelList(process.env.OPENROUTER_V2_LANE_TOOL_MODELS);
		default:
			return [];
	}
}

function laneDefaults(lane: ModelLane, exactoToolsEnabled: boolean): string[] {
	switch (lane) {
		case 'text':
			return [...DEFAULT_TEXT_MODELS];
		case 'json':
			return [...DEFAULT_JSON_MODELS];
		case 'tool_calling':
			return exactoToolsEnabled ? [...DEFAULT_TOOL_MODELS_EXACTO] : [...DEFAULT_TOOL_MODELS];
		default:
			return [...DEFAULT_TEXT_MODELS];
	}
}

export type ResolveLaneModelsParams = {
	lane: ModelLane;
	model?: string;
	models?: string[];
	exactoToolsEnabled?: boolean;
};

export function resolveLaneModels(params: ResolveLaneModelsParams): string[] {
	const exactoToolsEnabled = params.exactoToolsEnabled ?? false;
	const lane = params.lane;
	const explicitPrimary = typeof params.model === 'string' ? params.model.trim() : '';
	const explicitFallbacks = Array.isArray(params.models)
		? params.models.map((model) => model.trim()).filter(Boolean)
		: [];
	const laneOverrides = getLaneEnvOverrides(lane);
	const globalOverrides = parseModelList(process.env.OPENROUTER_V2_DEFAULT_MODELS);
	const defaults = laneDefaults(lane, exactoToolsEnabled);
	const merged = uniqueModels([
		...(explicitPrimary ? [explicitPrimary] : []),
		...explicitFallbacks,
		...laneOverrides,
		...globalOverrides,
		...defaults
	]);

	if (merged.length > 0) {
		return merged;
	}

	return ['openai/gpt-4o-mini'];
}

export function resolveLaneReasoning(lane: ModelLane):
	| {
			exclude?: boolean;
			effort?: 'low' | 'medium' | 'high';
	  }
	| undefined {
	if (lane === 'text') {
		return { exclude: true };
	}
	if (lane === 'tool_calling') {
		return { effort: 'low' };
	}
	return undefined;
}
