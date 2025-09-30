// src/lib/services/llm-usage.service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export interface UsageSummary {
	totalRequests: number;
	totalCost: number;
	totalTokens: number;
	avgResponseTime: number;
	byOperation: Record<string, { requests: number; cost: number; tokens: number }>;
	byModel: Record<string, { requests: number; cost: number; tokens: number }>;
}

export interface DailyUsage {
	date: string;
	totalRequests: number;
	totalCost: number;
	totalTokens: number;
	successRate: number;
}

export interface ModelBreakdown {
	model: string;
	requests: number;
	cost: number;
	tokens: number;
	avgResponseTime: number;
}

export class LLMUsageService {
	private supabase: SupabaseClient<Database>;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
	}

	/**
	 * Get usage summary for a user within a date range
	 */
	async getUserUsage(
		userId: string,
		startDate: Date,
		endDate: Date
	): Promise<UsageSummary | null> {
		try {
			const { data, error } = await this.supabase.rpc('get_user_llm_usage', {
				p_user_id: userId,
				p_start_date: startDate.toISOString(),
				p_end_date: endDate.toISOString()
			});

			if (error) throw error;
			if (!data || data.length === 0) return null;

			const result = data[0];
			return {
				totalRequests: Number(result.total_requests) || 0,
				totalCost: Number(result.total_cost) || 0,
				totalTokens: Number(result.total_tokens) || 0,
				avgResponseTime: Number(result.avg_response_time) || 0,
				byOperation: result.by_operation || {},
				byModel: result.by_model || {}
			};
		} catch (error) {
			console.error('Error fetching user LLM usage:', error);
			return null;
		}
	}

	/**
	 * Get daily usage breakdown for a user
	 */
	async getDailyUsage(userId: string, startDate: Date, endDate: Date): Promise<DailyUsage[]> {
		try {
			const { data, error } = await this.supabase
				.from('llm_usage_summary')
				.select('*')
				.eq('user_id', userId)
				.eq('summary_type', 'daily')
				.gte('summary_date', startDate.toISOString().split('T')[0])
				.lte('summary_date', endDate.toISOString().split('T')[0])
				.order('summary_date', { ascending: false });

			if (error) throw error;

			return (
				data?.map((row) => ({
					date: row.summary_date,
					totalRequests: row.total_requests || 0,
					totalCost: Number(row.total_cost_usd) || 0,
					totalTokens: row.total_tokens || 0,
					successRate:
						row.total_requests > 0
							? (row.successful_requests / row.total_requests) * 100
							: 0
				})) || []
			);
		} catch (error) {
			console.error('Error fetching daily usage:', error);
			return [];
		}
	}

	/**
	 * Get model breakdown for a user
	 */
	async getModelBreakdown(
		userId: string,
		startDate: Date,
		endDate: Date
	): Promise<ModelBreakdown[]> {
		try {
			const { data, error } = await this.supabase
				.from('llm_usage_logs')
				.select(
					'model_used, prompt_tokens, completion_tokens, total_cost_usd, response_time_ms'
				)
				.eq('user_id', userId)
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString());

			if (error) throw error;
			if (!data) return [];

			// Aggregate by model
			const modelMap = new Map<
				string,
				{ requests: number; cost: number; tokens: number; totalResponseTime: number }
			>();

			for (const row of data) {
				const model = row.model_used;
				const existing = modelMap.get(model) || {
					requests: 0,
					cost: 0,
					tokens: 0,
					totalResponseTime: 0
				};

				existing.requests += 1;
				existing.cost += Number(row.total_cost_usd) || 0;
				existing.tokens += (row.prompt_tokens || 0) + (row.completion_tokens || 0);
				existing.totalResponseTime += row.response_time_ms || 0;

				modelMap.set(model, existing);
			}

			return Array.from(modelMap.entries())
				.map(([model, stats]) => ({
					model,
					requests: stats.requests,
					cost: stats.cost,
					tokens: stats.tokens,
					avgResponseTime: Math.round(stats.totalResponseTime / stats.requests)
				}))
				.sort((a, b) => b.cost - a.cost);
		} catch (error) {
			console.error('Error fetching model breakdown:', error);
			return [];
		}
	}

	/**
	 * Get recent usage logs for a user
	 */
	async getRecentLogs(userId: string, limit: number = 50) {
		try {
			const { data, error } = await this.supabase
				.from('llm_usage_logs')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.limit(limit);

			if (error) throw error;
			return data || [];
		} catch (error) {
			console.error('Error fetching recent logs:', error);
			return [];
		}
	}

	/**
	 * Get usage for a specific project
	 */
	async getProjectUsage(projectId: string, startDate?: Date, endDate?: Date) {
		try {
			let query = this.supabase
				.from('llm_usage_logs')
				.select('*')
				.eq('project_id', projectId)
				.order('created_at', { ascending: false });

			if (startDate) {
				query = query.gte('created_at', startDate.toISOString());
			}
			if (endDate) {
				query = query.lte('created_at', endDate.toISOString());
			}

			const { data, error } = await query;

			if (error) throw error;

			// Calculate summary
			const totalCost =
				data?.reduce((sum, row) => sum + Number(row.total_cost_usd || 0), 0) || 0;
			const totalTokens = data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
			const avgResponseTime =
				data && data.length > 0
					? data.reduce((sum, row) => sum + (row.response_time_ms || 0), 0) / data.length
					: 0;

			return {
				logs: data || [],
				summary: {
					totalRequests: data?.length || 0,
					totalCost,
					totalTokens,
					avgResponseTime: Math.round(avgResponseTime)
				}
			};
		} catch (error) {
			console.error('Error fetching project usage:', error);
			return {
				logs: [],
				summary: { totalRequests: 0, totalCost: 0, totalTokens: 0, avgResponseTime: 0 }
			};
		}
	}

	/**
	 * Get current month usage for a user
	 */
	async getCurrentMonthUsage(userId: string) {
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

		return this.getUserUsage(userId, startOfMonth, endOfMonth);
	}

	/**
	 * Get today's usage for a user
	 */
	async getTodayUsage(userId: string) {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		return this.getUserUsage(userId, today, tomorrow);
	}

	/**
	 * Check if user has exceeded a cost threshold
	 */
	async checkCostThreshold(userId: string, threshold: number): Promise<boolean> {
		const monthUsage = await this.getCurrentMonthUsage(userId);
		return monthUsage ? monthUsage.totalCost >= threshold : false;
	}

	/**
	 * Get usage by operation type for a user
	 */
	async getOperationBreakdown(userId: string, startDate: Date, endDate: Date) {
		try {
			const { data, error } = await this.supabase
				.from('llm_usage_logs')
				.select('operation_type, total_cost_usd, total_tokens, response_time_ms')
				.eq('user_id', userId)
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString());

			if (error) throw error;
			if (!data) return [];

			// Aggregate by operation type
			const opMap = new Map<
				string,
				{ requests: number; cost: number; tokens: number; totalResponseTime: number }
			>();

			for (const row of data) {
				const op = row.operation_type;
				const existing = opMap.get(op) || {
					requests: 0,
					cost: 0,
					tokens: 0,
					totalResponseTime: 0
				};

				existing.requests += 1;
				existing.cost += Number(row.total_cost_usd) || 0;
				existing.tokens += row.total_tokens || 0;
				existing.totalResponseTime += row.response_time_ms || 0;

				opMap.set(op, existing);
			}

			return Array.from(opMap.entries())
				.map(([operation, stats]) => ({
					operation,
					requests: stats.requests,
					cost: stats.cost,
					tokens: stats.tokens,
					avgResponseTime: Math.round(stats.totalResponseTime / stats.requests)
				}))
				.sort((a, b) => b.cost - a.cost);
		} catch (error) {
			console.error('Error fetching operation breakdown:', error);
			return [];
		}
	}
}
