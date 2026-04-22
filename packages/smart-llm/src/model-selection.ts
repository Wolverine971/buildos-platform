// packages/smart-llm/src/model-selection.ts

import type { JSONProfile, ModelProfile, TextProfile } from './types';
import {
	EMERGENCY_TEXT_FALLBACKS,
	ACTIVE_EXPERIMENT_MODEL,
	JSON_MODELS,
	JSON_PROFILE_MODELS,
	modelSupportsCapability,
	TEXT_MODELS,
	TEXT_PROFILE_MODELS,
	TOOL_CALLING_MODEL_ORDER,
	TOOL_CALLING_MODEL_SET
} from './model-config';

const REQUIREMENT_SELECTION_EXCLUDED_LIMITATIONS = new Set([
	'alpha-model',
	'no-active-endpoints',
	'not-default-production-routing',
	'route-only'
]);

export function analyzeComplexity(text: string): 'simple' | 'moderate' | 'complex' {
	const length = text.length;
	const hasNestedStructure = /\[\{|\{\[|":\s*\{|":\s*\[/.test(text);
	const hasComplexLogic = /if|when|decision|analyze|evaluate|extract/i.test(text);
	const hasMultipleSteps = /step \d|first.*then|phase|stage/i.test(text);

	if (length > 8000 || (hasNestedStructure && hasComplexLogic)) return 'complex';
	if (length > 3000 || hasComplexLogic || hasMultipleSteps) return 'moderate';
	return 'simple';
}

export function selectJSONModels(
	profile: JSONProfile,
	complexity: string,
	requirements?: any
): string[] {
	// If custom requirements, calculate best models
	if (profile === 'custom' && requirements) {
		return selectModelsByRequirements(JSON_MODELS, requirements, 'json');
	}

	// Validate profile and provide fallback
	const profileModels = JSON_PROFILE_MODELS[profile];
	if (!profileModels || !Array.isArray(profileModels)) {
		console.warn(`Invalid JSON profile: ${profile}, falling back to balanced`);
		return [...JSON_PROFILE_MODELS.balanced];
	}

	// Get base models for profile
	let models = [...profileModels];

	// Adjust based on complexity
	if (complexity === 'complex' && profile === 'fast') {
		// Upgrade to balanced for complex tasks
		models = [...JSON_PROFILE_MODELS.balanced];
	} else if (complexity === 'simple' && profile === 'powerful') {
		// Can use faster models for simple tasks
		models = [ACTIVE_EXPERIMENT_MODEL, ...models];
	}

	return Array.from(new Set(models));
}

export function selectTextModels(
	profile: TextProfile,
	estimatedLength: number,
	requirements?: any
): string[] {
	// If custom requirements, calculate best models
	if (profile === 'custom' && requirements) {
		return selectModelsByRequirements(TEXT_MODELS, requirements, 'text');
	}

	// Validate profile and provide fallback
	const profileModels = TEXT_PROFILE_MODELS[profile];
	if (!profileModels || !Array.isArray(profileModels)) {
		console.warn(`Invalid text profile: ${profile}, falling back to balanced`);
		return [...TEXT_PROFILE_MODELS.balanced];
	}

	// Get base models for profile
	let models = [...profileModels];

	// Adjust based on length
	if (estimatedLength > 3000 && profile === 'speed') {
		// Need more capable models for long content
		models = [...TEXT_PROFILE_MODELS.balanced];
	} else if (estimatedLength < 500 && profile === 'quality') {
		// Can use faster models for short content
		models = [ACTIVE_EXPERIMENT_MODEL, ...models];
	}

	return Array.from(new Set(models));
}

export function selectModelsByRequirements(
	modelPool: Record<string, ModelProfile>,
	requirements: any,
	type: 'json' | 'text'
): string[] {
	const models = Object.values(modelPool);

	// Filter by requirements
	const eligible = models.filter((model) => {
		if (requirements.maxCost && model.cost > requirements.maxCost) return false;
		if (requirements.minAccuracy && model.smartness < requirements.minAccuracy) return false;
		if (requirements.minQuality && model.smartness < requirements.minQuality) return false;
		return true;
	});
	const deployableEligible = eligible.filter(
		(model) =>
			!model.limitations?.some((limitation) =>
				REQUIREMENT_SELECTION_EXCLUDED_LIMITATIONS.has(limitation)
			)
	);
	const rankedPool = deployableEligible.length > 0 ? deployableEligible : eligible;

	// Calculate value score for each model
	const scored = rankedPool.map((model) => {
		// Zero-cost models should score highly without producing Infinity values.
		const costDenominator = model.cost > 0 ? model.cost : 0.01;
		let score: number;

		if (type === 'json') {
			// For JSON: prioritize accuracy and speed
			score = (model.smartness * 2 + model.speed) / costDenominator;
		} else {
			// For text: balance all factors
			const creativity = model.creativity || model.smartness;
			score = (model.smartness + model.speed + creativity) / costDenominator;
		}

		return { model, score };
	});

	// Sort by score and return top 3
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, 3).map((s) => s.model.id);
}

export function supportsJsonMode(modelId: string): boolean {
	return modelSupportsCapability(modelId, 'jsonMode');
}

export function estimateResponseLength(prompt: string): number {
	// Simple heuristic based on prompt length
	const promptLength = prompt.length;

	if (promptLength < 200) return 500;
	if (promptLength < 1000) return 1500;
	if (promptLength < 5000) return 3000;
	return 5000;
}

export function ensureToolCompatibleModels(models: string[]): string[] {
	const uniqueRequestedModels = Array.from(new Set(models));
	const requestedToolReadyModels = uniqueRequestedModels.filter((model) =>
		TOOL_CALLING_MODEL_SET.has(model)
	);

	if (requestedToolReadyModels.length > 0) {
		return requestedToolReadyModels;
	}

	console.warn(
		'No tool-capable models found in preferred list. Falling back to default tool-calling models.',
		{ requestedModels: models }
	);

	// Use fallback order while keeping values unique
	return Array.from(new Set<string>(TOOL_CALLING_MODEL_ORDER));
}

export function pickEmergencyTextModel(
	preferredModels: string[],
	attemptedModels: Set<string>
): string | null {
	for (const model of EMERGENCY_TEXT_FALLBACKS) {
		if (!attemptedModels.has(model) && TEXT_MODELS[model]) {
			return model;
		}
	}

	for (const model of preferredModels) {
		if (!attemptedModels.has(model)) {
			return model;
		}
	}

	return null;
}

export function ensureMinimumTextModels(models: string[], minModels = 3): string[] {
	const result = [...models];

	for (const fallback of EMERGENCY_TEXT_FALLBACKS) {
		if (result.length >= minModels) break;
		if (!result.includes(fallback)) {
			result.push(fallback);
		}
	}

	return result;
}
