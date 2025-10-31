// apps/web/src/lib/services/agent-context-service.ts
/**
 * Agent Context Service - Context Assembly for Multi-Agent System
 *
 * This service builds minimal, role-specific contexts for different agent types.
 * Core principle: Each agent gets ONLY what it needs to minimize token usage.
 *
 * Token Budget Strategy:
 * - Planner Agent: 3000-5000 tokens (needs full picture: conversation, tools, location)
 * - Executor Agent: 1000-1500 tokens (minimal: specific task, relevant tools, scoped data)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatContextType,
	ChatMessage,
	ChatToolDefinition,
	LLMMessage,
	AgentPermission,
	SystemPromptMetadata,
	LocationContext
} from '@buildos/shared-types';
import { CHAT_TOOLS } from '$lib/chat/tools.config';
import { getToolsForAgent } from '@buildos/shared-types';
import { ChatCompressionService } from './chat-compression-service';
import { ChatContextService } from './chat-context-service';

// ============================================
// TYPES
// ============================================

/**
 * Context for the Planning Agent
 * Full context with conversation history and all available tools
 */
export interface PlannerContext {
	systemPrompt: string; // Instructions for planning and orchestration
	conversationHistory: LLMMessage[]; // Last N messages (compressed if needed)
	locationContext: string; // Current project/task/calendar context (abbreviated)
	locationMetadata?: LocationContext['metadata'];
	userProfile?: string; // User preferences and work style
	availableTools: ChatToolDefinition[]; // All tools the planner can use or delegate
	metadata: {
		sessionId: string;
		contextType: ChatContextType;
		entityId?: string;
		totalTokens: number;
	};
}

/**
 * Executor Task Definition
 * Specific, focused task for an executor agent to complete
 */
export interface ExecutorTask {
	id: string; // Unique task ID
	description: string; // "Find the marketing project and get its details"
	goal: string; // "Return project_id, name, and task count"
	constraints?: string[]; // ["Only active tasks", "Limit to 10 results"]
	contextData?: any; // Minimal relevant data (e.g., project_id if known)
}

/**
 * Context for an Executor Agent
 * Minimal, task-focused context with specific tools only
 */
export interface ExecutorContext {
	systemPrompt: string; // Task-specific instructions
	task: ExecutorTask; // The specific task to execute
	tools: ChatToolDefinition[]; // Subset of tools needed for this task
	relevantData?: any; // Only the data needed for this specific task
	metadata: {
		executorId: string;
		sessionId: string;
		planId?: string;
		totalTokens: number;
	};
}

/**
 * Build parameters for planner context
 */
export interface BuildPlannerContextParams {
	sessionId: string;
	userId: string;
	conversationHistory: ChatMessage[]; // Recent messages from DB
	userMessage: string; // Current user message
	contextType: ChatContextType;
	entityId?: string;
}

/**
 * Build parameters for executor context
 */
export interface BuildExecutorContextParams {
	executorId: string;
	sessionId: string;
	userId: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	planId?: string;
	contextType?: ChatContextType;
	entityId?: string;
}

// ============================================
// SERVICE
// ============================================

export class AgentContextService {
	// Token allocation for different agent types
	private readonly TOKEN_BUDGETS = {
		PLANNER: {
			SYSTEM_PROMPT: 800, // Planning instructions + tool descriptions
			CONVERSATION: 2500, // Recent conversation history
			LOCATION_CONTEXT: 1000, // Current project/task context
			USER_PROFILE: 300, // User preferences
			BUFFER: 400 // Safety margin
			// Total: ~5000 tokens
		},
		EXECUTOR: {
			SYSTEM_PROMPT: 300, // Task-specific instructions
			TASK_DESCRIPTION: 200, // Task + goal + constraints
			TOOLS: 400, // Tool definitions (subset)
			CONTEXT_DATA: 400, // Minimal relevant data
			BUFFER: 200 // Safety margin
			// Total: ~1500 tokens
		}
	};

	private compressionService?: ChatCompressionService;
	private chatContextService: ChatContextService;

	constructor(
		private supabase: SupabaseClient<Database>,
		compressionService?: ChatCompressionService
	) {
		this.compressionService = compressionService;
		this.chatContextService = new ChatContextService(supabase);
	}

	// ============================================
	// PLANNER CONTEXT BUILDING
	// ============================================

	/**
	 * Build context for the Planning Agent
	 * Returns full context with conversation history, all tools, and location context
	 *
	 * @param params - Parameters for building planner context
	 * @returns Complete context for the planning agent
	 */
	async buildPlannerContext(params: BuildPlannerContextParams): Promise<PlannerContext> {
		const { sessionId, userId, conversationHistory, userMessage, contextType, entityId } =
			params;
		const normalizedContextType = this.normalizeContextType(contextType);

		// 1. Load location context (abbreviated for planner)
		const locationContext = await this.loadLocationContextForPlanner(
			userId,
			normalizedContextType,
			entityId
		);

		// 2. Load user profile (optional, includes metadata for prompts)
		const userProfileInfo = await this.loadUserProfile(userId);
		const userProfile = userProfileInfo?.summary;

		// 3. Build context-aware system prompt
		const promptMetadata = this.buildSystemPromptMetadata(
			contextType,
			locationContext.metadata,
			userProfileInfo?.metadata
		);
		const systemPrompt = this.getPlannerSystemPrompt(
			contextType,
			promptMetadata,
			locationContext.content
		);

		// 4. Compress conversation history if needed
		const compressedHistory = await this.compressConversationForPlanner(
			conversationHistory,
			userMessage,
			this.TOKEN_BUDGETS.PLANNER.CONVERSATION,
			sessionId // Pass sessionId for compression tracking
		);

		// 5. Get all available tools for planner
		const availableTools = this.getAllToolsForPlanner(normalizedContextType);

		// 6. Calculate total tokens
		const totalTokens = this.estimatePlannerTokens({
			systemPrompt,
			conversationHistory: compressedHistory,
			locationContext: locationContext.content,
			userProfile,
			tools: availableTools
		});

		return {
			systemPrompt,
			conversationHistory: compressedHistory,
			locationContext: locationContext.content,
			locationMetadata: locationContext.metadata,
			userProfile,
			availableTools,
			metadata: {
				sessionId,
				contextType,
				entityId,
				totalTokens
			}
		};
	}

	/**
	 * Get system prompt for Planning Agent
	 * Includes planning instructions, tool delegation, and orchestration guidance
	 */
	private getPlannerSystemPrompt(
		contextType: ChatContextType,
		metadata?: SystemPromptMetadata,
		locationContext?: string
	): string {
		const sections: string[] = [];

		sections.push(this.getPlannerBaseInstructions());

		const modeSummary = this.formatContextSummary(contextType, metadata);
		if (modeSummary) {
			sections.push(modeSummary);
		}

		const progressiveSection = this.getProgressiveDisclosureForPlanner();
		if (progressiveSection) {
			sections.push(progressiveSection);
		}

		const contextGuidance = this.chatContextService
			.getContextGuidance(contextType, metadata)
			.trim();
		if (contextGuidance) {
			sections.push(contextGuidance);
		}

		if (locationContext) {
			sections.push(`## Context Snapshot (Abbreviated)\n${locationContext}`);
		}

		return sections.filter(Boolean).join('\n\n');
	}

	private getPlannerBaseInstructions(): string {
		return `You are an AI Planning Agent in BuildOS, a productivity system for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Your Role: Intelligent Orchestration

You are the PLANNING layer of a multi-agent system. Your responsibilities:

1. **Respond to user requests** using available tools when needed
2. **Use tools directly** for most queries (conversational or data retrieval)
3. **Create execution plans** only for complex multi-step operations
4. **Spawn sub agent executors** for independent tasks in complex plans
5. **Synthesize results** into coherent, helpful responses

## Decision Framework

### Direct Query (Most Common)
- User asks a question (conversational or data-driven)
- You have tools available - use them ONLY if needed
- Examples:
  - "What is BuildOS?" → Just respond conversationally (no tools)
  - "Show me my tasks" → Use list_tasks tool
  - "Tell me about my marketing project" → Use search_projects + get_project_details
→ Respond directly, using tools as needed

### Complex Multi-Step Query (Rare)
- User explicitly requests multiple sequential operations
- Example: "Update project X and then schedule all its tasks"
- Example: "Find project Y, archive completed tasks, then create a summary"
→ Create plan, spawn executors for each step, synthesize results

## Tool Delegation Strategy

When spawning executors, give them:
- **Specific task description**: "Find project named 'Marketing' and get details"
- **Goal**: "Return project_id, name, task_count"
- **Tool subset**: Only tools needed for that specific task
- **Minimal context**: Just the data they need (e.g., project_id if known)

## Available Tools

You have access to:
- **LIST/SEARCH tools**: Abbreviated results (list_tasks, search_projects, search_notes)
- **DETAIL tools**: Complete info (get_task_details, get_project_details)
- **ACTION tools**: Mutations (create_task, update_task, update_project)
- **CALENDAR tools**: Scheduling (schedule_task, find_available_slots)
- **EXECUTOR tool**: spawn_executor (for delegating tasks)

## Response Guidelines

- Be conversational and helpful
- Explain what you're doing when using tools or spawning executors
- If spawning executors, briefly explain your plan first
- Synthesize executor results into a coherent response
- Keep the user informed of progress`;
	}

	private formatContextSummary(
		contextType: ChatContextType,
		metadata?: SystemPromptMetadata
	): string {
		const lines = [`- Mode: ${this.getContextDisplayName(contextType)}`];

		if (metadata?.projectName) {
			lines.push(`- Project: ${metadata.projectName}`);
		} else if (metadata?.projectId) {
			lines.push(`- Project ID: ${metadata.projectId}`);
		}

		if (metadata?.taskTitle) {
			lines.push(`- Task: ${metadata.taskTitle}`);
		}

		if (metadata?.userName) {
			lines.push(`- User: ${metadata.userName}`);
		}

		if (contextType === 'project_audit' && metadata?.auditHarshness) {
			lines.push(`- Audit Severity: ${metadata.auditHarshness}/10`);
		}

		return `## Active Mode\n${lines.join('\n')}\n\nAlign planning, tone, and tool usage with this mode before taking action.`;
	}

	private getContextDisplayName(contextType: ChatContextType): string {
		const labels: Record<ChatContextType, string> = {
			global: 'Global Assistant Mode',
			project: 'Project Context',
			task: 'Task Context',
			calendar: 'Calendar Context',
			general: 'Global Assistant Mode',
			project_create: 'Project Creation Mode',
			project_update: 'Project Update Mode',
			project_audit: 'Project Audit Mode',
			project_forecast: 'Project Forecast Mode',
			task_update: 'Task Update Mode',
			daily_brief_update: 'Daily Brief Update Mode'
		};

		return labels[contextType] ?? contextType.replace(/_/g, ' ');
	}

	private getProgressiveDisclosureForPlanner(): string {
		const prompt = this.chatContextService.getProgressiveDisclosurePrompt();
		const filtered = prompt
			.split('\n')
			.filter(
				(line) =>
					!line.startsWith('You are an AI assistant integrated into BuildOS') &&
					!line.startsWith('Current date:')
			);

		if (filtered.length === 0) {
			return '';
		}

		if (filtered[0].startsWith('## Critical: Progressive Information Access Pattern')) {
			filtered[0] = '## BuildOS Progressive Disclosure Protocol';
		}

		return filtered.join('\n').trim();
	}

	private buildSystemPromptMetadata(
		contextType: ChatContextType,
		locationMetadata?: LocationContext['metadata'],
		userMetadata?: { userName?: string }
	): SystemPromptMetadata | undefined {
		const metadata: SystemPromptMetadata = {};

		if (userMetadata?.userName) {
			metadata.userName = userMetadata.userName;
		}

		const projectContexts: ChatContextType[] = [
			'project',
			'project_update',
			'project_audit',
			'project_forecast'
		];

		const taskContexts: ChatContextType[] = ['task', 'task_update'];

		if (projectContexts.includes(contextType)) {
			if (locationMetadata?.projectId) {
				metadata.projectId = locationMetadata.projectId;
			}
			if (locationMetadata?.projectName) {
				metadata.projectName = locationMetadata.projectName;
			}
			if (contextType === 'project_audit' && metadata.auditHarshness === undefined) {
				metadata.auditHarshness = 7;
			}
		}

		if (taskContexts.includes(contextType)) {
			if (locationMetadata?.taskTitle) {
				metadata.taskTitle = locationMetadata.taskTitle;
			}
			if (!metadata.projectId && locationMetadata?.projectId) {
				metadata.projectId = locationMetadata.projectId;
			}
		}

		return Object.keys(metadata).length > 0 ? metadata : undefined;
	}

	/**
	 * Compress conversation history to fit within token budget
	 * Uses ChatCompressionService if available, otherwise falls back to simple truncation
	 *
	 * @param messages - Chat messages to compress
	 * @param currentMessage - Current user message (not yet in messages array)
	 * @param tokenBudget - Target token count for compressed history
	 * @param sessionId - Session ID for compression tracking (optional)
	 * @returns Compressed messages in LLM format
	 */
	private async compressConversationForPlanner(
		messages: ChatMessage[],
		currentMessage: string,
		tokenBudget: number,
		sessionId?: string
	): Promise<LLMMessage[]> {
		// Try using ChatCompressionService if available
		if (this.compressionService && sessionId) {
			try {
				const result = await this.compressionService.compressConversation(
					sessionId,
					messages,
					tokenBudget
				);

				// Return compressed messages with current message appended (immutable)
				return [
					...result.compressedMessages,
					{
						role: 'user',
						content: currentMessage
					}
				];
			} catch (error) {
				console.error('Compression failed, falling back to truncation:', error);
				// Fall through to simple truncation
			}
		}

		// Fallback: Simple truncation (original logic)
		const recentMessages = messages.slice(-10);

		// Convert to LLM message format
		const llmMessages: LLMMessage[] = recentMessages.map((msg) => ({
			role: msg.role as any,
			content: msg.content,
			tool_calls: msg.tool_calls as any,
			tool_call_id: msg.tool_call_id ?? undefined // Convert null to undefined
		}));

		// Add current user message
		llmMessages.push({
			role: 'user',
			content: currentMessage
		});

		// Calculate tokens (rough estimate: 4 chars per token)
		const estimatedTokens = this.estimateTokens(JSON.stringify(llmMessages));

		// If under budget, return as-is
		if (estimatedTokens <= tokenBudget) {
			return llmMessages;
		}

		// If over budget, trim to most recent messages
		const maxMessages = Math.floor(tokenBudget / 200); // ~200 tokens per message
		return llmMessages.slice(-maxMessages);
	}

	/**
	 * Load location context for planner (abbreviated)
	 * Uses ChatContextService to load rich context based on contextType
	 *
	 * @param userId - User ID for data access
	 * @param contextType - Type of context to load (project, task, calendar, global, etc.)
	 * @param entityId - Entity ID (project_id, task_id) if applicable
	 * @returns Formatted context string for the planner
	 */
	private async loadLocationContextForPlanner(
		userId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<LocationContext> {
		try {
			const locationContext = await this.chatContextService.loadLocationContext(
				contextType,
				entityId,
				true,
				userId
			);

			return locationContext;
		} catch (error) {
			console.error('Failed to load location context for planner:', error);
			return this.createFallbackLocationContext(contextType, entityId);
		}
	}

	private createFallbackLocationContext(
		contextType: ChatContextType,
		entityId?: string
	): LocationContext {
		const content = this.getFallbackContext(contextType, entityId);
		const fallbackMetadata: LocationContext['metadata'] = {
			contextType,
			abbreviated: true
		};

		const baseType = this.resolveDataContextType(contextType);

		if (baseType === 'project' && entityId) {
			fallbackMetadata.projectId = entityId;
		}

		if (baseType === 'task' && entityId) {
			fallbackMetadata.taskId = entityId;
		}

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: fallbackMetadata
		};
	}

	private resolveDataContextType(contextType: ChatContextType): ChatContextType {
		switch (contextType) {
			case 'project_update':
			case 'project_audit':
			case 'project_forecast':
				return 'project';
			case 'task_update':
				return 'task';
			case 'general':
				return 'global';
			default:
				return contextType;
		}
	}

	/**
	 * Get fallback context if loading fails
	 * Provides minimal but useful context even when data loading fails
	 */
	private getFallbackContext(contextType: ChatContextType, entityId?: string): string {
		switch (contextType) {
			case 'project':
				return entityId
					? `## Current Project\nProject ID: ${entityId}\n\nUse search_projects or get_project_details tools to load project information.`
					: 'No project context available. Use search_projects to find projects.';

			case 'task':
				return entityId
					? `## Current Task\nTask ID: ${entityId}\n\nUse get_task_details tool to load task information.`
					: 'No task context available. Use list_tasks to find tasks.';

			case 'calendar':
				return `## Calendar Context\n\nUse calendar tools (find_available_slots, get_task_calendar_events) to access schedule information.`;

			case 'project_create':
				return `## Project Creation Mode\nHelp the user create a well-structured project by asking clarifying questions.`;

			case 'project_update':
				return entityId
					? `## Project Update Mode\nProject ID: ${entityId}\n\nUse project tools to load and update project information.`
					: 'Project update mode requires a project ID.';

			case 'project_audit':
				return entityId
					? `## Project Audit Mode\nProject ID: ${entityId}\n\nAnalyze project for gaps and improvement opportunities.`
					: 'Project audit mode requires a project ID.';

			case 'project_forecast':
				return entityId
					? `## Project Forecasting Mode\nProject ID: ${entityId}\n\nGenerate scenario forecasts for the project.`
					: 'Project forecast mode requires a project ID.';

			case 'task_update':
				return entityId
					? `## Task Update Mode\nTask ID: ${entityId}\n\nUse task tools to update task information.`
					: 'Task update mode requires a task ID.';

			case 'daily_brief_update':
				return `## Daily Brief Settings\nHelp user configure their daily brief preferences.`;

			case 'general':
			default:
				return `## BuildOS Assistant\nGeneral conversation mode. Use tools as needed to help the user with their productivity workflows.`;
		}
	}

	/**
	 * Load user profile for planner
	 */
	private async loadUserProfile(
		userId: string
	): Promise<{ summary: string; metadata: { userName?: string } } | undefined> {
		const { data: user } = await this.supabase
			.from('users')
			.select('email, name')
			.eq('id', userId)
			.single();

		if (!user) return undefined;

		const displayName = user.name || user.email;
		const summary = `User: ${displayName}`;

		return {
			summary,
			metadata: {
				userName: user.name || undefined
			}
		};
	}

	/**
	 * Get all tools available to the planner
	 * Planner has access to ALL tools (read + write)
	 */
	private getAllToolsForPlanner(contextType: ChatContextType): ChatToolDefinition[] {
		// Planner gets all tools (read-write permission)
		return getToolsForAgent(CHAT_TOOLS, 'read_write');
	}

	/**
	 * Estimate token count for planner context
	 */
	private estimatePlannerTokens(params: {
		systemPrompt: string;
		conversationHistory: LLMMessage[];
		locationContext: string;
		userProfile?: string;
		tools: ChatToolDefinition[];
	}): number {
		const { systemPrompt, conversationHistory, locationContext, userProfile, tools } = params;

		let total = 0;
		total += this.estimateTokens(systemPrompt);
		total += this.estimateTokens(JSON.stringify(conversationHistory));
		total += this.estimateTokens(locationContext);
		if (userProfile) total += this.estimateTokens(userProfile);
		total += this.estimateTokens(JSON.stringify(tools));

		return total;
	}

	// ============================================
	// EXECUTOR CONTEXT BUILDING
	// ============================================

	/**
	 * Build context for an Executor Agent
	 * Returns minimal, task-focused context with specific tools only
	 *
	 * @param params - Parameters for building executor context
	 * @returns Minimal context for the executor agent
	 */
	async buildExecutorContext(params: BuildExecutorContextParams): Promise<ExecutorContext> {
		const { executorId, sessionId, userId, task, tools, planId, contextType, entityId } =
			params;
		const normalizedContextType = contextType
			? this.normalizeContextType(contextType)
			: undefined;

		// 1. Build system prompt for executor
		const systemPrompt = this.getExecutorSystemPrompt(task);

		// 2. Extract relevant data for the task (if available)
		const relevantData = await this.extractRelevantDataForExecutor(
			task,
			userId,
			normalizedContextType,
			entityId
		);

		// 3. Calculate total tokens
		const totalTokens = this.estimateExecutorTokens({
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
	private getExecutorSystemPrompt(task: ExecutorTask): string {
		return `You are a Task Executor Agent in BuildOS.

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
	}

	/**
	 * Extract minimal relevant data for an executor task
	 * Only includes data that's directly needed for the specific task
	 */
	private async extractRelevantDataForExecutor(
		task: ExecutorTask,
		userId: string,
		contextType?: ChatContextType,
		entityId?: string
	): Promise<any> {
		// If task already has context data, return it
		if (task.contextData) {
			return task.contextData;
		}

		// Otherwise, extract based on context type and task
		// For now, return minimal data
		// This will be enhanced based on actual task requirements
		return {
			userId,
			contextType,
			entityId
			// Additional relevant data will be added based on task analysis
		};
	}

	/**
	 * Estimate token count for executor context
	 */
	private estimateExecutorTokens(params: {
		systemPrompt: string;
		task: ExecutorTask;
		tools: ChatToolDefinition[];
		relevantData?: any;
	}): number {
		const { systemPrompt, task, tools, relevantData } = params;

		let total = 0;
		total += this.estimateTokens(systemPrompt);
		total += this.estimateTokens(JSON.stringify(task));
		total += tools.length * 50; // Rough estimate per tool
		if (relevantData) total += this.estimateTokens(JSON.stringify(relevantData));

		return total;
	}

	private normalizeContextType(contextType: ChatContextType): ChatContextType {
		return contextType === 'general' ? 'global' : contextType;
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	/**
	 * Estimate token count for text
	 * Conservative estimate: ~4 characters per token
	 */
	private estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}
}
