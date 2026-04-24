// apps/web/src/lib/services/openrouter-v2/model-lanes.ts

import {
	ACTIVE_RUNTIME_MODEL_SET,
	ensureToolCompatibleModels,
	ACTIVE_EXPERIMENT_MODEL,
	type JSONProfile,
	MODEL_CATALOG,
	OPENROUTER_V2_JSON_MODELS,
	OPENROUTER_V2_TEXT_MODELS,
	OPENROUTER_V2_TOOL_MODELS,
	OPENROUTER_V2_TOOL_MODELS_EXACTO,
	selectJSONModels,
	selectTextModels,
	type TextProfile
} from '@buildos/smart-llm';
import type { ModelLane } from './types';

function uniqueModels(models: string[]): string[] {
	return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function laneDefaults(lane: ModelLane, exactoToolsEnabled: boolean): string[] {
	switch (lane) {
		case 'text':
			return [...OPENROUTER_V2_TEXT_MODELS];
		case 'json':
			return [...OPENROUTER_V2_JSON_MODELS];
		case 'tool_calling':
			return exactoToolsEnabled
				? [...OPENROUTER_V2_TOOL_MODELS_EXACTO]
				: [...OPENROUTER_V2_TOOL_MODELS];
		default:
			return [...OPENROUTER_V2_TEXT_MODELS];
	}
}

function laneProfileModels(params: {
	lane: ModelLane;
	profile?: JSONProfile | TextProfile;
	estimatedLength?: number;
	complexity?: 'simple' | 'moderate' | 'complex';
	exactoToolsEnabled: boolean;
}): string[] {
	if (!params.profile) return [];
	if (params.lane === 'json') {
		return selectJSONModels(params.profile as JSONProfile, params.complexity ?? 'moderate');
	}
	if (params.lane === 'tool_calling') {
		if (params.exactoToolsEnabled) return [];
		return ensureToolCompatibleModels(
			selectTextModels(params.profile as TextProfile, params.estimatedLength ?? 1500)
		);
	}
	return selectTextModels(params.profile as TextProfile, params.estimatedLength ?? 1500);
}

function isLaneCompatible(
	model: string,
	lane: ModelLane,
	exactoToolsEnabled: boolean,
	allowedModelSet: ReadonlySet<string>
): boolean {
	if (!allowedModelSet.has(model)) return false;

	const profile = MODEL_CATALOG[model];
	if (!profile) return false;

	const limitations = profile.limitations ?? [];
	const routeOnly = limitations.includes('route-only');
	if (routeOnly && !(lane === 'tool_calling' && exactoToolsEnabled)) {
		return false;
	}

	if (lane === 'json') {
		return (
			profile.capabilities?.jsonMode === true ||
			profile.capabilities?.structuredOutputs === true
		);
	}
	if (lane === 'tool_calling') {
		return profile.capabilities?.tools === true;
	}
	return true;
}

function filterLaneCompatible(
	models: string[],
	lane: ModelLane,
	exactoToolsEnabled: boolean,
	allowedModelSet: ReadonlySet<string>
): string[] {
	return uniqueModels(models).filter((model) =>
		isLaneCompatible(model, lane, exactoToolsEnabled, allowedModelSet)
	);
}

export type ResolveLaneModelsParams = {
	lane: ModelLane;
	model?: string;
	models?: string[];
	exactoToolsEnabled?: boolean;
	profile?: JSONProfile | TextProfile;
	estimatedLength?: number;
	complexity?: 'simple' | 'moderate' | 'complex';
	allowedModelIds?: string[];
	includeDefaultModels?: boolean;
};

export function resolveLaneModels(params: ResolveLaneModelsParams): string[] {
	const exactoToolsEnabled = params.exactoToolsEnabled ?? false;
	const lane = params.lane;
	const allowedModelSet =
		Array.isArray(params.allowedModelIds) && params.allowedModelIds.length > 0
			? new Set<string>([
					...ACTIVE_RUNTIME_MODEL_SET,
					...params.allowedModelIds.map((model) => model.trim()).filter(Boolean)
				])
			: ACTIVE_RUNTIME_MODEL_SET;
	const explicitPrimary = typeof params.model === 'string' ? params.model.trim() : '';
	const explicitFallbacks = Array.isArray(params.models)
		? params.models.map((model) => model.trim()).filter(Boolean)
		: [];
	const explicitModels = filterLaneCompatible(
		[...(explicitPrimary ? [explicitPrimary] : []), ...explicitFallbacks],
		lane,
		exactoToolsEnabled,
		allowedModelSet
	);
	const profileModels = filterLaneCompatible(
		laneProfileModels({
			lane,
			profile: params.profile,
			estimatedLength: params.estimatedLength,
			complexity: params.complexity,
			exactoToolsEnabled
		}),
		lane,
		exactoToolsEnabled,
		allowedModelSet
	);
	const defaults =
		params.includeDefaultModels === false
			? []
			: filterLaneCompatible(
					laneDefaults(lane, exactoToolsEnabled),
					lane,
					exactoToolsEnabled,
					allowedModelSet
				);
	const merged =
		lane === 'tool_calling'
			? uniqueModels([...explicitModels, ...defaults, ...profileModels])
			: uniqueModels([...explicitModels, ...profileModels, ...defaults]);

	if (merged.length > 0) {
		return merged;
	}

	return [ACTIVE_EXPERIMENT_MODEL];
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
		return { exclude: true };
	}
	if (lane === 'json') {
		return { effort: 'low', exclude: true };
	}
	return undefined;
}
