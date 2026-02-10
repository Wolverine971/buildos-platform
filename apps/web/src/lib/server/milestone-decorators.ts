// apps/web/src/lib/server/milestone-decorators.ts
// Server-side helpers to attach goal mapping and computed state to milestones
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { withComputedMilestoneState } from '$lib/utils/milestone-state';

type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];
type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type GoalMilestoneEdge = Pick<
	Database['public']['Tables']['onto_edges']['Row'],
	'src_id' | 'dst_id' | 'created_at'
>;

export type DecoratedMilestone = MilestoneRow & {
	goal_id: string | null;
	effective_state_key: MilestoneRow['state_key'];
	is_missed: boolean;
};

function buildGoalMapping(edges: GoalMilestoneEdge[]): Map<string, string> {
	// Prefer the newest edge when multiple goal links exist
	const sorted = [...edges].sort((a, b) => {
		const aTime = new Date(a.created_at ?? 0).getTime();
		const bTime = new Date(b.created_at ?? 0).getTime();
		return bTime - aTime;
	});

	const map = new Map<string, string>();
	for (const edge of sorted) {
		if (!map.has(edge.dst_id)) {
			map.set(edge.dst_id, edge.src_id);
		}
	}
	return map;
}

export async function decorateMilestonesWithGoals(
	supabase: SupabaseClient<Database>,
	goals: GoalRow[] | null | undefined,
	milestones: MilestoneRow[] | null | undefined
): Promise<{ milestones: DecoratedMilestone[]; edges: GoalMilestoneEdge[] }> {
	const goalIds = (goals ?? []).map((g) => g.id).filter(Boolean);
	const milestoneIds = (milestones ?? []).map((m) => m.id).filter(Boolean);

	let edges: GoalMilestoneEdge[] = [];

	if (goalIds.length > 0 && milestoneIds.length > 0) {
		const { data: edgeData, error: edgeError } = await supabase
			.from('onto_edges')
			.select('src_id, dst_id, created_at')
			.eq('src_kind', 'goal')
			.eq('dst_kind', 'milestone')
			.eq('rel', 'has_milestone')
			.in('src_id', goalIds)
			.in('dst_id', milestoneIds);

		if (edgeError) {
			console.warn('[Milestones] Failed to load goal-milestone edges:', edgeError);
		} else {
			edges = edgeData ?? [];
		}
	}

	const goalMapping = buildGoalMapping(edges);
	const decoratedMilestones: DecoratedMilestone[] = (milestones ?? []).map((milestone) => {
		const withState = withComputedMilestoneState(milestone);
		return {
			...withState,
			goal_id: goalMapping.get(milestone.id) ?? null
		};
	});

	return { milestones: decoratedMilestones, edges };
}
