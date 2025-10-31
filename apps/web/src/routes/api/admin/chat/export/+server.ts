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
		// Get chat sessions with user info
		const { data: sessionsData, error: sessionsError } = await supabase
			.from('chat_sessions')
			.select(
				`
        *,
        users!inner(email, name)
      `
			)
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: false });

		if (sessionsError) throw sessionsError;

		// Get messages for these sessions
		const sessionIds = sessionsData?.map((s) => s.id) || [];

		const { data: messagesData, error: messagesError } = await supabase
			.from('chat_messages')
			.select('*')
			.in('session_id', sessionIds)
			.order('created_at', { ascending: true });

		if (messagesError) throw messagesError;

		// Get tool executions
		const { data: toolExecutionsData, error: toolExecutionsError } = await supabase
			.from('chat_tool_executions')
			.select('*')
			.in('session_id', sessionIds)
			.order('created_at', { ascending: true });

		if (toolExecutionsError) throw toolExecutionsError;

		// Get agent plans
		const { data: plansData, error: plansError } = await supabase
			.from('agent_plans')
			.select('*')
			.in('session_id', sessionIds)
			.order('created_at', { ascending: true });

		if (plansError) throw plansError;

		// Get compressions
		const { data: compressionsData, error: compressionsError } = await supabase
			.from('chat_compressions')
			.select('*')
			.in('session_id', sessionIds)
			.order('created_at', { ascending: true });

		if (compressionsError) throw compressionsError;

		const exportData = {
			export_date: now.toISOString(),
			timeframe,
			sessions: sessionsData,
			messages: messagesData,
			tool_executions: toolExecutionsData,
			agent_plans: plansData,
			compressions: compressionsData,
			summary: {
				total_sessions: sessionsData?.length || 0,
				total_messages: messagesData?.length || 0,
				total_tool_executions: toolExecutionsData?.length || 0,
				total_plans: plansData?.length || 0,
				total_compressions: compressionsData?.length || 0
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
					'Updated At'
				].join(',')
			];

			// Data rows
			sessionsData?.forEach((session) => {
				csvRows.push(
					[
						session.id,
						session.users.email,
						session.status,
						session.context_type,
						session.message_count || 0,
						session.total_tokens_used || 0,
						session.tool_call_count || 0,
						session.created_at,
						session.updated_at
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
