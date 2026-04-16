// apps/web/src/routes/api/onto/graph/workspace-graph-counts.ts
import type { SupabaseClient } from '@supabase/supabase-js';

import type { GraphScopeFilterKey } from '$lib/components/ontology/graph/lib/graph.filters';
import type { GraphScopeCountTotals } from './workspace-graph-limit';

type CountQueryResult = {
	count: number | null;
	error: { message?: string } | null;
};

function applyProjectScope(query: any, projectIds: string[]) {
	if (projectIds.length === 1) {
		return query.eq('project_id', projectIds[0]);
	}
	return query.in('project_id', projectIds);
}

async function loadCount(
	countKey: GraphScopeFilterKey,
	query: PromiseLike<CountQueryResult>
): Promise<[GraphScopeFilterKey, number] | null> {
	const { count, error } = await query;
	if (error) {
		console.warn(`[Ontology Graph API] Failed to load ${countKey} count`, error.message);
		return null;
	}
	return [countKey, count ?? 0];
}

export async function loadGraphScopeCountTotals(
	supabase: SupabaseClient,
	projectIds: string[]
): Promise<GraphScopeCountTotals> {
	if (projectIds.length === 0) return {};

	const doneTaskQuery = applyProjectScope(
		supabase
			.from('onto_tasks')
			.select('id', { count: 'exact', head: true })
			.is('deleted_at', null),
		projectIds
	).or('state_key.eq.done,completed_at.not.is.null');

	const results = await Promise.all([loadCount('showDoneTasks', doneTaskQuery)]);

	return Object.fromEntries(results.filter(Boolean) as Array<[GraphScopeFilterKey, number]>);
}
