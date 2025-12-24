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
 *
 * Sections are organized in cognitive order:
 * 1. Foundation (identity, platform, data model) - WHO am I, WHAT is BuildOS, HOW is data organized
 * 2. Operational (consolidated) - HOW to operate
 * 3. Behavioral (consolidated) - RULES to follow
 *
 * Phase 2 consolidates verbose sections for token efficiency while adding
 * error handling and proactive intelligence guidance.
 */
export interface PlannerPromptConfig {
	// === FOUNDATION SECTIONS ===
	/** Core system identity and role */
	identity: PromptSection;
	/** Platform context - what BuildOS is, who users are */
	platformContext: PromptSection;
	/** Data model overview - how information is organized */
	dataModelOverview: PromptSection;

	// === OPERATIONAL SECTION (Consolidated) ===
	/** Consolidated operational guidelines: data access, strategies, response style */
	operationalGuidelines: PromptSection;

	// === BEHAVIORAL SECTIONS (Consolidated + New) ===
	/** Consolidated behavioral rules: language, task creation, updates */
	behavioralRules: PromptSection;
	/** Error handling and recovery patterns */
	errorHandling: PromptSection;
	/** Proactive insight surfacing */
	proactiveIntelligence: PromptSection;
}

/**
 * Legacy planner sections (kept for reference/compatibility)
 * These have been consolidated into operationalGuidelines and behavioralRules
 */
export interface PlannerLegacySections {
	/** @deprecated Use operationalGuidelines instead */
	dataAccessPatterns: PromptSection;
	/** @deprecated Use operationalGuidelines instead */
	strategies: PromptSection;
	/** @deprecated Use operationalGuidelines instead */
	guidelines: PromptSection;
	/** @deprecated Use behavioralRules instead */
	languageRules: PromptSection;
	/** @deprecated Use behavioralRules instead */
	updateRules: PromptSection;
	/** @deprecated Use behavioralRules instead */
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
	/** Single concise guide for braindump mode */
	guide: PromptSection;
}

/**
 * Context display names for different modes
 */
export type ContextDisplayNames = Record<string, string>;

/**
 * Fallback context messages
 */
export type FallbackContextMessages = Record<string, string>;
