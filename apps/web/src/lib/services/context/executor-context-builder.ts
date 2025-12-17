// apps/web/src/lib/services/context/executor-context-builder.ts
/**
 * Executor Context Builder
 *
 * Builds minimal, task-focused contexts for executor agents.
 * Token budget: ~1500 tokens (task-specific, scoped tools)
 */

import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import type { ExecutorTask, ExecutorContext, BuildExecutorContextParams } from './types';
import { TOKEN_BUDGETS } from './types';
import { generateProjectContextFramework } from '../prompts/core/prompt-components';

// Project context document guidance for executor prompts
const PROJECT_CONTEXT_DOC_GUIDANCE = generateProjectContextFramework('condensed');

/**
 * Build context for an Executor Agent
 * Returns minimal, task-focused context with specific tools only
 */
export async function buildExecutorContext(
	params: BuildExecutorContextParams,
	extractDataFn: (
		task: ExecutorTask,
		userId: string,
		contextType?: ChatContextType,
		entityId?: string
	) => Promise<any>
): Promise<ExecutorContext> {
	const { executorId, sessionId, userId, task, tools, planId, contextType, entityId } = params;
	const normalizedContextType = contextType ? normalizeContextType(contextType) : undefined;

	// 1. Build system prompt for executor
	const systemPrompt = getExecutorSystemPrompt(task, normalizedContextType);

	// 2. Extract relevant data for the task (if available)
	const relevantData = await extractDataFn(task, userId, normalizedContextType, entityId);

	// 3. Calculate total tokens
	const totalTokens = estimateExecutorTokens({
		systemPrompt,
		task,
		tools,
		relevantData
	});

	return {
		systemPrompt,
		task,
		tools,
		relevantData,
		metadata: {
			executorId,
			sessionId,
			planId,
			totalTokens
		}
	};
}

/**
 * Get system prompt for Executor Agent
 * Task-specific instructions for focused execution
 */
export function getExecutorSystemPrompt(task: ExecutorTask, contextType?: ChatContextType): string {
	let prompt = `You are a Task Executor Agent in BuildOS.

## Your Role: Focused Task Execution

You are given ONE specific task to complete. Your job:
1. Execute the task using the provided tools
2. Return structured results
3. Do NOT engage in conversation - focus on the task

## Your Task

${task.description}

**Goal:** ${task.goal}

${task.constraints && task.constraints.length > 0 ? `**Constraints:**\n${task.constraints.map((c) => `- ${c}`).join('\n')}` : ''}

## Guidelines

- Use only the tools provided to you
- Be efficient - minimize tool calls
- Return results in the format requested
- If you encounter errors, include them in your response
- Do not ask clarifying questions - work with what you have

## Response Format

When complete, your final message should clearly indicate:
- What you found/did
- Any relevant IDs or data
- Any errors or issues encountered`;

	if (contextType === 'project_create') {
		prompt += `

## Project Context Document Requirements
${PROJECT_CONTEXT_DOC_GUIDANCE}

Apply this structure when generating the \`context_document.body_markdown\` in \`create_onto_project\`. The agent or human should be able to read it and immediately grasp the project's vision, strategy, and next strategic moves.`;
	}

	return prompt;
}

/**
 * Extract minimal relevant data for an executor task
 * Only includes data that's directly needed for the specific task
 */
export async function extractRelevantDataForExecutor(
	task: ExecutorTask,
	userId: string,
	contextType?: ChatContextType,
	entityId?: string
): Promise<any> {
	// If task already has context data, return it
	if (task.contextData) {
		return task.contextData;
	}

	// Otherwise, return minimal data
	// This will be enhanced based on actual task requirements
	return {
		userId,
		contextType,
		entityId
	};
}

/**
 * Estimate token count for executor context
 */
function estimateExecutorTokens(params: {
	systemPrompt: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	relevantData?: any;
}): number {
	const { systemPrompt, task, tools, relevantData } = params;

	let total = 0;
	total += estimateTokens(systemPrompt);
	total += estimateTokens(JSON.stringify(task));
	total += tools.length * 50; // Rough estimate per tool
	if (relevantData) total += estimateTokens(JSON.stringify(relevantData));

	return total;
}

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Normalize context type (convert 'general' to 'global')
 */
function normalizeContextType(contextType: ChatContextType): Exclude<ChatContextType, 'general'> {
	return (contextType === 'general' ? 'global' : contextType) as Exclude<
		ChatContextType,
		'general'
	>;
}
