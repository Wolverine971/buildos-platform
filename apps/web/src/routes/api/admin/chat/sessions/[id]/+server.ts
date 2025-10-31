// apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts
/**
 * Chat Session Detail API
 *
 * Returns complete session details including:
 * - Session metadata
 * - Conversation messages
 * - Agent plans and executions
 * - Agent-to-agent conversations
 * - Tool executions
 * - Compressions
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const sessionId = params.id;

	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	// Check admin permission
	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		// ===================================================
		// 1. FETCH SESSION DATA
		// ===================================================
		const { data: session, error: sessionError } = await supabase
			.from('chat_sessions')
			.select(
				`
        *,
        users!inner(id, email, name)
      `
			)
			.eq('id', sessionId)
			.single();

		if (sessionError || !session) {
			return ApiResponse.notFound('Session not found');
		}

		// ===================================================
		// 2. FETCH CONVERSATION MESSAGES
		// ===================================================
		const { data: messages, error: messagesError } = await supabase
			.from('chat_messages')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: true });

		if (messagesError) throw messagesError;

		// ===================================================
		// 3. FETCH AGENT PLAN (if exists)
		// ===================================================
		const { data: agentPlans, error: planError } = await supabase
			.from('agent_plans')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false });

		if (planError) throw planError;

		const agentPlan = agentPlans?.[0] || null;

		// ===================================================
		// 4. FETCH AGENT EXECUTIONS (with messages)
		// ===================================================
		let agentExecutions: any[] = [];

		if (agentPlan) {
			const { data: executions, error: executionsError } = await supabase
				.from('agent_executions')
				.select('*')
				.eq('plan_id', agentPlan.id)
				.order('created_at', { ascending: true });

			if (executionsError) throw executionsError;

			// For each execution, fetch the agent-to-agent messages
			if (executions && executions.length > 0) {
				const executionIds = executions.map((e) => e.id);

				const { data: agentMessages, error: agentMessagesError } = await supabase
					.from('agent_chat_messages')
					.select('*')
					.in('execution_id', executionIds)
					.order('created_at', { ascending: true });

				if (agentMessagesError) throw agentMessagesError;

				// Group messages by execution_id
				const messagesByExecution = (agentMessages || []).reduce(
					(acc, msg) => {
						if (!acc[msg.execution_id]) {
							acc[msg.execution_id] = [];
						}
						acc[msg.execution_id].push(msg);
						return acc;
					},
					{} as Record<string, any[]>
				);

				// Attach messages to executions
				agentExecutions = executions.map((execution) => ({
					...execution,
					messages: messagesByExecution[execution.id] || []
				}));
			}
		}

		// ===================================================
		// 5. FETCH TOOL EXECUTIONS
		// ===================================================
		const { data: toolExecutions, error: toolError } = await supabase
			.from('chat_tool_executions')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: true });

		if (toolError) throw toolError;

		// ===================================================
		// 6. FETCH COMPRESSIONS
		// ===================================================
		const { data: compressions, error: compressionsError } = await supabase
			.from('chat_compressions')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: true });

		if (compressionsError) throw compressionsError;

		// ===================================================
		// FORMAT RESPONSE
		// ===================================================
		const totalTokens = session.total_tokens_used || 0;
		const costEstimate = (totalTokens / 1000000) * 0.21; // $0.21 per 1M tokens

		return ApiResponse.success({
			session: {
				id: session.id,
				title: session.title || session.auto_title || 'Untitled Session',
				user: {
					id: session.users.id,
					email: session.users.email,
					name: session.users.name
				},
				context_type: session.context_type,
				context_id: session.context_id,
				status: session.status,
				message_count: session.message_count || 0,
				total_tokens: totalTokens,
				tool_call_count: session.tool_call_count || 0,
				created_at: session.created_at,
				updated_at: session.updated_at,
				cost_estimate: costEstimate
			},
			messages: messages || [],
			agent_plan: agentPlan
				? {
						id: agentPlan.id,
						strategy: agentPlan.strategy,
						steps: agentPlan.steps,
						status: agentPlan.status,
						created_at: agentPlan.created_at,
						updated_at: agentPlan.updated_at
					}
				: null,
			agent_executions: agentExecutions,
			tool_executions: toolExecutions || [],
			compressions: compressions || []
		});
	} catch (err) {
		console.error('Session detail error:', err);
		return ApiResponse.internalError(err, 'Failed to load session details');
	}
};
