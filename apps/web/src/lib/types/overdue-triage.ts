// apps/web/src/lib/types/overdue-triage.ts
export type LaneKey = 'assigned_collab' | 'assigned_other' | 'other';

export type TaskAssignee = {
	actor_id: string;
	name: string | null;
	email: string | null;
};

export type OverdueTask = {
	id: string;
	project_id: string;
	project_name: string;
	project_state_key: string;
	project_updated_at: string;
	title: string;
	description: string | null;
	state_key: 'todo' | 'in_progress' | 'blocked' | 'done' | string;
	due_at: string | null;
	priority: number | null;
	updated_at: string;
	is_assigned_to_me: boolean;
	project_is_shared: boolean;
	project_is_collaborative: boolean;
	assignees: TaskAssignee[];
	lane: LaneKey;
};

export type OverdueProjectBatch = {
	project_id: string;
	project_name: string;
	project_state_key: string;
	project_is_shared: boolean;
	project_is_collaborative: boolean;
	lane: LaneKey;
	overdue_count: number;
	assigned_to_me_count: number;
	oldest_due_at: string | null;
	oldest_assigned_due_at: string | null;
	project_updated_at: string;
	tasks?: OverdueTask[];
};

export type OverdueProjectBatchesPayload = {
	batches: OverdueProjectBatch[];
	totalProjects: number;
	totalTasks: number;
	nextCursor: string | null;
};
