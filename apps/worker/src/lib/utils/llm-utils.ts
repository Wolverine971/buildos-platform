// apps/worker/src/lib/utils/llm-utils.ts
/**
 * Select optimal models based on total prompt complexity (system + user prompts)
 */
// src/lib/utils/llm-utils.ts
export const selectModelsForPromptComplexity = (
	totalPromptLength: number,
	isNewProject: boolean,
	isDualProcessing: boolean = false
): string[] => {
	// Very simple prompts - use cheapest options
	if (totalPromptLength < 2000 && !isNewProject && !isDualProcessing) {
		return ['gpt-4o-mini', 'gpt-5-nano'];
	}

	// Medium complexity - balance cost and performance
	if (totalPromptLength < 5000 && !isDualProcessing) {
		return ['gpt-5-nano', 'gpt-4o-mini', 'gpt-5-mini'];
	}

	// Complex tasks - use more capable models
	if (isDualProcessing || totalPromptLength >= 10000 || isNewProject) {
		return ['gpt-5-mini', 'gpt-4o'];
	}

	// Very complex or coding tasks
	if (totalPromptLength >= 20000) {
		return ['gpt-5-mini', 'gpt-4o', 'gpt-5'];
	}

	// Default balanced approach
	return ['gpt-5-nano', 'gpt-4o-mini'];
};
