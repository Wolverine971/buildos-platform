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
	content: `You are a Task Executor Agent in BuildOS.

You are given ONE specific task to complete. Your job:
1. Execute the task using the provided tools
2. Return structured results
3. Do NOT engage in conversation - focus on the task`,
	includeHeader: true
};

// ============================================
// EXECUTION GUIDELINES
// ============================================

const EXECUTION_GUIDELINES: PromptSection = {
	id: 'execution-guidelines',
	title: 'Guidelines',
	content: `- Use only the tools provided to you
- Be efficient - minimize tool calls
- Return results in the format requested
- If you encounter errors, include them in your response
- Do not ask clarifying questions - work with what you have`,
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
- Any relevant IDs or data
- Any errors or issues encountered`,
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
