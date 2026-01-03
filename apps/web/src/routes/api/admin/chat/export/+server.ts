// apps/web/src/routes/api/admin/chat/export/+server.ts
/**
 * Chat Data Export API
 *
 * Exports chat sessions, messages, and analytics data in JSON or CSV format
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
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

	const timeframe = url.searchParams.get('timeframe') || '7d';
	const format = url.searchParams.get('format') || 'json';

	// Calculate time range
	const now = new Date();
	let startDate: Date;

	switch (timeframe) {
		case '24h':
			startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case '30d':
			startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		case '7d':
		default:
			startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}

	try {
		const countToolCalls = (toolCalls: unknown): number => {
			if (!toolCalls) return 0;
			if (Array.isArray(toolCalls)) return toolCalls.length;
			if (typeof toolCalls === 'string') {
				try {
					const parsed = JSON.parse(toolCalls);
					if (Array.isArray(parsed)) return parsed.length;
				} catch {
					return 1;
				}
			}
			return 1;
		};

		const { data: agentSessionsData, error: agentSessionsError } = await supabase
			.from('agent_chat_sessions')
			.select(
				`
				*,
				users!agent_chat_sessions_user_id_fkey(email, name)
			`
			)
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: false });

		if (agentSessionsError) throw agentSessionsError;

		const agentSessionIds = agentSessionsData?.map((s) => s.id) || [];

		let agentChatMessagesData: any[] = [];
		let agentExecutionsData: any[] = [];
		let plansData: any[] = [];

		if (agentSessionIds.length > 0) {
			const [
				{ data: agentChatMessages, error: agentChatMessagesError },
				{ data: agentExecutions, error: agentExecutionsError },
				{ data: agentPlans, error: agentPlansError }
			] = await Promise.all([
				supabase
					.from('agent_chat_messages')
					.select('*')
					.in('agent_session_id', agentSessionIds)
					.order('created_at', { ascending: true }),
				supabase
					.from('agent_executions')
					.select('*')
					.in('agent_session_id', agentSessionIds)
					.order('created_at', { ascending: true }),
				supabase
					.from('agent_plans')
					.select('*')
					.in('session_id', agentSessionIds)
					.order('created_at', { ascending: true })
			]);

			if (agentChatMessagesError) throw agentChatMessagesError;
			if (agentExecutionsError) throw agentExecutionsError;
			if (agentPlansError) throw agentPlansError;

			agentChatMessagesData = agentChatMessages || [];
			agentExecutionsData = agentExecutions || [];
			plansData = agentPlans || [];
		}

		const tokensBySession = new Map<string, number>();
		const toolCallsBySession = new Map<string, number>();

		agentChatMessagesData.forEach((message) => {
			if (!message.agent_session_id) return;
			const tokens = message.tokens_used || 0;
			const toolCalls = countToolCalls(message.tool_calls);
			tokensBySession.set(
				message.agent_session_id,
				(tokensBySession.get(message.agent_session_id) || 0) + tokens
			);
			toolCallsBySession.set(
				message.agent_session_id,
				(toolCallsBySession.get(message.agent_session_id) || 0) + toolCalls
			);
		});

		const exportData = {
			export_date: now.toISOString(),
			timeframe,
			agent_chat_sessions: agentSessionsData,
			agent_chat_messages: agentChatMessagesData,
			agent_executions: agentExecutionsData,
			agent_plans: plansData,
			summary: {
				total_agent_sessions: agentSessionsData?.length || 0,
				total_agent_messages: agentChatMessagesData?.length || 0,
				total_agent_executions: agentExecutionsData?.length || 0,
				total_agent_plans: plansData?.length || 0
			}
		};

		if (format === 'json') {
			return new Response(JSON.stringify(exportData, null, 2), {
				headers: {
					'Content-Type': 'application/json',
					'Content-Disposition': `attachment; filename="chat-export-${timeframe}-${now.toISOString().split('T')[0]}.json"`
				}
			});
		}

		// CSV format (simplified - just sessions)
		if (format === 'csv') {
			const csvRows = [
				// Header
				[
					'Session ID',
					'User Email',
					'Status',
					'Context Type',
					'Message Count',
					'Tokens Used',
					'Tool Calls',
					'Created At',
					'Completed At'
				].join(',')
			];

			// Data rows
			agentSessionsData?.forEach((session) => {
				const tokens = tokensBySession.get(session.id) || 0;
				const toolCalls = toolCallsBySession.get(session.id) || 0;
				const contextType = session.context_type || session.session_type || '';
				csvRows.push(
					[
						session.id,
						session.users?.email || '',
						session.status,
						contextType,
						session.message_count || 0,
						tokens,
						toolCalls,
						session.created_at,
						session.completed_at || ''
					].join(',')
				);
			});

			return new Response(csvRows.join('\n'), {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': `attachment; filename="chat-export-${timeframe}-${now.toISOString().split('T')[0]}.csv"`
				}
			});
		}

		return ApiResponse.badRequest('Invalid format. Use "json" or "csv".');
	} catch (err) {
		console.error('Chat export error:', err);
		return ApiResponse.internalError(err, 'Failed to export chat data');
	}
};
