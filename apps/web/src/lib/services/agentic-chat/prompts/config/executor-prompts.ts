// apps/web/src/lib/services/agentic-chat/prompts/config/executor-prompts.ts
/**
 * Executor Agent Prompt Configuration
 *
 * All prompts for the executor agent in the agentic chat system.
 * Executors handle focused, single-task execution with minimal context.
 *
 * @version 1.0.0
 * @lastUpdated 2025-01-16
 */

import type { ExecutorPromptConfig, PromptSection } from './types';

// ============================================
// EXECUTOR IDENTITY
// ============================================

const EXECUTOR_IDENTITY: PromptSection = {
	id: 'executor-identity',
	title: 'Your Role: Focused Task Execution',
	content: `You are a Task Executor Agent in BuildOS. You receive ONE task: execute it with provided tools and return structured results. Do NOT engage in conversation.`,
	includeHeader: true
};

// ============================================
// EXECUTION GUIDELINES
// ============================================

const EXECUTION_GUIDELINES: PromptSection = {
	id: 'execution-guidelines',
	title: 'Guidelines',
	content: `- Use only the tools provided; honor constraints (if read-only, do not call write tools)
- Only call \`search_ontology\` with a non-empty \`query\`; if missing, skip the call and note the missing input in results
- Minimize tool calls
- If a tool fails or data is missing, return partial results and the next read action
- Never guess or fabricate IDs. If an ID is missing or uncertain, do not call update/delete tools; report the missing ID and the next read tool to use
- Do not ask clarifying questions; work with what you have`,
	includeHeader: true
};

// ============================================
// RESPONSE FORMAT
// ============================================

const RESPONSE_FORMAT: PromptSection = {
	id: 'response-format',
	title: 'Response Format',
	content: `When complete, your final message should clearly indicate:
- What you found/did
- Relevant IDs or data
- Errors or missing data and the next step`,
	includeHeader: true
};

// ============================================
// EXPORTED CONFIG
// ============================================

export const EXECUTOR_PROMPTS: ExecutorPromptConfig = {
	identity: EXECUTOR_IDENTITY,
	executionGuidelines: EXECUTION_GUIDELINES,
	responseFormat: RESPONSE_FORMAT
};

/**
 * Build executor system prompt from config
 *
 * @param taskDescription - Description of the task to execute
 * @param taskGoal - Goal of the task
 * @param constraints - Optional constraints for execution
 * @returns Assembled executor prompt
 */
export function buildExecutorPromptFromConfig(
	taskDescription: string,
	taskGoal: string,
	constraints?: string[]
): string {
	const sections: string[] = [];

	// Identity section
	sections.push(`## ${EXECUTOR_IDENTITY.title}\n\n${EXECUTOR_IDENTITY.content}`);

	// Task section
	sections.push(`## Your Task\n\n${taskDescription}\n\n**Goal:** ${taskGoal}`);

	// Constraints if provided
	if (constraints && constraints.length > 0) {
		sections.push(`**Constraints:**\n${constraints.map((c) => `- ${c}`).join('\n')}`);
	}

	// Guidelines
	sections.push(`## ${EXECUTION_GUIDELINES.title}\n\n${EXECUTION_GUIDELINES.content}`);

	// Response format
	sections.push(`## ${RESPONSE_FORMAT.title}\n\n${RESPONSE_FORMAT.content}`);

	return sections.join('\n\n');
}
