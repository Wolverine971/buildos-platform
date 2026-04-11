// apps/web/src/routes/api/admin/security/logs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession }, url }) => {
	try {
		const { user } = await safeGetSession();

		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('is_admin')
			.eq('id', user.id)
			.single();

		if (userError || !userData?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse query parameters
		const source = url.searchParams.get('source') || 'events';
		const eventType = url.searchParams.get('eventType') || 'all';
		const category = url.searchParams.get('category') || 'all';
		const outcome = url.searchParams.get('outcome') || 'all';
		const severity = url.searchParams.get('severity') || 'all';
		const wasBlocked = url.searchParams.get('wasBlocked') || 'all';
		const dateFilter = url.searchParams.get('dateFilter') || '7days';
		const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
		const limit = Math.min(
			Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1),
			100
		);

		// Build date filter
		let dateThreshold: string | null = null;
		const now = new Date();
		switch (dateFilter) {
			case '24hours':
				dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
				break;
			case '7days':
				dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
				break;
			case '30days':
				dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
				break;
			case 'all':
			default:
				dateThreshold = null;
		}

		const adminSupabase = createAdminSupabaseClient();

		if (source === 'legacy') {
			let query = adminSupabase
				.from('security_logs')
				.select(
					'id,created_at,event_type,user_id,was_blocked,regex_patterns,llm_validation,metadata,ip_address,user_agent',
					{ count: 'exact' }
				)
				.order('created_at', { ascending: false });

			if (eventType !== 'all') {
				query = query.eq('event_type', eventType);
			}

			if (wasBlocked === 'true') {
				query = query.eq('was_blocked', true);
			} else if (wasBlocked === 'false') {
				query = query.eq('was_blocked', false);
			}

			if (dateThreshold) {
				query = query.gte('created_at', dateThreshold);
			}

			const offset = (page - 1) * limit;
			query = query.range(offset, offset + limit - 1);

			const { data: logs, error, count } = await query;

			if (error) {
				console.error('Error fetching legacy security logs:', error);
				return ApiResponse.internalError(error);
			}

			return ApiResponse.success({
				source: 'security_logs',
				logs: logs || [],
				pagination: {
					page,
					limit,
					total: count || 0,
					totalPages: Math.ceil((count || 0) / limit)
				}
			});
		}

		let query = (adminSupabase as any)
			.from('security_events')
			.select(
				'id,created_at,event_type,category,outcome,severity,actor_type,actor_user_id,external_agent_caller_id,target_type,target_id,request_id,session_id,ip_address,risk_score,reason,metadata',
				{ count: 'exact' }
			)
			.order('created_at', { ascending: false });

		if (eventType !== 'all') {
			query = query.eq('event_type', eventType);
		}

		if (category !== 'all') {
			query = query.eq('category', category);
		}

		if (outcome !== 'all') {
			query = query.eq('outcome', outcome);
		}

		if (severity !== 'all') {
			query = query.eq('severity', severity);
		}

		if (dateThreshold) {
			query = query.gte('created_at', dateThreshold);
		}

		const offset = (page - 1) * limit;
		query = query.range(offset, offset + limit - 1);

		const { data: logs, error, count } = await query;

		if (error) {
			console.error('Error fetching security events:', error);
			return ApiResponse.internalError(error);
		}

		return ApiResponse.success({
			source: 'security_events',
			logs: logs || [],
			pagination: {
				page,
				limit,
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		console.error('Error in security logs API:', error);
		return ApiResponse.internalError(error);
	}
};
