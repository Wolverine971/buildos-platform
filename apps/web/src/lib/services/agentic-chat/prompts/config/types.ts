// apps/web/src/lib/services/agentic-chat/prompts/config/types.ts
/**
 * Prompt Configuration Types
 *
 * Type definitions for the prompt configuration system.
 * All prompts are stored as typed objects for easy iteration.
 */

/**
 * Base prompt template with metadata
 */
export interface PromptTemplate {
	/** Unique identifier for the prompt */
	id: string;
	/** Human-readable name */
	name: string;
	/** Brief description of what this prompt does */
	description: string;
	/** The actual prompt content (may contain {{placeholders}}) */
	content: string;
	/** Version for tracking changes */
	version: string;
	/** When this prompt was last updated */
	lastUpdated: string;
}

/**
 * Prompt section that can be conditionally included
 */
export interface PromptSection {
	/** Section identifier */
	id: string;
	/** Section title (used as markdown header if includeHeader is true) */
	title: string;
	/** The section content */
	content: string;
	/** Whether to include the title as a markdown header */
	includeHeader?: boolean;
}

/**
 * Context-specific prompt configuration
 */
export interface ContextPromptConfig {
	/** Context type this config applies to */
	contextType: string;
	/** Base sections always included */
	baseSections: string[];
	/** Additional sections for this context */
	additionalSections?: string[];
	/** Sections to exclude in this context */
	excludeSections?: string[];
}

/**
 * Planner agent prompt configuration
 */
export interface PlannerPromptConfig {
	/** Core system identity and role */
	identity: PromptSection;
	/** User-facing language rules */
	languageRules: PromptSection;
	/** Data access patterns and progressive disclosure */
	dataAccessPatterns: PromptSection;
	/** Available strategies */
	strategies: PromptSection;
	/** Important guidelines */
	guidelines: PromptSection;
	/** Non-destructive update rules */
	updateRules: PromptSection;
	/** Task creation philosophy */
	taskCreationPhilosophy: PromptSection;
}

/**
 * Executor agent prompt configuration
 */
export interface ExecutorPromptConfig {
	/** Core executor identity */
	identity: PromptSection;
	/** Task execution guidelines */
	executionGuidelines: PromptSection;
	/** Response format requirements */
	responseFormat: PromptSection;
}

/**
 * Project creation prompt configuration
 */
export interface ProjectCreationPromptConfig {
	/** Context introduction */
	introduction: PromptSection;
	/** User communication rules */
	userCommunicationRules: PromptSection;
	/** Internal capabilities (hidden from user) */
	internalCapabilities: PromptSection;
	/** Tool usage guide */
	toolUsageGuide: PromptSection;
	/** Workflow steps */
	workflowSteps: PromptSection;
	/** Prop extraction examples */
	propExamples: PromptSection;
}

/**
 * Brain dump exploration prompt configuration
 */
export interface BrainDumpPromptConfig {
	/** Core approach */
	coreApproach: PromptSection;
	/** User state awareness */
	userStates: PromptSection;
	/** Engagement guidelines */
	engagementGuidelines: PromptSection;
	/** What not to do */
	antiPatterns: PromptSection;
	/** When to transition to action */
	transitionTriggers: PromptSection;
}

/**
 * Context display names for different modes
 */
export type ContextDisplayNames = Record<string, string>;

/**
 * Fallback context messages
 */
export type FallbackContextMessages = Record<string, string>;
