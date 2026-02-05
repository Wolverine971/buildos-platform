// packages/smart-llm/src/model-selection.ts

import type { JSONProfile, ModelProfile, TextProfile } from './types';
import {
	EMERGENCY_TEXT_FALLBACKS,
	JSON_MODELS,
	JSON_PROFILE_MODELS,
	TEXT_MODELS,
	TEXT_PROFILE_MODELS,
	TOOL_CALLING_MODEL_ORDER,
	TOOL_CALLING_MODEL_SET
} from './model-config';

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
		models = ['deepseek/deepseek-chat', ...models];
	}

	return models;
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
		models = ['deepseek/deepseek-chat', ...models];
	}

	return models;
}

export function selectModelsByRequirements(
	modelPool: Record<string, ModelProfile>,
	requirements: any,
	type: 'json' | 'text'
): string[] {
	const models = Object.values(modelPool);

	// Filter by requirements
	let eligible = models.filter((model) => {
		if (requirements.maxCost && model.cost > requirements.maxCost) return false;
		if (requirements.minAccuracy && model.smartness < requirements.minAccuracy) return false;
		if (requirements.minQuality && model.smartness < requirements.minQuality) return false;
		return true;
	});

	// Calculate value score for each model
	const scored = eligible.map((model) => {
		let score: number;

		if (type === 'json') {
			// For JSON: prioritize accuracy and speed
			score = (model.smartness * 2 + model.speed) / model.cost;
		} else {
			// For text: balance all factors
			const creativity = model.creativity || model.smartness;
			score = (model.smartness + model.speed + creativity) / model.cost;
		}

		return { model, score };
	});

	// Sort by score and return top 3
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, 3).map((s) => s.model.id);
}

export function supportsJsonMode(modelId: string): boolean {
	// Models that support native JSON mode (response_format: { type: 'json_object' })
	// Updated 2025-12-23 with latest model support
	const jsonModeModels = [
		// OpenAI models - excellent JSON mode support
		'openai/gpt-4o',
		'openai/gpt-4o-mini',
		// DeepSeek models
		'deepseek/deepseek-chat',
		'deepseek/deepseek-r1',
		// Qwen models
		'qwen/qwen3-32b', // Excellent structured output
		// Google Gemini models
		'google/gemini-2.5-flash', // Hybrid reasoning with JSON support
		'google/gemini-2.5-flash-lite',
		'google/gemini-2.0-flash-001',
		// xAI Grok models
		'x-ai/grok-4.1-fast', // Tool-calling optimized, excellent JSON support
		// Other models
		'z-ai/glm-4.7', // Good structured output (updated from glm-4.6)
		'minimax/minimax-m2.1', // Supports structured outputs
		'moonshotai/kimi-k2-thinking' // Supports structured outputs (reasoning tokens separate)
		// Note: Anthropic Claude models do NOT support native JSON mode
		// They require prompt-based JSON instructions
	];

	return jsonModeModels.includes(modelId);
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
	const toolReadyModels = models.filter((model) => TOOL_CALLING_MODEL_SET.has(model));

	if (toolReadyModels.length > 0) {
		return toolReadyModels;
	}

	console.warn(
		'No tool-capable models found in preferred list. Falling back to default tool-calling models.',
		{ requestedModels: models }
	);

	// Use fallback order while keeping values unique
	return Array.from(
		new Set<string>([
			...models.filter((model) => TOOL_CALLING_MODEL_SET.has(model)),
			...TOOL_CALLING_MODEL_ORDER
		])
	);
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
