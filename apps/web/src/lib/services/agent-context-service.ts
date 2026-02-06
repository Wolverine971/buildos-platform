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
 * User Preferences Integration:
 * - loadUserProfileWithPreferences() (lines 567-684) handles preference injection
 * - Merges global user preferences with project-specific preferences
 * - Converts preferences to natural language prompt injections
 *
 * @see /apps/web/docs/features/preferences/README.md - User preferences system documentation
 * @see ./context/types.ts - Shared types
 * @see ./context/context-formatters.ts - Context formatting utilities
 * @see ./context/executor-context-builder.ts - Executor context building
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { dev } from '$app/environment';
import type {
	Database,
	ChatContextType,
	ChatMessage,
	ChatToolDefinition,
	LLMMessage,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import { ALL_TOOLS } from '$lib/services/agentic-chat/tools/core/tools.config';
import { ChatCompressionService, CHAT_COMPRESSION_DEFAULTS } from './chat-compression-service';
import { ChatContextService } from './chat-context-service';
import { PromptGenerationService } from './agentic-chat/prompts/prompt-generation-service';
import { ErrorLoggerService } from './errorLogger.service';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedPlannerContext,
	EnhancedBuildPlannerContextParams,
	ProjectFocus
} from '$lib/types/agent-chat-enhancement';
import type { EntityLinkedContext } from '$lib/types/linked-entity-context.types';
import type { UserPreferences, ProjectPreferences } from '$lib/types/user-preferences';
import { OntologyContextLoader } from './ontology-context-loader';
import { ensureActorId } from './ontology/ontology-projects.service';
import { normalizeContextType } from '../../routes/api/agent/stream/utils/context-utils';
import {
	buildLinkedEntitiesCacheKey,
	buildLocationCacheKey,
	isCacheFresh
} from '$lib/services/agentic-chat/context-prewarm';

// Import from new context module
import {
	TOKEN_BUDGETS,
	formatOntologyContext,
	formatCombinedContext,
	buildExecutorContext as buildExecutorContextImpl,
	extractRelevantDataForExecutor
} from './context';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

const logger = createLogger('AgentContextService');

const debugLog = (...args: unknown[]) => {
	if (!dev) return;
	if (args.length === 0) return;
	const [first, ...rest] = args;
	if (typeof first === 'string') {
		if (rest.length === 0) {
			logger.debug(first);
			return;
		}
		if (
			rest.length === 1 &&
			rest[0] &&
			typeof rest[0] === 'object' &&
			!Array.isArray(rest[0])
		) {
			logger.debug(first, rest[0] as Record<string, any>);
			return;
		}
		logger.debug(first, { args: sanitizeLogData(rest) });
		return;
	}
	logger.debug('AgentContext debug', { args: sanitizeLogData(args) });
};

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

type UserProfileWithPreferences = {
	summary: string;
	preferences: {
		raw: UserPreferences & ProjectPreferences;
		promptInjection: string;
	};
	metadata: {
		userName?: string;
	};
};

// ============================================
// SERVICE
// ============================================

export class AgentContextService {
	private compressionService?: ChatCompressionService;
	private chatContextService: ChatContextService;
	private ontologyLoader: OntologyContextLoader | null = null;
	private promptService: PromptGenerationService;
	private loaderUserId?: string;
	private errorLogger: ErrorLoggerService;

	constructor(
		private supabase: SupabaseClient<Database>,
		compressionService?: ChatCompressionService
	) {
		this.compressionService = compressionService;
		this.chatContextService = new ChatContextService(supabase);
		this.promptService = new PromptGenerationService();
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
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
		const contextCache = 'contextCache' in params ? params.contextCache : undefined;
		const deferCompression =
			'deferCompression' in params ? params.deferCompression === true : false;

		debugLog('[AgentContext] Building enhanced planner context', {
			contextType,
			hasOntology: !!ontologyContext,
			hasLastTurn: !!lastTurnContext,
			historyLength: conversationHistory.length,
			hasFocus: !!projectFocus
		});

		const resolvedEntityId = entityId ?? projectFocus?.projectId;
		const projectIdForPreferences =
			normalizedContext === 'project' ||
			normalizedContext === 'project_audit' ||
			normalizedContext === 'project_forecast'
				? resolvedEntityId
				: undefined;
		const linkedEntitiesCacheKey = buildLinkedEntitiesCacheKey(projectFocus);
		const locationCacheKey = buildLocationCacheKey(normalizedContext, resolvedEntityId);

		const linkedEntitiesPromise = (async (): Promise<EntityLinkedContext | undefined> => {
			const cachedLinked = contextCache?.linkedEntities;
			if (
				linkedEntitiesCacheKey &&
				cachedLinked?.cacheKey === linkedEntitiesCacheKey &&
				isCacheFresh(cachedLinked.loadedAt)
			) {
				debugLog('[AgentContext] Using prewarmed linked entities context');
				return cachedLinked.context;
			}

			const focus = ontologyContext?.scope?.focus;
			if (focus?.type && focus?.id && focus?.name) {
				try {
					const ontologyLoader = await this.getOntologyLoader(userId);
					debugLog(
						'[AgentContext] Loading linked entities for focus:',
						focus.type,
						focus.id
					);
					const linkedEntities = await ontologyLoader.loadLinkedEntitiesContext(
						focus.id,
						focus.type,
						focus.name,
						{ maxPerType: 3, includeDescriptions: false }
					);
					debugLog('[AgentContext] Linked entities loaded:', {
						total: linkedEntities.counts.total,
						truncated: linkedEntities.truncated
					});
					return linkedEntities;
				} catch (error) {
					logger.warn('Failed to load linked entities', {
						focusType: focus.type,
						focusId: focus.id,
						error: error instanceof Error ? error.message : String(error)
					});
					void this.errorLogger.logError(
						error,
						{
							userId,
							operationType: 'context_linked_entities',
							metadata: {
								sessionId,
								contextType: normalizedContext,
								focusType: focus.type,
								focusId: focus.id
							}
						},
						'warning'
					);
				}
			}

			return undefined;
		})();

		const historyPromise = this.processConversationHistory(conversationHistory, {
			lastTurnContext,
			sessionId,
			contextType: normalizedContext,
			userId,
			deferCompression
		});

		const locationPromise = (async (): Promise<{ content: string; metadata: any }> => {
			const cachedLocation = contextCache?.location;
			if (
				!ontologyContext &&
				cachedLocation?.cacheKey === locationCacheKey &&
				isCacheFresh(cachedLocation.loadedAt)
			) {
				debugLog('[AgentContext] Using prewarmed location context');
				return {
					content: cachedLocation.content,
					metadata: cachedLocation.metadata ?? {}
				};
			}

			// Project creation path: Use standard context
			if (normalizedContext === 'project_create') {
				const standardContext = await this.chatContextService.loadLocationContext(
					normalizedContext,
					resolvedEntityId,
					true,
					userId
				);
				debugLog('[AgentContext] Using standard context for project_create');
				return { content: standardContext.content, metadata: standardContext.metadata };
			}

			if (ontologyContext?.type === 'combined' && projectFocus) {
				const formatted = formatCombinedContext(ontologyContext, projectFocus, {
					docStructureCache: contextCache?.docStructure
				});
				debugLog('[AgentContext] Using combined focus context', {
					focusType: projectFocus.focusType,
					entityId: projectFocus.focusEntityId
				});
				return { content: formatted.content, metadata: formatted.metadata };
			}

			if (ontologyContext) {
				const formatted = formatOntologyContext(ontologyContext, {
					docStructureCache: contextCache?.docStructure
				});
				debugLog('[AgentContext] Using ontology context', { type: ontologyContext.type });
				return { content: formatted.content, metadata: formatted.metadata };
			}

			const standardContext = await this.chatContextService.loadLocationContext(
				normalizedContext,
				resolvedEntityId,
				true,
				userId
			);
			debugLog('[AgentContext] Using standard context', { contextType: normalizedContext });
			return { content: standardContext.content, metadata: standardContext.metadata };
		})();

		const userProfilePromise = this.loadUserProfileWithPreferences(
			userId,
			projectIdForPreferences
		);

		const [linkedEntitiesContext, historyResult, locationResult, userProfileData] =
			await Promise.all([
				linkedEntitiesPromise,
				historyPromise,
				locationPromise,
				userProfilePromise
			]);

		// Step 1: Build system prompt with ontology awareness (delegated to PromptGenerationService)
		const systemPrompt = await this.promptService.buildPlannerSystemPrompt({
			contextType: normalizedContext,
			ontologyContext,
			lastTurnContext,
			entityId: resolvedEntityId,
			linkedEntitiesContext
		});

		const { messages: processedHistory, usageSnapshot: compressionUsage } = historyResult;
		const locationContext = locationResult.content;
		const locationMetadata = locationResult.metadata ?? {};

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
		debugLog('[AgentContext] Token usage:', {
			systemPrompt: Math.ceil(systemPrompt.length / 4),
			locationContext: Math.ceil(locationContext.length / 4),
			history: processedHistory.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0),
			total: totalTokens,
			budget:
				TOKEN_BUDGETS.PLANNER.SYSTEM_PROMPT +
				TOKEN_BUDGETS.PLANNER.CONVERSATION +
				TOKEN_BUDGETS.PLANNER.LOCATION_CONTEXT
		});

		const userProfileStr = userProfileData
			? [userProfileData.summary, userProfileData.preferences.promptInjection.trim()]
					.filter((value) => value)
					.join('\n')
			: undefined;
		const contextScope =
			ontologyContext?.scope ??
			(resolvedEntityId ? { projectId: resolvedEntityId } : undefined);

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
				entityId: resolvedEntityId,
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
			deferCompression?: boolean;
		} = {}
	): Promise<{ messages: LLMMessage[]; usageSnapshot?: ContextUsageSnapshot }> {
		const { lastTurnContext, sessionId, contextType, userId, deferCompression } = options;
		const messages: LLMMessage[] = [];
		let usageSnapshot: ContextUsageSnapshot | undefined;

		// Last turn context is now embedded in the base system prompt to avoid duplication.

		// Estimate tokens (rough: 1 token ≈ 4 chars)
		const estimatedTokens = history.reduce(
			(sum, msg) => sum + Math.ceil(msg.content.length / 4),
			0
		);
		const conversationBudget = TOKEN_BUDGETS.PLANNER.CONVERSATION;
		const keepRecentCount = CHAT_COMPRESSION_DEFAULTS.KEEP_LAST_MESSAGES;

		let latestCompression: {
			id: string;
			summary: string | null;
			first_message_id: string | null;
			last_message_id: string | null;
			created_at: string | null;
		} | null = null;
		let lastMessageIndex = -1;
		let latestSummary: string | null = null;

		if (this.compressionService && sessionId) {
			latestCompression =
				(await this.compressionService.getLatestCompressionSummary(sessionId)) ?? null;
			const lastMessageId = latestCompression?.last_message_id ?? null;
			lastMessageIndex = lastMessageId
				? history.findIndex((msg) => msg.id === lastMessageId)
				: -1;
			latestSummary =
				latestCompression?.summary && latestCompression.summary.trim().length > 0
					? latestCompression.summary
					: null;
		}

		const needsCompression = estimatedTokens > conversationBudget || Boolean(latestSummary);

		if (needsCompression && this.compressionService && sessionId) {
			if (deferCompression) {
				// Defer LLM compression to keep first response fast; use stored summary or last N.
				if (latestSummary) {
					messages.push({
						role: 'system',
						content: `Previous conversation summary:\n${latestSummary}`
					});
				}

				if (latestSummary && lastMessageIndex >= 0) {
					const recentMessages = history.slice(lastMessageIndex + 1);
					messages.push(
						...recentMessages.map((m) => ({
							role: m.role as any,
							content: m.content,
							tool_calls: m.tool_calls as any,
							tool_call_id: m.tool_call_id ?? undefined
						}))
					);
				} else {
					const recentMessages = history.slice(-keepRecentCount);
					messages.push(
						...recentMessages.map((m) => ({
							role: m.role as any,
							content: m.content,
							tool_calls: m.tool_calls as any,
							tool_call_id: m.tool_call_id ?? undefined
						}))
					);
				}

				if (this.compressionService && sessionId) {
					try {
						usageSnapshot = await this.compressionService.getContextUsageSnapshot(
							sessionId,
							messages.map((m) => ({ content: m.content })),
							conversationBudget
						);
					} catch (error) {
						logger.warn('Failed to compute usage snapshot for deferred compression', {
							error: error instanceof Error ? error.message : String(error),
							sessionId
						});
					}
				}

				const messagesSinceSummary =
					lastMessageIndex >= 0 ? history.slice(lastMessageIndex + 1) : history;
				const shouldScheduleCompression =
					!latestSummary || messagesSinceSummary.length > keepRecentCount;

				if (shouldScheduleCompression) {
					const compressionInput = this.buildRollingCompressionHistory({
						sessionId,
						history,
						latestSummary,
						lastMessageIndex,
						userId
					});
					void this.compressionService
						.compressConversation(
							sessionId,
							compressionInput,
							conversationBudget,
							userId,
							{
								force: Boolean(latestSummary)
							}
						)
						.catch((error) => {
							logger.warn('Deferred compression failed (will retry next turn)', {
								error: error instanceof Error ? error.message : String(error),
								sessionId
							});
							void this.errorLogger.logError(
								error,
								{
									userId,
									operationType: 'context_compression_deferred',
									metadata: {
										sessionId,
										contextType
									}
								},
								'warning'
							);
						});
				}

				return { messages, usageSnapshot };
			}

			try {
				debugLog('[AgentContext] Compressing conversation history', {
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
				logger.error(error as Error, {
					operation: 'context_compression',
					sessionId,
					contextType
				});
				void this.errorLogger.logError(error, {
					userId,
					operationType: 'context_compression',
					metadata: {
						sessionId,
						contextType
					}
				});
			}
		}

		if (needsCompression) {
			logger.warn('Falling back to recent conversation slice', {
				originalTokens: estimatedTokens,
				targetTokens: conversationBudget,
				messageCount: history.length
			});

			const recentMessages = history.slice(-keepRecentCount);
			messages.push(
				...recentMessages.map((m) => ({
					role: m.role as any,
					content: m.content,
					tool_calls: m.tool_calls as any,
					tool_call_id: m.tool_call_id ?? undefined
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
					logger.warn('Failed to compute usage snapshot for fallback slice', {
						error: error instanceof Error ? error.message : String(error),
						sessionId
					});
				}
			}
			return { messages, usageSnapshot };
		}

		// Use full history
		messages.push(
			...history.map((m) => ({
				role: m.role as any,
				content: m.content,
				tool_calls: m.tool_calls as any,
				tool_call_id: m.tool_call_id ?? undefined
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
				logger.warn('Failed to compute usage snapshot for full history', {
					error: error instanceof Error ? error.message : String(error),
					sessionId
				});
			}
		}

		return { messages, usageSnapshot };
	}

	private buildRollingCompressionHistory(params: {
		sessionId: string;
		history: ChatMessage[];
		latestSummary: string | null;
		lastMessageIndex: number;
		userId?: string;
	}): ChatMessage[] {
		const { sessionId, history, latestSummary, lastMessageIndex, userId } = params;
		if (!latestSummary) return history;

		const summaryMessage: ChatMessage = {
			id: `summary-${sessionId}-${Date.now()}`,
			session_id: sessionId,
			user_id: userId ?? null,
			role: 'system',
			content: `Previous conversation summary:\n${latestSummary}`,
			created_at: new Date().toISOString()
		} as ChatMessage;

		const recentMessages =
			lastMessageIndex >= 0 ? history.slice(lastMessageIndex + 1) : history;

		return [summaryMessage, ...recentMessages];
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
	private async loadUserProfileWithPreferences(
		userId: string,
		projectId?: string
	): Promise<UserProfileWithPreferences | undefined> {
		const { data: user } = await this.supabase
			.from('users')
			.select('email, name, preferences')
			.eq('id', userId)
			.single();

		if (!user) return undefined;

		const userPreferences = this.coercePreferences(user.preferences) as UserPreferences;
		let projectPreferences: ProjectPreferences = {};

		if (projectId) {
			const { data: project } = await this.supabase
				.from('onto_projects')
				.select('props')
				.eq('id', projectId)
				.single();

			const projectProps = this.coercePreferences(project?.props);
			projectPreferences = this.coercePreferences(
				(projectProps as { preferences?: unknown }).preferences
			) as ProjectPreferences;
		}

		const preferences = {
			...userPreferences,
			...projectPreferences
		};

		const prefParts: string[] = [];

		const styleGuide: Record<string, string> = {
			direct: 'Be direct and concise. Skip pleasantries and get to the point.',
			supportive: 'Be encouraging and patient. Acknowledge their efforts.',
			socratic: 'Ask guiding questions to help them think through problems.'
		};

		if (preferences.communication_style) {
			const style = styleGuide[preferences.communication_style];
			if (style) prefParts.push(style);
		}

		if (preferences.response_length === 'concise') {
			prefParts.push('Keep responses concise unless detail is requested.');
		} else if (preferences.response_length === 'detailed') {
			prefParts.push('Provide detailed responses with context and examples.');
		}

		if (preferences.proactivity_level === 'minimal') {
			prefParts.push('Only respond to what is asked. Do not volunteer unsolicited insights.');
		} else if (preferences.proactivity_level === 'high') {
			prefParts.push('Proactively surface risks, blockers, and opportunities.');
		}

		if (preferences.primary_role) {
			prefParts.push(`User role: ${preferences.primary_role}`);
		}

		if (preferences.domain_context) {
			prefParts.push(`Domain context: ${preferences.domain_context}`);
		}

		if (projectPreferences.deadline_flexibility === 'strict') {
			prefParts.push('This project has strict deadlines - emphasize timeline adherence.');
		} else if (projectPreferences.deadline_flexibility === 'flexible') {
			prefParts.push('Deadlines are flexible for this project - prioritize quality.');
		} else if (projectPreferences.deadline_flexibility === 'aspirational') {
			prefParts.push('Deadlines are aspirational targets that can shift as needed.');
		}

		if (projectPreferences.planning_depth === 'rigorous') {
			prefParts.push('User wants rigorous, detailed planning for this project.');
		} else if (projectPreferences.planning_depth === 'detailed') {
			prefParts.push('User wants detailed planning for this project.');
		} else if (projectPreferences.planning_depth === 'lightweight') {
			prefParts.push('Keep planning lightweight with minimal overhead.');
		}

		if (projectPreferences.update_frequency === 'daily') {
			prefParts.push('Preferred update cadence: daily.');
		} else if (projectPreferences.update_frequency === 'weekly') {
			prefParts.push('Preferred update cadence: weekly.');
		} else if (projectPreferences.update_frequency === 'as_needed') {
			prefParts.push('Preferred update cadence: as needed.');
		}

		if (projectPreferences.collaboration_mode === 'solo') {
			prefParts.push('Collaboration mode: solo.');
		} else if (projectPreferences.collaboration_mode === 'async_team') {
			prefParts.push('Collaboration mode: async team.');
		} else if (projectPreferences.collaboration_mode === 'realtime') {
			prefParts.push('Collaboration mode: real-time.');
		}

		if (projectPreferences.risk_tolerance === 'cautious') {
			prefParts.push('Risk tolerance: cautious - avoid high-risk moves.');
		} else if (projectPreferences.risk_tolerance === 'aggressive') {
			prefParts.push('Risk tolerance: aggressive - prioritize speed and bold moves.');
		}

		const displayName = user.name || user.email;
		const summary = `User: ${displayName}`;

		return {
			summary,
			preferences: {
				raw: preferences,
				promptInjection: prefParts.join('\n')
			},
			metadata: {
				userName: user.name || undefined
			}
		};
	}

	private coercePreferences(value: unknown): Record<string, unknown> {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {};
		}
		return value as Record<string, unknown>;
	}

	/**
	 * @deprecated Use loadUserProfileWithPreferences instead
	 */
	private async loadUserProfile(
		userId: string
	): Promise<{ summary: string; metadata: { userName?: string } } | undefined> {
		const profile = await this.loadUserProfileWithPreferences(userId);
		if (!profile) return undefined;
		return {
			summary: profile.summary,
			metadata: profile.metadata
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
