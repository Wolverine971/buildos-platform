// apps/web/src/lib/services/agentic-chat-v2/context-models.ts
import type { Database } from '@buildos/shared-types';
import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';

export type LightProject = {
	id: string;
	name: string;
	state_key: Database['public']['Tables']['onto_projects']['Row']['state_key'];
	type_key: string;
	description: string | null;
	start_at: string | null;
	end_at: string | null;
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	next_step_short: string | null;
	updated_at: string;
	doc_structure?: DocStructure | null;
};

export type LightGoal = {
	id: string;
	name: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	target_date: string | null;
	progress_percent: number | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type LightMilestone = {
	id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	due_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type LightPlan = {
	id: string;
	name: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	task_count: number | null;
	completed_task_count: number | null;
	updated_at: string | null;
};

export type LightTask = {
	id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	priority: number | null;
	start_at: string | null;
	due_at: string | null;
	completed_at: string | null;
	plan_ids?: string[] | null;
	goal_ids?: string[] | null;
	updated_at: string | null;
};

export type LightEvent = {
	id: string;
	title: string;
	description: string | null;
	state_key: string;
	type_key: string;
	start_at: string;
	end_at: string | null;
	all_day: boolean;
	location: string | null;
	updated_at: string;
};

export type LightDocumentMeta = {
	id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	updated_at: string | null;
};

export type LightRecentActivity = {
	entity_type: string;
	entity_id: string;
	title?: string | null;
	action: 'created' | 'updated';
	updated_at: string;
};

export type LinkedEdge = {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
};

export type GlobalContextData = {
	projects: LightProject[];
	project_recent_activity: Record<string, LightRecentActivity[]>;
	project_goals: Record<string, LightGoal[]>;
	project_milestones: Record<string, LightMilestone[]>;
	project_plans: Record<string, LightPlan[]>;
};

export type ProjectContextData = {
	project: LightProject;
	doc_structure: DocStructure | null;
	goals: LightGoal[];
	milestones: LightMilestone[];
	plans: LightPlan[];
	tasks: LightTask[];
	events: LightEvent[];
	documents?: LightDocumentMeta[];
};

export type EntityContextData = ProjectContextData & {
	focus_entity_type: string;
	focus_entity_id: string;
	focus_entity_full: Record<string, unknown>;
	linked_entities: Record<string, Array<Record<string, unknown>>>;
	linked_edges?: LinkedEdge[];
};

export function truncateDocStructure(
	structure: DocStructure | null | undefined,
	maxDepth = 2
): DocStructure | null {
	if (!structure) return null;
	const root = structure.root ?? [];

	const walk = (nodes: DocTreeNode[], depth: number): DocTreeNode[] => {
		if (depth >= maxDepth) return [];
		return nodes.map((node) => ({
			id: node.id,
			type: node.type,
			order: node.order,
			children: node.children ? walk(node.children, depth + 1) : undefined
		}));
	};

	return {
		version: structure.version ?? 1,
		root: walk(root, 0)
	};
}
