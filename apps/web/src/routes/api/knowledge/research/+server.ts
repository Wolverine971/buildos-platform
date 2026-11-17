// apps/web/src/routes/api/knowledge/research/+server.ts
/**
 * GET /api/knowledge/research
 * The research tray in one call (tasker 164): the caller's unfinished "Find more" runs plus the
 * ones from the last 12 hours, each with its entries, and today's allowance. Two reads with the
 * caller's own client (RLS: owners read their runs and targets). The tray polls this every few
 * seconds only while something is running.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb } from '$lib/server/knowledge/knowledge.server';
import {
	shapeResearchTray,
	TRAY_WINDOW_MS,
	utcDayStart,
	type RawResearchRun
} from '$lib/components/knowledge/research-tray';
import { dailyEnrichBudgetFor } from '@buildos/shared-agent-ops/knowledge';

const RUN_COLUMNS =
	'id, status, title, budget_usd, cost_usd, created_at, updated_at, finished_at, ' +
	'targets:knowledge_run_targets(id, entity_id, status, phase, summary, facts_added, cost_usd, ' +
	'error, instructions, created_at, finished_at, entity:knowledge_entities(id, name, kind))';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const db = knowledgeDb(locals.supabase);
	const now = new Date();
	const since = new Date(now.getTime() - TRAY_WINDOW_MS).toISOString();

	const [recent, today] = await Promise.all([
		db
			.from('knowledge_runs')
			.select(RUN_COLUMNS)
			.eq('owner_user_id', user.id)
			.eq('run_type', 'enrichment')
			.or(`status.in.(queued,running),created_at.gte.${since}`)
			.order('created_at', { ascending: false })
			.limit(12),
		db
			.from('knowledge_runs')
			.select('status, budget_usd, cost_usd, updated_at')
			.eq('owner_user_id', user.id)
			.eq('run_type', 'enrichment')
			.gte('created_at', utcDayStart(now).toISOString())
	]);
	if (recent.error || today.error) return ApiResponse.databaseError(recent.error ?? today.error);
	return ApiResponse.success(
		shapeResearchTray(
			(recent.data ?? []) as RawResearchRun[],
			(today.data ?? []) as RawResearchRun[],
			now,
			dailyEnrichBudgetFor(user)
		)
	);
};
