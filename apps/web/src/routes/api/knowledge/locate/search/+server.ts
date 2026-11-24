// apps/web/src/routes/api/knowledge/locate/search/+server.ts
/**
 * POST /api/knowledge/locate/search
 * Paid: start web research ("Find more", narrowed to website and location) for the companies
 * the free lookup could not place, up to one click's worth (75). Only for users on
 * KNOWLEDGE_LOCATE_WEB_SEARCH_USER_IDS (tasker 170: DJ's account only for now). It runs as
 * ordinary research, so today's research allowance, the per-run cap and the three-runs-at-once
 * limit all apply, and it shows in the research tray like any other.
 */
import type { RequestHandler } from './$types';
import {
	MAX_ENRICH_BATCH,
	startKnowledgeEnrichmentBatches
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { knowledgeDb, knowledgeErrorResponse } from '$lib/server/knowledge/knowledge.server';
import {
	companyWebSearchAllowed,
	leftoverOrganizations
} from '$lib/server/knowledge/company-locate.server';

/** What the search looks for: the company's own website, and where it is based. */
const SEARCH_FIELDS = ['homepage', 'located_in'];
/**
 * The most one company's search may cost. Measured research runs about $0.003 an entry on the
 * cheap search provider; this leaves room for the dearer fallback without reserving the
 * default $0.03 an entry against the day's allowance.
 */
const SEARCH_BUDGET_PER_COMPANY_USD = 0.012;

export const POST: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!companyWebSearchAllowed(user.id))
		return ApiResponse.forbidden('Web search for companies is not turned on for this account');

	try {
		const leftover = await leftoverOrganizations(knowledgeDb(locals.supabase), user.id);
		if (!leftover.length)
			return ApiResponse.success({ queued: 0, remaining: 0, refused: null });
		const batch = leftover.slice(0, MAX_ENRICH_BATCH);
		const result = await startKnowledgeEnrichmentBatches(createAdminSupabaseClient(), user.id, {
			entityIds: batch,
			fields: SEARCH_FIELDS,
			budgetUsd: Number((batch.length * SEARCH_BUDGET_PER_COMPANY_USD).toFixed(4)),
			trigger: 'ui'
		});
		const queued = result.runs.reduce((sum, run) => sum + run.targets.length, 0);
		return ApiResponse.success({
			queued,
			remaining: leftover.length - queued,
			budget_usd: Number(
				result.runs.reduce((sum, run) => sum + run.budget_usd, 0).toFixed(4)
			),
			refused: result.refused
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not start the web search');
	}
};
