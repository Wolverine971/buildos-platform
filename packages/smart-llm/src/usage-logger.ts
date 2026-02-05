// packages/smart-llm/src/usage-logger.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ErrorLogger } from './types';

export type UsageLogParams = {
	userId?: string; // Made optional to match TextGenerationOptions
	operationType: string;
	modelRequested: string;
	modelUsed: string;
	provider?: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
	responseTimeMs: number;
	requestStartedAt: Date;
	requestCompletedAt: Date;
	status: 'success' | 'failure' | 'timeout' | 'rate_limited' | 'invalid_response';
	errorMessage?: string;
	temperature?: number;
	maxTokens?: number;
	profile?: string;
	streaming?: boolean;
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
	chatSessionId?: string;
	agentSessionId?: string;
	agentPlanId?: string;
	agentExecutionId?: string;
	openrouterRequestId?: string;
	openrouterCacheStatus?: string;
	rateLimitRemaining?: number;
	metadata?: any;
};

export type UsageLogger = {
	logUsageToDatabase(params: UsageLogParams): Promise<void>;
};

export class LLMUsageLogger {
	private supabase?: SupabaseClient<Database>;
	private errorLogger?: ErrorLogger;

	constructor(config: { supabase?: SupabaseClient<Database>; errorLogger?: ErrorLogger }) {
		this.supabase = config.supabase;
		this.errorLogger = config.errorLogger;
	}

	async logUsageToDatabase(params: UsageLogParams): Promise<void> {
		if (!this.supabase) {
			console.warn('Supabase client not configured, skipping usage logging');
			return;
		}

		try {
			const sanitizedUserId = this.normalizeUserIdForLogging(params.userId);

			// Defensive check: Skip logging if user_id is invalid
			// This prevents foreign key constraint violations
			if (!sanitizedUserId) {
				console.warn('Invalid user_id for LLM usage logging, skipping database insert', {
					providedUserId: params.userId,
					operationType: params.operationType,
					modelUsed: params.modelUsed,
					status: params.status
				});
				return;
			}

			const projectId = this.normalizeProjectIdForLogging(params.projectId);
			const chatSessionId = this.normalizeOptionalIdForLogging(
				params.chatSessionId || this.getMetadataId(params.metadata, 'sessionId')
			);
			const agentSessionId = this.normalizeOptionalIdForLogging(
				params.agentSessionId || this.getMetadataId(params.metadata, 'agentSessionId')
			);
			const agentPlanId = this.normalizeOptionalIdForLogging(
				params.agentPlanId || this.getMetadataId(params.metadata, 'planId')
			);
			const agentExecutionId = this.normalizeOptionalIdForLogging(
				params.agentExecutionId || this.getMetadataId(params.metadata, 'executionId')
			);
			const payload = {
				user_id: sanitizedUserId,
				operation_type: params.operationType,
				model_requested: params.modelRequested,
				model_used: params.modelUsed,
				provider: params.provider,
				prompt_tokens: params.promptTokens,
				completion_tokens: params.completionTokens,
				total_tokens: params.totalTokens,
				input_cost_usd: params.inputCost,
				output_cost_usd: params.outputCost,
				total_cost_usd: params.totalCost,
				response_time_ms: params.responseTimeMs,
				request_started_at: params.requestStartedAt.toISOString(),
				request_completed_at: params.requestCompletedAt.toISOString(),
				status: params.status,
				error_message: params.errorMessage,
				temperature: params.temperature,
				max_tokens: params.maxTokens,
				profile: params.profile,
				streaming: params.streaming,
				project_id: projectId ?? undefined,
				chat_session_id: chatSessionId ?? undefined,
				agent_session_id: agentSessionId ?? undefined,
				agent_plan_id: agentPlanId ?? undefined,
				agent_execution_id: agentExecutionId ?? undefined,
				brain_dump_id: params.brainDumpId,
				task_id: params.taskId,
				brief_id: params.briefId,
				openrouter_request_id: params.openrouterRequestId,
				openrouter_cache_status: params.openrouterCacheStatus,
				rate_limit_remaining: params.rateLimitRemaining,
				metadata: params.metadata
			};

			const { error } = await this.supabase.from('llm_usage_logs').insert(payload);

			if (error) {
				if (
					error.code === '23503' &&
					error.message?.includes('llm_usage_logs_project_id_fkey')
				) {
					const { error: retryError } = await this.supabase
						.from('llm_usage_logs')
						.insert({ ...payload, project_id: null });
					if (retryError) {
						console.error(
							'Failed to log LLM usage (retry without project_id):',
							retryError
						);
					}
					return;
				}

				console.error('Failed to log LLM usage to database:', error);
			}
		} catch (error) {
			console.error('Exception while logging LLM usage:', error);
			if (this.errorLogger?.logDatabaseError) {
				await this.errorLogger.logDatabaseError(
					error,
					'INSERT',
					'llm_usage_logs',
					params.userId,
					{
						operation: 'logUsageToDatabase',
						errorType: 'llm_usage_logging_failure',
						operationType: params.operationType,
						modelUsed: params.modelUsed,
						status: params.status
					}
				);
			}
		}
	}

	private normalizeUserIdForLogging(userId?: string | null): string | null {
		if (!userId) return null;
		const trimmed = userId.trim();
		return this.isUUID(trimmed) ? trimmed : null;
	}

	private normalizeProjectIdForLogging(projectId?: string | null): string | null {
		if (!projectId) return null;
		const trimmed = projectId.trim();
		return this.isUUID(trimmed) ? trimmed : null;
	}

	private normalizeOptionalIdForLogging(value?: string | null): string | null {
		if (!value) return null;
		const trimmed = value.trim();
		return this.isUUID(trimmed) ? trimmed : null;
	}

	private getMetadataId(metadata: any, key: string): string | undefined {
		if (!metadata || typeof metadata !== 'object') {
			return undefined;
		}
		const value = metadata[key];
		return typeof value === 'string' ? value : undefined;
	}

	private isUUID(value: string): boolean {
		const uuidRegex =
			/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
		return uuidRegex.test(value);
	}
}
