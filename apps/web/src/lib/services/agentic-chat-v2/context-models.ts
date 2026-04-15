// apps/web/src/lib/services/agentic-chat-v2/context-models.ts
import type { Database } from '@buildos/shared-types';
import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';

export type DocMetaSummary = {
	title?: string | null;
	description?: string | null;
};

export type DocStructureNodeSummary = {
	id: string;
	type?: DocTreeNode['type'];
	order: number;
	title?: string | null;
	description?: string | null;
	children?: DocStructureNodeSummary[];
};

export type DocStructureSummary = {
	version: number;
	root: DocStructureNodeSummary[];
};

export type LightProject = {
	id: string;
	name: string;
	state_key: Database['public']['Tables']['onto_projects']['Row']['state_key'];
	description: string | null;
	start_at: string | null;
	end_at: string | null;
	next_step_short: string | null;
	updated_at: string;
	doc_structure?: DocStructureSummary | null;
};

export type LightGoal = {
	id: string;
	name: string;
	description: string | null;
	state_key: string | null;
	target_date: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type LightMilestone = {
	id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	due_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type LightPlan = {
	id: string;
	name: string;
	description: string | null;
	state_key: string | null;
	task_count: number | null;
	completed_task_count: number | null;
	updated_at: string | null;
};

export type LightTask = {
	id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	priority: number | null;
	start_at: string | null;
	due_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type LightDocument = {
	id: string;
	title: string;
	state_key: string | null;
	created_at: string | null;
	updated_at: string | null;
	in_doc_structure: boolean;
	is_unlinked: boolean;
};

export type LightEvent = {
	id: string;
	title: string;
	description: string | null;
	state_key: string;
	start_at: string;
	end_at: string | null;
	all_day: boolean;
	location: string | null;
	updated_at: string;
};

export type FastChatEventWindow = {
	timezone: 'UTC';
	now_at: string;
	start_at: string;
	end_at: string;
	past_days: number;
	future_days: number;
};

export type FastChatWorkSignal = {
	kind: 'task' | 'milestone' | 'goal' | 'event' | 'project';
	id: string;
	project_id: string;
	project_name: string | null;
	title: string;
	state_key: string | null;
	date_kind: 'due_at' | 'target_date' | 'start_at' | 'end_at';
	date: string;
	bucket: 'overdue' | 'due_soon' | 'upcoming';
	days_delta: number;
	priority?: number | null;
	updated_at?: string | null;
};

export type FastChatRecentChange = {
	kind: string;
	id: string;
	project_id: string;
	project_name: string | null;
	title: string | null;
	action: 'created' | 'updated' | string;
	changed_at: string;
};

export type FastChatProjectSignalSummary = {
	project_id: string;
	project_name: string;
	state_key: string | null;
	next_step_short: string | null;
	updated_at: string | null;
	counts: {
		overdue: number;
		due_soon: number;
		upcoming: number;
		recent_changes: number;
	};
};

export type FastChatProjectIntelligence = {
	generated_at: string;
	scope: 'global' | 'project';
	project_id: string | null;
	project_name: string | null;
	timezone: 'UTC';
	windows: {
		due_soon_days: number;
		upcoming_days: number;
		recent_changes_days: number;
		recent_changes_max_lookback_days: number;
	};
	counts: {
		accessible_projects?: number;
		projects_returned?: number;
		overdue_total: number;
		due_soon_total: number;
		upcoming_total: number;
		recent_change_total: number;
	};
	overdue_or_due_soon: FastChatWorkSignal[];
	upcoming_work: FastChatWorkSignal[];
	recent_changes: FastChatRecentChange[];
	project_summaries: FastChatProjectSignalSummary[];
	limits: {
		overdue_or_due_soon: number;
		upcoming_work: number;
		recent_changes: number;
		project_summaries: number;
	};
	maybe_more: {
		overdue_or_due_soon: boolean;
		upcoming_work: boolean;
		recent_changes: boolean;
		project_summaries: boolean;
	};
	source: 'load_fastchat_context' | 'fallback';
};

export type EntityScopeMeta = {
	returned: number;
	total_matching: number;
	limit: number | null;
	is_complete: boolean;
	selection_strategy: string;
	filters?: Record<string, unknown>;
};

export type DocumentScopeMeta = EntityScopeMeta & {
	unlinked_total: number;
	linked_total: number;
};

export type ProjectContextMeta = {
	generated_at: string;
	source: 'rpc' | 'fallback';
	cache_age_seconds?: number;
	entity_scopes: {
		goals: EntityScopeMeta;
		milestones: EntityScopeMeta;
		plans: EntityScopeMeta;
		tasks: EntityScopeMeta;
		events: EntityScopeMeta;
		documents: DocumentScopeMeta;
	};
};

export type LightProjectMember = {
	id: string;
	actor_id: string;
	actor_name: string | null;
	actor_email: string | null;
	role_key: string;
	access: string;
	role_name: string | null;
	role_description: string | null;
	created_at: string | null;
};

export type LightRecentActivity = {
	entity_type: string;
	entity_id: string;
	title?: string | null;
	action: 'created' | 'updated';
	updated_at: string;
};

export type GlobalContextProjectBundle = {
	project: LightProject;
	recent_activity: LightRecentActivity[];
	goals: LightGoal[];
	milestones: LightMilestone[];
	plans: LightPlan[];
};

export type LinkedEdge = {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
};

export type GlobalContextData = {
	projects: GlobalContextProjectBundle[];
	project_intelligence?: FastChatProjectIntelligence;
	context_meta?: {
		generated_at: string;
		source: 'rpc' | 'fallback';
		cache_age_seconds?: number;
		project_count: number;
		projects_returned: number;
		project_limit: number | null;
		includes_doc_structure: boolean;
		recent_activity_window_days: number;
		recent_activity_max_lookback_days: number;
		entity_limits_per_project: {
			recent_activity: number | null;
			goals: number | null;
			milestones: number | null;
			plans: number | null;
		};
	};
};

export type ProjectContextData = {
	project: LightProject;
	doc_structure: DocStructureSummary | null;
	goals: LightGoal[];
	milestones: LightMilestone[];
	plans: LightPlan[];
	tasks: LightTask[];
	documents: LightDocument[];
	events: LightEvent[];
	events_window: FastChatEventWindow;
	members: LightProjectMember[];
	project_intelligence?: FastChatProjectIntelligence;
	context_meta: ProjectContextMeta;
};

export type EntityContextData = ProjectContextData & {
	focus_entity_type: string;
	focus_entity_id: string;
	focus_entity_full: Record<string, unknown>;
	linked_entities: Record<string, Array<Record<string, unknown>>>;
	linked_edges?: LinkedEdge[];
};

export type DailyBriefMentionedEntity = {
	id?: string;
	entity_kind: string;
	entity_id: string;
	project_id?: string | null;
	project_name?: string | null;
	role?: string | null;
	source: 'ontology_brief_entities' | 'markdown_link_fallback';
};

export type DailyBriefProjectBrief = {
	id: string;
	project_id: string;
	project_name: string | null;
	brief_content: string;
	metadata?: Record<string, unknown> | null;
	created_at?: string;
};

export type DailyBriefContextData = {
	brief_id: string;
	brief_date: string;
	executive_summary: string;
	priority_actions: string[];
	generation_status: string;
	llm_analysis?: string | null;
	metadata?: Record<string, unknown> | null;
	project_briefs: DailyBriefProjectBrief[];
	recent_changes?: Array<Record<string, unknown>>;
	calendar_events?: {
		today: Array<Record<string, unknown>>;
		upcoming: Array<Record<string, unknown>>;
	};
	mentioned_entities: DailyBriefMentionedEntity[];
	mentioned_entity_counts: Record<string, number>;
};

export function collectDocStructureIds(
	structure: DocStructure | null | undefined,
	maxDepth?: number
): string[] {
	if (!structure) return [];
	const root = structure.root ?? [];
	const ids: string[] = [];

	const walk = (nodes: DocTreeNode[], depth: number): void => {
		if (typeof maxDepth === 'number' && depth >= maxDepth) return;
		for (const node of nodes) {
			ids.push(node.id);
			if (node.children) walk(node.children, depth + 1);
		}
	};

	walk(root, 0);
	return ids;
}

export function buildDocStructureSummary(
	structure: DocStructure | null | undefined,
	docMetaById: Record<string, DocMetaSummary> = {},
	maxDepth?: number
): DocStructureSummary | null {
	if (!structure) return null;
	const root = structure.root ?? [];

	const walk = (nodes: DocTreeNode[], depth: number): DocStructureNodeSummary[] => {
		if (typeof maxDepth === 'number' && depth >= maxDepth) return [];
		return nodes.map((node) => {
			const meta = docMetaById[node.id];
			return {
				id: node.id,
				type: node.type,
				order: node.order,
				title: node.title ?? meta?.title ?? null,
				description: node.description ?? meta?.description ?? null,
				children: node.children ? walk(node.children, depth + 1) : undefined
			};
		});
	};

	return {
		version: structure.version ?? 1,
		root: walk(root, 0)
	};
}
