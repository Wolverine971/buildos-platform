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
 *
 * @see ./context/types.ts - Shared types
 * @see ./context/context-formatters.ts - Context formatting utilities
 * @see ./context/executor-context-builder.ts - Executor context building
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatContextType,
	ChatMessage,
	ChatToolDefinition,
	LLMMessage,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import { ALL_TOOLS } from '$lib/services/agentic-chat/tools/core/tools.config';
import { ChatCompressionService } from './chat-compression-service';
import { ChatContextService } from './chat-context-service';
import { PromptGenerationService } from './agentic-chat/prompts/prompt-generation-service';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedPlannerContext,
	EnhancedBuildPlannerContextParams,
	ProjectFocus
} from '$lib/types/agent-chat-enhancement';
import type { EntityLinkedContext } from '$lib/types/linked-entity-context.types';
import { OntologyContextLoader } from './ontology-context-loader';
import { ensureActorId } from './ontology/ontology-projects.service';
import { normalizeContextType } from '../../routes/api/agent/stream/utils/context-utils';

// Import from new context module
import {
	TOKEN_BUDGETS,
	formatOntologyContext,
	formatCombinedContext,
	buildExecutorContext as buildExecutorContextImpl,
	extractRelevantDataForExecutor
} from './context';

// ============================================
// TYPES
// ============================================

// Import PlannerContext from canonical location for use in this file
import type { PlannerContext } from '$lib/services/agentic-chat/shared/types';

// Re-export types for backward compatibility
export type { PlannerContext } from '$lib/services/agentic-chat/shared/types';
export type {
	ExecutorTask,
	ExecutorContext,
	BuildPlannerContextParams,
	BuildExecutorContextParams
} from './context/types';

// Import types for local use
import type {
	ExecutorTask,
	ExecutorContext,
	BuildExecutorContextParams,
	BuildPlannerContextParams
} from './context/types';

// ============================================
// SERVICE
// ============================================

export class AgentContextService {
	private compressionService?: ChatCompressionService;
	private chatContextService: ChatContextService;
	private ontologyLoader: OntologyContextLoader | null = null;
	private promptService: PromptGenerationService;
	private loaderUserId?: string;

	constructor(
		private supabase: SupabaseClient<Database>,
		compressionService?: ChatCompressionService
	) {
		this.compressionService = compressionService;
		this.chatContextService = new ChatContextService(supabase);
		this.promptService = new PromptGenerationService();
	}

	private async getOntologyLoader(userId: string): Promise<OntologyContextLoader> {
		if (this.ontologyLoader && this.loaderUserId === userId) {
			return this.ontologyLoader;
		}

		const actorId = await ensureActorId(this.supabase as any, userId);
		this.loaderUserId = userId;
		this.ontologyLoader = new OntologyContextLoader(this.supabase, actorId);
		return this.ontologyLoader;
	}

	// ============================================
	// PLANNER CONTEXT BUILDING
	// ============================================

	/**
	 * Build enhanced context for the Planning Agent with ontology support
	 * Token budget aware with compression fallback
	 */
	async buildPlannerContext(
		params: EnhancedBuildPlannerContextParams | BuildPlannerContextParams
	): Promise<EnhancedPlannerContext | PlannerContext> {
		const { sessionId, userId, conversationHistory, userMessage, contextType, entityId } =
			params;
		const normalizedContext = normalizeContextType(contextType);

		// Check if we have enhanced params with ontology
		const lastTurnContext = 'lastTurnContext' in params ? params.lastTurnContext : undefined;
		const ontologyContext = 'ontologyContext' in params ? params.ontologyContext : undefined;
		const projectFocus = 'projectFocus' in params ? (params.projectFocus ?? null) : null;

		console.log('[AgentContext] Building enhanced planner context', {
			contextType,
			hasOntology: !!ontologyContext,
			hasLastTurn: !!lastTurnContext,
			historyLength: conversationHistory.length,
			hasFocus: !!projectFocus
		});

		// Step 0: Load linked entities if there's a focus entity (for element/combined contexts)
		let linkedEntitiesContext: EntityLinkedContext | undefined;
		const focus = ontologyContext?.scope?.focus;
		if (focus?.type && focus?.id && focus?.name) {
			try {
				const ontologyLoader = await this.getOntologyLoader(userId);
				console.log(
					'[AgentContext] Loading linked entities for focus:',
					focus.type,
					focus.id
				);
				linkedEntitiesContext = await ontologyLoader.loadLinkedEntitiesContext(
					focus.id,
					focus.type,
					focus.name,
					{ maxPerType: 3, includeDescriptions: false }
				);
				console.log('[AgentContext] Linked entities loaded:', {
					total: linkedEntitiesContext.counts.total,
					truncated: linkedEntitiesContext.truncated
				});
			} catch (error) {
				console.error('[AgentContext] Failed to load linked entities:', error);
				// Continue without linked entities - non-critical failure
			}
		}

		// Step 1: Build system prompt with ontology awareness (delegated to PromptGenerationService)
		const systemPrompt = await this.promptService.buildPlannerSystemPrompt({
			contextType: normalizedContext,
			ontologyContext,
			lastTurnContext,
			entityId,
			linkedEntitiesContext
		});

		// Step 2: Process conversation history with compression if needed
		const { messages: processedHistory, usageSnapshot: compressionUsage } =
			await this.processConversationHistory(conversationHistory, {
				lastTurnContext,
				sessionId,
				contextType: normalizedContext,
				userId
			});

		// Step 3: Format location context (priority order: project_create → ontology → standard)
		let locationContext: string;
		let locationMetadata: any = {};

		if (contextType === 'project_create') {
			// Project creation path: Use standard context
			const standardContext = await this.chatContextService.loadLocationContext(
				normalizedContext,
				entityId,
				true, // abbreviated
				userId
			);
			locationContext = standardContext.content;
			locationMetadata = standardContext.metadata;
			console.log('[AgentContext] Using standard context for project_create');
		} else if (ontologyContext?.type === 'combined' && projectFocus) {
			const formatted = formatCombinedContext(ontologyContext, projectFocus);
			locationContext = formatted.content;
			locationMetadata = formatted.metadata;
			console.log('[AgentContext] Using combined focus context', {
				focusType: projectFocus.focusType,
				entityId: projectFocus.focusEntityId
			});
		} else if (ontologyContext) {
			// Ontology path: Format pre-loaded ontology context
			// Used when entity-specific or project-specific context is available
			const formatted = formatOntologyContext(ontologyContext);
			locationContext = formatted.content;
			locationMetadata = formatted.metadata;
			console.log('[AgentContext] Using ontology context', {
				type: ontologyContext.type
			});
		} else {
			// Standard path: Load context using legacy chat context service
			// Fallback for contexts without ontology support
			const standardContext = await this.chatContextService.loadLocationContext(
				normalizedContext,
				entityId,
				true, // abbreviated
				userId
			);
			locationContext = standardContext.content;
			locationMetadata = standardContext.metadata;
			console.log('[AgentContext] Using standard context', {
				contextType
			});
		}

		// Step 4: Pass ALL_TOOLS - ToolSelectionService owns default pool logic
		// The orchestrator will call ToolSelectionService.selectTools() which:
		// 1. Computes default pool from context type
		// 2. Applies focus filtering
		// 3. Uses LLM/heuristic selection
		const availableTools = ALL_TOOLS;

		// Step 5: Calculate token usage
		const totalTokens = this.calculateTokens([
			systemPrompt,
			locationContext,
			...processedHistory.map((m) => m.content)
		]);

		// Log token usage
		console.log('[AgentContext] Token usage:', {
			systemPrompt: Math.ceil(systemPrompt.length / 4),
			locationContext: Math.ceil(locationContext.length / 4),
			history: processedHistory.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0),
			total: totalTokens,
			budget:
				TOKEN_BUDGETS.PLANNER.SYSTEM_PROMPT +
				TOKEN_BUDGETS.PLANNER.CONVERSATION +
				TOKEN_BUDGETS.PLANNER.LOCATION_CONTEXT
		});

		// Load user profile
		const userProfileData = await this.loadUserProfile(userId);
		const userProfileStr = userProfileData?.summary;
		const contextScope =
			ontologyContext?.scope ?? (entityId ? { projectId: entityId } : undefined);

		return {
			systemPrompt,
			conversationHistory: processedHistory,
			locationContext,
			locationMetadata,
			ontologyContext,
			lastTurnContext,
			userProfile: userProfileStr,
			availableTools,
			metadata: {
				sessionId,
				contextType: normalizedContext,
				entityId,
				totalTokens,
				hasOntology: !!ontologyContext,
				focus: projectFocus ?? null,
				scope: contextScope,
				compressionUsage
			}
		};
	}

	/**
	 * Process conversation history with compression
	 */
	private async processConversationHistory(
		history: ChatMessage[],
		options: {
			lastTurnContext?: LastTurnContext;
			sessionId?: string;
			contextType?: ChatContextType;
			userId?: string;
		} = {}
	): Promise<{ messages: LLMMessage[]; usageSnapshot?: ContextUsageSnapshot }> {
		const { lastTurnContext, sessionId, contextType, userId } = options;
		const messages: LLMMessage[] = [];
		let usageSnapshot: ContextUsageSnapshot | undefined;

		// Last turn context is now embedded in the base system prompt to avoid duplication.

		// Estimate tokens (rough: 1 token ≈ 4 chars)
		const estimatedTokens = history.reduce(
			(sum, msg) => sum + Math.ceil(msg.content.length / 4),
			0
		);
		const conversationBudget = TOKEN_BUDGETS.PLANNER.CONVERSATION;
		const needsCompression = estimatedTokens > conversationBudget;

		if (needsCompression && this.compressionService && sessionId) {
			try {
				console.log('[AgentContext] Compressing conversation history', {
					originalTokens: estimatedTokens,
					targetTokens: conversationBudget,
					messageCount: history.length,
					sessionId,
					contextType
				});

				if (this.compressionService.smartCompress) {
					const smartResult = await this.compressionService.smartCompress(
						sessionId,
						history,
						contextType ?? 'global',
						userId
					);

					if (smartResult?.compressedMessages?.length) {
						messages.push(...smartResult.compressedMessages);
						if (this.compressionService) {
							usageSnapshot = await this.compressionService.getContextUsageSnapshot(
								sessionId,
								smartResult.compressedMessages.map((m) => ({ content: m.content })),
								conversationBudget
							);
						}
						return { messages, usageSnapshot };
					}
				}

				const compressionResult = await this.compressionService.compressConversation(
					sessionId,
					history,
					conversationBudget,
					userId
				);

				if (compressionResult.compressedMessages.length > 0) {
					messages.push(...compressionResult.compressedMessages);
					usageSnapshot = compressionResult.usage;
					return { messages, usageSnapshot };
				}
			} catch (error) {
				console.error('[AgentContext] Failed to compress history, falling back:', error);
			}
		}

		if (needsCompression) {
			console.warn('[AgentContext] Falling back to recent conversation slice', {
				originalTokens: estimatedTokens,
				targetTokens: conversationBudget,
				messageCount: history.length
			});

			messages.push({
				role: 'system',
				content: `Previous conversation trimmed to the most recent messages to stay within the ${conversationBudget} token budget.`
			});

			const recentMessages = history.slice(-10);
			messages.push(
				...recentMessages.map((m) => ({
					role: m.role as any,
					content: m.content,
					tool_calls: m.tool_calls as any
				}))
			);
			if (this.compressionService && sessionId) {
				try {
					usageSnapshot = await this.compressionService.getContextUsageSnapshot(
						sessionId,
						recentMessages.map((m) => ({ content: m.content })),
						conversationBudget
					);
				} catch (error) {
					console.error('Failed to compute usage snapshot for fallback slice', error);
				}
			}
			return { messages, usageSnapshot };
		}

		// Use full history
		messages.push(
			...history.map((m) => ({
				role: m.role as any,
				content: m.content,
				tool_calls: m.tool_calls as any
			}))
		);

		if (this.compressionService && sessionId) {
			try {
				usageSnapshot = await this.compressionService.getContextUsageSnapshot(
					sessionId,
					history.map((m) => ({ content: m.content })),
					conversationBudget
				);
			} catch (error) {
				console.error('Failed to compute usage snapshot for full history', error);
			}
		}

		return { messages, usageSnapshot };
	}

	/**
	 * Calculate total tokens for context
	 */
	private calculateTokens(contents: string[]): number {
		return contents.reduce((sum, content) => {
			if (!content) return sum;
			// More accurate token estimation
			// Average English word is ~1.3 tokens, average word length is 4.7 chars
			// So roughly 1 token per 3.6 chars, but we'll use 4 for safety
			return sum + Math.ceil(content.length / 4);
		}, 0);
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

	// ============================================
	// EXECUTOR CONTEXT BUILDING
	// ============================================

	/**
	 * Build context for an Executor Agent
	 * Delegates to the executor-context-builder module
	 *
	 * @param params - Parameters for building executor context
	 * @returns Minimal context for the executor agent
	 */
	async buildExecutorContext(params: BuildExecutorContextParams): Promise<ExecutorContext> {
		return buildExecutorContextImpl(params, extractRelevantDataForExecutor);
	}
}
