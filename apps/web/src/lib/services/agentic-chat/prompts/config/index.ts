// apps/web/src/lib/services/agentic-chat/prompts/config/index.ts
/**
 * Prompt Configuration Module
 *
 * Central export point for all prompt configurations.
 * This module provides type-safe, organized access to all LLM prompts
 * used in the agentic chat system.
 *
 * Usage:
 * ```typescript
 * import { PLANNER_PROMPTS, EXECUTOR_PROMPTS, buildBrainDumpPrompt } from './config';
 *
 * // Access individual sections
 * const rules = PLANNER_PROMPTS.languageRules.content;
 *
 * // Build complete prompts
 * const brainDumpPrompt = buildBrainDumpPrompt();
 * ```
 *
 * @module prompts/config
 * @version 1.0.0
 */

// Types
export type {
	PromptTemplate,
	PromptSection,
	ContextPromptConfig,
	PlannerPromptConfig,
	ExecutorPromptConfig,
	ProjectCreationPromptConfig,
	BrainDumpPromptConfig,
	ContextDisplayNames,
	FallbackContextMessages
} from './types';

// Planner prompts
export {
	PLANNER_PROMPTS,
	PLANNER_ADDITIONAL_SECTIONS,
	getPlannerSections,
	getPlannerBaseInstructionSections
} from './planner-prompts';

// Executor prompts
export { EXECUTOR_PROMPTS, buildExecutorPromptFromConfig } from './executor-prompts';

// Context-specific prompts
export {
	PROJECT_WORKSPACE_PROMPT,
	PROJECT_CREATION_PROMPTS,
	BRAIN_DUMP_PROMPTS,
	CONTEXT_DISPLAY_NAMES,
	FALLBACK_CONTEXT_MESSAGES,
	getFallbackMessage,
	getContextDisplayName,
	buildBrainDumpPrompt
} from './context-prompts';

// ============================================
// PROMPT ASSEMBLY UTILITIES
// ============================================

import type { PromptSection } from './types';

/**
 * Assemble prompt sections into a single string
 *
 * @param sections - Array of prompt sections to assemble
 * @param options - Assembly options
 * @returns Assembled prompt string
 */
export function assembleSections(
	sections: PromptSection[],
	options: {
		separator?: string;
		headerPrefix?: string;
	} = {}
): string {
	const { separator = '\n\n', headerPrefix = '##' } = options;

	return sections
		.map((section) => {
			if (section.includeHeader !== false) {
				return `${headerPrefix} ${section.title}\n\n${section.content}`;
			}
			return section.content;
		})
		.join(separator);
}

/**
 * Create a prompt section with defaults
 */
export function createSection(
	id: string,
	title: string,
	content: string,
	includeHeader = true
): PromptSection {
	return { id, title, content, includeHeader };
}

/**
 * Merge multiple prompt sections, deduplicating by ID
 */
export function mergeSections(...sectionArrays: PromptSection[][]): PromptSection[] {
	const seen = new Set<string>();
	const merged: PromptSection[] = [];

	for (const sections of sectionArrays) {
		for (const section of sections) {
			if (!seen.has(section.id)) {
				seen.add(section.id);
				merged.push(section);
			}
		}
	}

	return merged;
}
