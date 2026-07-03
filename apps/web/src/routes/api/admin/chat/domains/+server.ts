// apps/web/src/routes/api/admin/chat/domains/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildDomainDemandAnalytics,
	type DomainDemandSessionRow
} from '$lib/services/admin/domain-demand-analytics';

type Timeframe = '24h' | '7d' | '30d';

const MAX_SESSION_ROWS = 5000;

function parseTimeframe(value: string | null): Timeframe {
	if (value === '24h' || value === '7d' || value === '30d') return value;
	return '7d';
}

function calcStartDate(timeframe: Timeframe, now: Date): Date {
	switch (timeframe) {
		case '24h':
			return new Date(now.getTime() - 24 * 60 * 60 * 1000);
		case '30d':
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		case '7d':
		default:
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}
}

function parseLimit(value: string | null): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return MAX_SESSION_ROWS;
	return Math.min(parsed, MAX_SESSION_ROWS);
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframe = parseTimeframe(url.searchParams.get('timeframe'));
	const limit = parseLimit(url.searchParams.get('limit'));
	const now = new Date();
	const startDate = calcStartDate(timeframe, now);

	try {
		const adminSupabase = createAdminSupabaseClient();
		const { data, error } = await adminSupabase
			.from('chat_sessions')
			.select('id, user_id, created_at, updated_at, agent_metadata')
			.gte('updated_at', startDate.toISOString())
			.lte('updated_at', now.toISOString())
			.order('updated_at', { ascending: false })
			.range(0, limit - 1);

		if (error) throw error;

		return ApiResponse.success(
			buildDomainDemandAnalytics((data ?? []) as DomainDemandSessionRow[], {
				now,
				startDate: startDate.toISOString(),
				endDate: now.toISOString()
			})
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load domain demand analytics');
	}
};
