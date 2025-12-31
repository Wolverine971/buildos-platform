// apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts
/**
 * Chat Tool Executor - Refactored
 *
 * Thin orchestrator that delegates to domain-specific executors.
 * This replaces the original 2,075 LOC monolithic tool-executor.ts.
 *
 * Architecture:
 * - ChatToolExecutor: Orchestration, logging, dispatch
 * - OntologyReadExecutor: list_*, search_*, get_* (17 tools)
 * - OntologyWriteExecutor: create_*, update_*, delete_* (15 tools)
 * - UtilityExecutor: get_field_info, relationships (3 tools)
 * - ExternalExecutor: web_search, buildos docs (3 tools)
 *
 * Benefits:
 * - Each executor ~200-400 LOC (was 2,075 LOC total)
 * - Clear single responsibility per executor
 * - Easy to test each domain independently
 * - Easy to add new tool categories
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { getToolCategory } from './tools.config';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { normalizeToolError } from '$lib/services/agentic-chat/shared/error-utils';

import {
	OntologyReadExecutor,
	OntologyWriteExecutor,
	UtilityExecutor,
	ExternalExecutor,
	type ExecutorContext
} from './executors';

import type { WebSearchArgs } from '$lib/services/agentic-chat/tools/websearch';

/**
 * Chat Tool Executor - Orchestration Layer
 *
 * Responsibilities:
 * - Tool call dispatch to appropriate executor
 * - Execution logging
 * - Error handling and normalization
 * - Stream event extraction
 */
export class ChatToolExecutor {
	private sessionId?: string;
	private fetchFn: typeof fetch;
	private llmService?: SmartLLMService;

	// Cached values
	private _actorId?: string;
	private _adminSupabase?: TypedSupabaseClient;

	// Domain executors (lazy initialized)
	private _readExecutor?: OntologyReadExecutor;
	private _writeExecutor?: OntologyWriteExecutor;
	private _utilityExecutor?: UtilityExecutor;
	private _externalExecutor?: ExternalExecutor;

	constructor(
		private supabase: SupabaseClient,
		private userId: string,
		sessionId?: string,
		fetchFn?: typeof fetch,
		llmService?: SmartLLMService
	) {
		this.sessionId = sessionId;
		this.fetchFn = fetchFn || fetch;
		this.llmService = llmService;
	}

	setSessionId(sessionId: string): void {
		this.sessionId = sessionId;
	}

	// ============================================
	// EXECUTOR ACCESS (LAZY)
	// ============================================

	private getExecutorContext(): ExecutorContext {
		return {
			supabase: this.supabase,
			userId: this.userId,
			sessionId: this.sessionId,
			fetchFn: this.fetchFn,
			llmService: this.llmService,
			getActorId: () => this.getActorId(),
			getAdminSupabase: () => this.getAdminSupabase(),
			getAuthHeaders: () => this.getAuthHeaders()
		};
	}

	private get readExecutor(): OntologyReadExecutor {
		if (!this._readExecutor) {
			this._readExecutor = new OntologyReadExecutor(this.getExecutorContext());
		}
		return this._readExecutor;
	}

	private get writeExecutor(): OntologyWriteExecutor {
		if (!this._writeExecutor) {
			this._writeExecutor = new OntologyWriteExecutor(this.getExecutorContext());
		}
		return this._writeExecutor;
	}

	private get utilityExecutor(): UtilityExecutor {
		if (!this._utilityExecutor) {
			this._utilityExecutor = new UtilityExecutor(this.getExecutorContext());
		}
		return this._utilityExecutor;
	}

	private get externalExecutor(): ExternalExecutor {
		if (!this._externalExecutor) {
			this._externalExecutor = new ExternalExecutor(this.getExecutorContext());
		}
		return this._externalExecutor;
	}

	// ============================================
	// SHARED INFRASTRUCTURE
	// ============================================

	private async getActorId(): Promise<string> {
		if (!this._actorId) {
			this._actorId = await ensureActorId(this.supabase as any, this.userId);
		}
		return this._actorId;
	}

	private getAdminSupabase(): TypedSupabaseClient {
		if (!this._adminSupabase) {
			this._adminSupabase = createAdminSupabaseClient();
		}
		return this._adminSupabase;
	}

	private async getAuthHeaders(): Promise<HeadersInit> {
		const {
			data: { session }
		} = await this.supabase.auth.getSession();

		return {
			'Content-Type': 'application/json',
			Authorization: session?.access_token ? `Bearer ${session.access_token}` : ''
		};
	}

	// ============================================
	// MAIN EXECUTION
	// ============================================

	async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
		const startTime = Date.now();
		const rawArgs = toolCall.function.arguments || '{}';
		const toolName = toolCall.function.name;
		let args: Record<string, any> = {};

		try {
			try {
				args = rawArgs ? JSON.parse(rawArgs) : {};
			} catch (error) {
				const parseMessage = error instanceof Error ? error.message : String(error);
				const errorMessage = normalizeToolError(
					new Error(`Invalid JSON in tool arguments: ${parseMessage}`),
					toolName
				);
				const duration = Date.now() - startTime;
				await this.logToolExecution(toolCall, null, duration, false, errorMessage, {});

				return {
					tool_call_id: toolCall.id,
					result: null,
					success: false,
					error: errorMessage
				};
			}

			const result = await this.dispatchTool(toolName, args);

			const duration = Date.now() - startTime;
			const { payload, streamEvents, tokensConsumed } = this.extractStreamEvents(result);
			await this.logToolExecution(
				toolCall,
				payload,
				duration,
				true,
				undefined,
				args,
				tokensConsumed
			);

			return {
				tool_call_id: toolCall.id,
				result: payload,
				success: true,
				duration_ms: duration,
				stream_events: streamEvents
			};
		} catch (error: any) {
			const duration = Date.now() - startTime;
			let errorMessage = error?.message || 'Tool execution failed';
			const toolName = toolCall.function.name;

			errorMessage = normalizeToolError(error, toolName);

			await this.logToolExecution(toolCall, null, duration, false, errorMessage, args);

			console.error('[ChatToolExecutor] Tool execution failed:', {
				tool: toolName,
				error: errorMessage,
				duration_ms: duration
			});

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: errorMessage
			};
		}
	}

	// ============================================
	// TOOL DISPATCH
	// ============================================

	private async dispatchTool(toolName: string, args: any): Promise<any> {
		switch (toolName) {
			// ==================
			// UTILITY TOOLS
			// ==================
			case 'get_field_info':
				return this.utilityExecutor.getFieldInfo(args);

			case 'get_entity_relationships':
				return this.utilityExecutor.getEntityRelationships(args);

			case 'get_linked_entities':
				return this.utilityExecutor.getLinkedEntities(args);

			// ==================
			// EXTERNAL TOOLS
			// ==================
			case 'get_buildos_overview':
				return this.externalExecutor.getBuildosOverview();

			case 'get_buildos_usage_guide':
				return this.externalExecutor.getBuildosUsageGuide();

			case 'web_search':
				return this.externalExecutor.webSearch(args as WebSearchArgs);

			// ==================
			// ONTOLOGY READ TOOLS
			// ==================
			case 'list_onto_projects':
				return this.readExecutor.listOntoProjects(args);

			case 'search_onto_projects':
				return this.readExecutor.searchOntoProjects(args);

			case 'list_onto_tasks':
				return this.readExecutor.listOntoTasks(args);

			case 'search_onto_tasks':
				return this.readExecutor.searchOntoTasks(args);

			case 'list_onto_plans':
				return this.readExecutor.listOntoPlans(args);

			case 'list_onto_goals':
				return this.readExecutor.listOntoGoals(args);

			case 'list_onto_documents':
				return this.readExecutor.listOntoDocuments(args);

			case 'list_onto_outputs':
				return this.readExecutor.listOntoOutputs(args);

			case 'list_onto_milestones':
				return this.readExecutor.listOntoMilestones(args);

			case 'list_onto_risks':
				return this.readExecutor.listOntoRisks(args);

			case 'list_onto_decisions':
				return this.readExecutor.listOntoDecisions(args);

			case 'list_onto_requirements':
				return this.readExecutor.listOntoRequirements(args);

			case 'search_onto_documents':
				return this.readExecutor.searchOntoDocuments(args);

			case 'search_ontology':
				return this.readExecutor.searchOntology(args);

			case 'get_onto_project_details':
				return this.readExecutor.getOntoProjectDetails(args);

			case 'get_onto_task_details':
				return this.readExecutor.getOntoTaskDetails(args);

			case 'get_onto_goal_details':
				return this.readExecutor.getOntoGoalDetails(args);

			case 'get_onto_plan_details':
				return this.readExecutor.getOntoPlanDetails(args);

			case 'get_onto_document_details':
				return this.readExecutor.getOntoDocumentDetails(args);

			case 'get_onto_output_details':
				return this.readExecutor.getOntoOutputDetails(args);

			case 'get_onto_milestone_details':
				return this.readExecutor.getOntoMilestoneDetails(args);

			case 'get_onto_risk_details':
				return this.readExecutor.getOntoRiskDetails(args);

			case 'get_onto_decision_details':
				return this.readExecutor.getOntoDecisionDetails(args);

			case 'get_onto_requirement_details':
				return this.readExecutor.getOntoRequirementDetails(args);

			case 'list_task_documents':
				return this.readExecutor.listTaskDocuments(args);

			// ==================
			// ONTOLOGY WRITE TOOLS
			// ==================
			case 'create_onto_project':
				return this.writeExecutor.createOntoProject(args);

			case 'create_onto_task':
				return this.writeExecutor.createOntoTask(args);

			case 'create_onto_goal':
				return this.writeExecutor.createOntoGoal(args);

			case 'create_onto_plan':
				return this.writeExecutor.createOntoPlan(args);

			case 'create_onto_document':
				return this.writeExecutor.createOntoDocument(args);

			case 'create_task_document':
				return this.writeExecutor.createTaskDocument(args);

			case 'update_onto_project':
				return this.writeExecutor.updateOntoProject(args);

			case 'update_onto_task':
				return this.writeExecutor.updateOntoTask(args, (taskId) =>
					this.readExecutor.getOntoTaskDetails({ task_id: taskId })
				);

			case 'update_onto_goal':
				return this.writeExecutor.updateOntoGoal(args, (goalId) =>
					this.readExecutor.getOntoGoalDetails({ goal_id: goalId })
				);

			case 'update_onto_plan':
				return this.writeExecutor.updateOntoPlan(args, (planId) =>
					this.readExecutor.getOntoPlanDetails({ plan_id: planId })
				);

			case 'update_onto_document':
				return this.writeExecutor.updateOntoDocument(args, (documentId) =>
					this.readExecutor.getOntoDocumentDetails({ document_id: documentId })
				);

			case 'update_onto_output':
				return this.writeExecutor.updateOntoOutput(args);

			case 'update_onto_milestone':
				return this.writeExecutor.updateOntoMilestone(args);

			case 'update_onto_risk':
				return this.writeExecutor.updateOntoRisk(args);

			case 'update_onto_decision':
				return this.writeExecutor.updateOntoDecision(args);

			case 'update_onto_requirement':
				return this.writeExecutor.updateOntoRequirement(args);

			case 'delete_onto_task':
				return this.writeExecutor.deleteOntoTask(args);

			case 'delete_onto_goal':
				return this.writeExecutor.deleteOntoGoal(args);

			case 'delete_onto_plan':
				return this.writeExecutor.deleteOntoPlan(args);

			case 'delete_onto_document':
				return this.writeExecutor.deleteOntoDocument(args);

			// ==================
			// UNKNOWN
			// ==================
			default:
				throw new Error(`Unknown tool: ${toolName}`);
		}
	}

	// ============================================
	// HELPERS
	// ============================================

	private extractStreamEvents(result: any): {
		payload: any;
		streamEvents?: any[];
		tokensConsumed?: number;
	} {
		if (!result || typeof result !== 'object') {
			return { payload: result };
		}

		const maybe = result as Record<string, any>;
		const events = Array.isArray(maybe._stream_events) ? maybe._stream_events : undefined;

		// Extract tokens from various possible locations
		const tokensConsumed = this.extractTokensFromResult(maybe);

		const payload = Array.isArray(result) ? [...(result as any[])] : { ...maybe };
		if (!Array.isArray(payload)) {
			delete (payload as Record<string, any>)._stream_events;
			delete (payload as Record<string, any>)._tokens_used;
			delete (payload as Record<string, any>)._tokens_consumed;
			delete (payload as Record<string, any>).tokens_used;
			delete (payload as Record<string, any>).usage;
		}
		return { payload, streamEvents: events, tokensConsumed };
	}

	/**
	 * Extract token count from tool result metadata
	 * Checks various possible locations where tokens might be stored
	 */
	private extractTokensFromResult(result: Record<string, any>): number | undefined {
		const candidates: Array<number | undefined> = [
			result._tokens_used,
			result._tokens_consumed,
			result.tokens_used,
			result.tokens_consumed,
			result.usage?.total_tokens,
			result.usage?.totalTokens,
			result.metadata?.tokens_used,
			result.metadata?.tokensUsed
		];

		for (const value of candidates) {
			if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
				return value;
			}
		}

		return undefined;
	}

	private async logToolExecution(
		toolCall: ChatToolCall,
		result: any,
		duration: number,
		success: boolean,
		errorMessage?: string,
		parsedArgs?: Record<string, any>,
		tokensConsumed?: number
	): Promise<void> {
		if (!this.sessionId) {
			console.warn(
				`Cannot log tool execution for ${toolCall.function.name}: session_id not set. Call setSessionId() first.`
			);
			return;
		}

		const category = getToolCategory(toolCall.function.name);
		const argumentsPayload = parsedArgs ?? this.safeParseArguments(toolCall.function.arguments);

		try {
			const { error: insertError } = await this.supabase.from('chat_tool_executions').insert({
				session_id: this.sessionId,
				tool_name: toolCall.function.name,
				tool_category: category,
				arguments: argumentsPayload,
				result: success ? result : null,
				execution_time_ms: duration,
				tokens_consumed: tokensConsumed ?? null,
				success,
				error_message: errorMessage ?? null
			});

			if (insertError) {
				console.error('[ChatToolExecutor] Failed to log tool execution (DB error):', {
					toolName: toolCall.function.name,
					sessionId: this.sessionId,
					error: insertError.message,
					code: insertError.code,
					hint: insertError.hint
				});
			}
		} catch (error) {
			console.error('[ChatToolExecutor] Failed to log tool execution (exception):', {
				toolName: toolCall.function.name,
				sessionId: this.sessionId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
		}
	}

	private safeParseArguments(rawArguments?: string): Record<string, any> {
		if (!rawArguments) {
			return {};
		}

		try {
			return JSON.parse(rawArguments);
		} catch (error) {
			console.warn('[ChatToolExecutor] Failed to parse tool arguments for logging', {
				error: error instanceof Error ? error.message : String(error)
			});
			return {};
		}
	}
}
