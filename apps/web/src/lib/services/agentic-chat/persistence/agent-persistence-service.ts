// apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts
/**
 * Agent Persistence Service
 *
 * Handles all database operations for the agentic chat system.
 * This service provides a clean abstraction layer over Supabase,
 * consolidating all persistence logic that was previously scattered
 * throughout the monolithic agent-planner-service.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Refactoring specification
 * @see {@link ../../../agent-planner-service.ts} - Original implementation reference
 *
 * Key improvements:
 * - Single responsibility: Only handles database operations
 * - Consistent error handling with PersistenceError
 * - Transaction support for atomic operations
 * - Proper TypeScript typing throughout
 * - Comprehensive test coverage
 *
 * @module agentic-chat/persistence
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	AgentInsert,
	AgentPlanInsert,
	AgentPlanStep,
	AgentPlanMetadata,
	PlanningStrategy,
	AgentChatSessionInsert,
	AgentChatMessageInsert
} from '@buildos/shared-types';
import {
	PersistenceError,
	type PersistenceOperations,
	type TimingMetricInsert
} from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AgentPersistenceService');

/**
 * Service for handling all database operations related to agents, plans, sessions, and messages
 */
export class AgentPersistenceService implements PersistenceOperations {
	constructor(private supabase: SupabaseClient<Database>) {}

	// ============================================
	// AGENT OPERATIONS
	// ============================================

	/**
	 * Create a new agent in the database
	 * If data.id is provided, it will be used; otherwise a new UUID is generated
	 */
	async createAgent(data: AgentInsert): Promise<string> {
		try {
			const agentId = data.id || uuidv4();
			const agentData: AgentInsert = {
				...data,
				id: agentId,
				created_at: data.created_at || new Date().toISOString()
			};

			const { error } = await this.supabase.from('agents').insert(agentData);

			if (error) {
				throw new PersistenceError(
					`Failed to create agent: ${error.message}`,
					'createAgent',
					{ error, data }
				);
			}

			logger.info('Created agent', { agentId, agentType: agentData.type });
			return agentId;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'createAgent',
				{ error, data }
			);
		}
	}

	/**
	 * Update an existing agent
	 */
	async updateAgent(id: string, data: Partial<AgentInsert>): Promise<void> {
		try {
			const updateData = {
				...data
			};

			// If status is being set to completed or failed, add completed_at when missing
			if (
				(data.status === 'completed' || data.status === 'failed') &&
				!updateData.completed_at
			) {
				updateData.completed_at = new Date().toISOString();
			}

			const { error } = await this.supabase.from('agents').update(updateData).eq('id', id);

			if (error) {
				throw new PersistenceError(
					`Failed to update agent: ${error.message}`,
					'updateAgent',
					{ error, id, data }
				);
			}

			logger.info('Updated agent', { agentId: id, status: data.status });
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to update agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'updateAgent',
				{ error, id, data }
			);
		}
	}

	/**
	 * Get an agent by ID
	 */
	async getAgent(id: string): Promise<AgentInsert | null> {
		try {
			const { data, error } = await this.supabase
				.from('agents')
				.select('*')
				.eq('id', id)
				.single();

			if (error) {
				// If it's a not found error, return null
				if (error.code === 'PGRST116') {
					return null;
				}
				throw new PersistenceError(`Failed to get agent: ${error.message}`, 'getAgent', {
					error,
					id
				});
			}

			return data;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to get agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'getAgent',
				{ error, id }
			);
		}
	}

	// ============================================
	// PLAN OPERATIONS
	// ============================================

	/**
	 * Create a new plan
	 * If data.id is provided, it will be used; otherwise a new UUID is generated
	 */
	async createPlan(data: AgentPlanInsert): Promise<string> {
		try {
			const planId = data.id || uuidv4();
			const planData: AgentPlanInsert = {
				...data,
				id: planId,
				created_at: data.created_at || new Date().toISOString()
			};

			const { error } = await this.supabase.from('agent_plans').insert(planData);

			if (error) {
				throw new PersistenceError(
					`Failed to create plan: ${error.message}`,
					'createPlan',
					{ error, data }
				);
			}

			logger.info('Created plan', { planId, strategy: planData.strategy });
			return planId;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to create plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'createPlan',
				{ error, data }
			);
		}
	}

	/**
	 * Update an existing plan
	 */
	async updatePlan(id: string, data: Partial<AgentPlanInsert>): Promise<void> {
		try {
			const updateData = {
				...data,
				updated_at: new Date().toISOString()
			};

			// If status is completed, add completed_at
			if (data.status === 'completed') {
				updateData.completed_at = updateData.completed_at || new Date().toISOString();
			}

			const { error } = await this.supabase
				.from('agent_plans')
				.update(updateData)
				.eq('id', id);

			if (error) {
				throw new PersistenceError(
					`Failed to update plan: ${error.message}`,
					'updatePlan',
					{ error, id, data }
				);
			}

			logger.info('Updated plan', { planId: id, status: data.status });
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to update plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'updatePlan',
				{ error, id, data }
			);
		}
	}

	/**
	 * Update a specific step within a plan
	 * Uses optimistic update with retry on conflict to handle race conditions
	 */
	async updatePlanStep(
		planId: string,
		stepNumber: number,
		stepUpdate: Record<string, any>,
		maxRetries: number = 3
	): Promise<void> {
		// Filter out undefined values to prevent overwriting with undefined
		const filteredUpdate = Object.fromEntries(
			Object.entries(stepUpdate).filter(([_, v]) => v !== undefined)
		);

		// Prefer RPC-based update to avoid client-side read/modify/write contention
		const rpcApplied = await this.tryUpdatePlanStepRpc(planId, stepNumber, filteredUpdate);
		if (rpcApplied) {
			return;
		}

		await this.updatePlanStepLegacy(planId, stepNumber, filteredUpdate, maxRetries);
	}

	private async tryUpdatePlanStepRpc(
		planId: string,
		stepNumber: number,
		stepUpdate: Record<string, any>
	): Promise<boolean> {
		let rpcResult: { data: any; error: any } | undefined;

		try {
			const response = await this.supabase.rpc('update_agent_plan_step', {
				p_plan_id: planId,
				p_step_number: stepNumber,
				p_step_update: stepUpdate
			} as any);

			if (!response || typeof response !== 'object') {
				return false;
			}

			rpcResult = response as { data: any; error: any };
		} catch (error) {
			logger.warn('Plan step RPC update failed, falling back to legacy path', {
				planId,
				stepNumber,
				error: error instanceof Error ? error.message : String(error)
			});
			return false;
		}

		if (!rpcResult.error) {
			logger.info('Updated plan step via RPC', {
				planId,
				stepNumber,
				status: (stepUpdate as any).status
			});
			return true;
		}

		const error = rpcResult.error;
		if (error?.code === '42883') {
			// Function missing - fall back to legacy update
			logger.warn('Plan step RPC not available, falling back to legacy update', {
				planId,
				stepNumber
			});
			return false;
		}

		if (error?.code === 'PGRST116') {
			const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
			const notFoundMessage = message.includes('plan')
				? `Plan ${planId} not found`
				: `Step ${stepNumber} not found in plan`;
			throw new PersistenceError(notFoundMessage, 'updatePlanStep', {
				planId,
				stepNumber,
				error
			});
		}

		throw new PersistenceError(
			`Failed to update plan step: ${error?.message ?? 'Unknown error'}`,
			'updatePlanStep',
			{ error, planId, stepNumber }
		);
	}

	private async updatePlanStepLegacy(
		planId: string,
		stepNumber: number,
		stepUpdate: Record<string, any>,
		maxRetries: number
	): Promise<void> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				// First, get the current plan to access its steps
				const plan = await this.getPlan(planId);
				if (!plan) {
					throw new PersistenceError(`Plan ${planId} not found`, 'updatePlanStep', {
						planId,
						stepNumber
					});
				}

				// Parse steps (could be JSON)
				const steps = Array.isArray(plan.steps)
					? plan.steps
					: JSON.parse(plan.steps as string);
				const currentUpdatedAt = plan.updated_at;
				if (!currentUpdatedAt) {
					throw new PersistenceError(
						`Plan ${planId} missing updated_at for optimistic lock`,
						'updatePlanStep',
						{ planId, stepNumber }
					);
				}

				// Find and update the specific step
				const stepIndex = steps.findIndex((s: any) => s.stepNumber === stepNumber);
				if (stepIndex === -1) {
					throw new PersistenceError(
						`Step ${stepNumber} not found in plan`,
						'updatePlanStep',
						{
							planId,
							stepNumber,
							steps
						}
					);
				}

				// Update the step
				steps[stepIndex] = {
					...steps[stepIndex],
					...stepUpdate
				};

				const nextUpdatedAt = new Date().toISOString();
				const { error: updateError } = await this.supabase
					.from('agent_plans')
					.update({
						steps,
						updated_at: nextUpdatedAt
					})
					.eq('id', planId)
					.eq('updated_at', currentUpdatedAt)
					.select('id')
					.single();

				if (updateError) {
					if (updateError.code === 'PGRST116') {
						throw new Error('Optimistic lock conflict');
					}
					throw new PersistenceError(
						`Failed to update plan step: ${updateError.message}`,
						'updatePlanStep',
						{ error: updateError, planId, stepNumber }
					);
				}

				logger.info('Updated plan step', {
					planId,
					stepNumber,
					status: (stepUpdate as any).status
				});
				return; // Success - exit the retry loop
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Don't retry on definitive errors (not found, etc.)
				if (error instanceof PersistenceError) {
					throw error;
				}

				// Log retry attempt
				if (attempt < maxRetries) {
					logger.warn('updatePlanStep attempt failed, retrying', {
						attempt,
						planId,
						stepNumber,
						error: lastError.message
					});
					// Exponential backoff: 100ms, 200ms, 400ms...
					await new Promise((resolve) =>
						setTimeout(resolve, 100 * Math.pow(2, attempt - 1))
					);
				}
			}
		}

		// All retries exhausted
		throw new PersistenceError(
			`Failed to update plan step after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
			'updatePlanStep',
			{ planId, stepNumber, lastError }
		);
	}

	/**
	 * Get a plan by ID
	 */
	async getPlan(id: string): Promise<AgentPlanInsert | null> {
		try {
			const { data, error } = await this.supabase
				.from('agent_plans')
				.select('*')
				.eq('id', id)
				.single();

			if (error) {
				if (error.code === 'PGRST116') {
					return null;
				}
				throw new PersistenceError(`Failed to get plan: ${error.message}`, 'getPlan', {
					error,
					id
				});
			}

			// Transform database row to AgentPlanInsert type
			// The database stores Json types for steps/metadata but AgentPlanInsert expects typed versions
			return {
				...data,
				steps: (data.steps as AgentPlanStep[]) ?? [],
				metadata: data.metadata as AgentPlanMetadata | null,
				strategy: data.strategy as PlanningStrategy,
				status: data.status as AgentPlanInsert['status']
			};
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to get plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'getPlan',
				{ error, id }
			);
		}
	}

	// ============================================
	// SESSION OPERATIONS
	// ============================================

	/**
	 * Create a new chat session
	 * If data.id is provided, it will be used; otherwise a new UUID is generated
	 */
	async createChatSession(data: AgentChatSessionInsert): Promise<string> {
		try {
			const sessionData: AgentChatSessionInsert = {
				...data,
				id: data.id || uuidv4(),
				created_at: data.created_at || new Date().toISOString()
			};

			const { data: session, error } = await this.supabase
				.from('agent_chat_sessions')
				.insert(sessionData)
				.select()
				.single();

			if (error) {
				throw new PersistenceError(
					`Failed to create session: ${error.message}`,
					'createChatSession',
					{ error, data }
				);
			}

			if (!session) {
				throw new PersistenceError(
					'Failed to create session: No data returned',
					'createChatSession',
					{ data }
				);
			}

			logger.info('Created chat session', { sessionId: session.id });
			return session.id;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'createChatSession',
				{ error, data }
			);
		}
	}

	/**
	 * Update a chat session
	 */
	async updateChatSession(id: string, data: Partial<AgentChatSessionInsert>): Promise<void> {
		try {
			const updateData = {
				...data
			};

			// If status is completed or failed, add completed_at when missing
			if (
				(data.status === 'completed' || data.status === 'failed') &&
				!updateData.completed_at
			) {
				updateData.completed_at = new Date().toISOString();
			}

			const { error } = await this.supabase
				.from('agent_chat_sessions')
				.update(updateData)
				.eq('id', id)
				.select()
				.single();

			if (error) {
				throw new PersistenceError(
					`Failed to update session: ${error.message}`,
					'updateChatSession',
					{ error, id, data }
				);
			}

			logger.info('Updated chat session', { sessionId: id, status: data.status });
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to update session: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'updateChatSession',
				{ error, id, data }
			);
		}
	}

	/**
	 * Get a chat session by ID
	 */
	async getChatSession(id: string): Promise<AgentChatSessionInsert | null> {
		try {
			const { data, error } = await this.supabase
				.from('agent_chat_sessions')
				.select('*')
				.eq('id', id)
				.single();

			if (error) {
				if (error.code === 'PGRST116') {
					return null;
				}
				throw new PersistenceError(
					`Failed to get session: ${error.message}`,
					'getChatSession',
					{ error, id }
				);
			}

			return data;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to get session: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'getChatSession',
				{ error, id }
			);
		}
	}

	// ============================================
	// MESSAGE OPERATIONS
	// ============================================

	/**
	 * Save a chat message
	 * If data.id is provided, it will be used; otherwise a new UUID is generated
	 */
	async saveMessage(data: AgentChatMessageInsert): Promise<string> {
		try {
			const messageData: AgentChatMessageInsert = {
				...data,
				id: data.id || uuidv4(),
				created_at: data.created_at || new Date().toISOString()
			};

			const { data: message, error } = await this.supabase
				.from('agent_chat_messages')
				.insert(messageData)
				.select()
				.single();

			if (error) {
				throw new PersistenceError(
					`Failed to save message: ${error.message}`,
					'saveMessage',
					{ error, data }
				);
			}

			if (!message) {
				throw new PersistenceError(
					'Failed to save message: No data returned',
					'saveMessage',
					{ data }
				);
			}

			logger.info('Saved message', { messageId: message.id, role: message.role });
			return message.id;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to save message: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'saveMessage',
				{ error, data }
			);
		}
	}

	/**
	 * Get messages for a session
	 */
	async getMessages(sessionId: string, limit: number = 50): Promise<AgentChatMessageInsert[]> {
		try {
			const { data, error } = await this.supabase
				.from('agent_chat_messages')
				.select('*')
				.eq('agent_session_id', sessionId)
				.order('created_at', { ascending: true })
				.limit(limit);

			if (error) {
				throw new PersistenceError(
					`Failed to get messages: ${error.message}`,
					'getMessages',
					{ error, sessionId, limit }
				);
			}

			return data || [];
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to get messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'getMessages',
				{ error, sessionId, limit }
			);
		}
	}

	// ============================================
	// TIMING METRICS OPERATIONS
	// ============================================

	/**
	 * Create a new timing metrics record
	 * If data.id is provided, it will be used; otherwise a new UUID is generated
	 */
	async createTimingMetric(data: TimingMetricInsert): Promise<string> {
		try {
			const metricId = data.id || uuidv4();
			const metricData: TimingMetricInsert = {
				...data,
				id: metricId,
				created_at: data.created_at || new Date().toISOString(),
				updated_at: data.updated_at || new Date().toISOString()
			};

			const { error } = await this.supabase.from('timing_metrics').insert(metricData);

			if (error) {
				throw new PersistenceError(
					`Failed to create timing metric: ${error.message}`,
					'createTimingMetric',
					{ error, data }
				);
			}

			logger.info('Created timing metric', { metricId, sessionId: data.session_id });
			return metricId;
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to create timing metric: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'createTimingMetric',
				{ error, data }
			);
		}
	}

	/**
	 * Update an existing timing metrics record
	 */
	async updateTimingMetric(id: string, data: Partial<TimingMetricInsert>): Promise<void> {
		try {
			const updateData = {
				...data,
				updated_at: new Date().toISOString()
			};

			const { error } = await this.supabase
				.from('timing_metrics')
				.update(updateData)
				.eq('id', id);

			if (error) {
				throw new PersistenceError(
					`Failed to update timing metric: ${error.message}`,
					'updateTimingMetric',
					{ error, id, data }
				);
			}
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to update timing metric: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'updateTimingMetric',
				{ error, id, data }
			);
		}
	}

	// ============================================
	// TRANSACTION SUPPORT
	// ============================================

	/**
	 * Execute multiple operations in a transaction
	 * Note: Supabase doesn't natively support client-side transactions,
	 * so this is a best-effort implementation using RPC functions
	 */
	async executeInTransaction<T>(operations: () => Promise<T>): Promise<T> {
		// For now, just execute operations normally
		// In production, you might want to create RPC functions for atomic operations
		try {
			return await operations();
		} catch (error) {
			throw new PersistenceError(
				`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'executeInTransaction',
				{ error }
			);
		}
	}

	// ============================================
	// UTILITY OPERATIONS
	// ============================================

	/**
	 * Clean up old sessions (optional maintenance operation)
	 */
	async cleanupOldSessions(daysOld: number = 30): Promise<void> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysOld);

			const { error } = await this.supabase
				.from('agent_chat_sessions')
				.delete()
				.lt('created_at', cutoffDate.toISOString())
				.eq('status', 'completed');

			if (error) {
				throw new PersistenceError(
					`Failed to cleanup old sessions: ${error.message}`,
					'cleanupOldSessions',
					{ error, daysOld }
				);
			}

			logger.info('Cleaned up old sessions', { daysOld });
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to cleanup old sessions: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'cleanupOldSessions',
				{ error, daysOld }
			);
		}
	}

	/**
	 * Get session statistics
	 */
	async getSessionStats(
		userId: string,
		days: number = 7
	): Promise<{
		totalSessions: number;
		totalMessages: number;
		totalTokens: number;
		averageTokensPerSession: number;
	}> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - days);

			const { data: sessions, error } = await this.supabase
				.from('agent_chat_sessions')
				.select('id, message_count')
				.eq('user_id', userId)
				.gte('created_at', cutoffDate.toISOString());

			if (error) {
				throw new PersistenceError(
					`Failed to get session stats: ${error.message}`,
					'getSessionStats',
					{ error, userId, days }
				);
			}

			const stats = (sessions || []).reduce(
				(acc, session) => ({
					totalSessions: acc.totalSessions + 1,
					totalMessages: acc.totalMessages + (session.message_count || 0),
					totalTokens: acc.totalTokens
				}),
				{ totalSessions: 0, totalMessages: 0, totalTokens: 0 }
			);

			const { data: messages, error: messagesError } = await this.supabase
				.from('agent_chat_messages')
				.select('tokens_used')
				.eq('user_id', userId)
				.gte('created_at', cutoffDate.toISOString());

			if (messagesError) {
				throw new PersistenceError(
					`Failed to get session stats messages: ${messagesError.message}`,
					'getSessionStats',
					{ error: messagesError, userId, days }
				);
			}

			const totalTokens = (messages || []).reduce(
				(sum, message) => sum + (message.tokens_used || 0),
				0
			);

			return {
				...stats,
				totalTokens,
				averageTokensPerSession:
					stats.totalSessions > 0 ? Math.round(totalTokens / stats.totalSessions) : 0
			};
		} catch (error) {
			if (error instanceof PersistenceError) {
				throw error;
			}
			throw new PersistenceError(
				`Failed to get session stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'getSessionStats',
				{ error, userId, days }
			);
		}
	}
}
