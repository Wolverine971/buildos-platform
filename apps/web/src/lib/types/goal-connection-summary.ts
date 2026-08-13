// apps/web/src/lib/types/goal-connection-summary.ts
export type GoalTaskConnectionCounts = {
	total: number;
	todo: number;
	in_progress: number;
	blocked: number;
	done: number;
};

export type GoalConnectedTaskSummary = {
	id: string;
	title: string;
	state_key: 'todo' | 'in_progress' | 'blocked' | 'done';
	due_at: string | null;
	updated_at: string | null;
};

export type GoalPlanConnectionCounts = {
	total: number;
	draft: number;
	active: number;
	completed: number;
};

export type GoalConnectedPlanSummary = {
	id: string;
	name: string;
	state_key: 'draft' | 'active' | 'completed';
	updated_at: string | null;
};

export type GoalMilestoneConnectionCounts = {
	total: number;
	pending: number;
	in_progress: number;
	completed: number;
	missed: number;
	overdue: number;
	next_due_at: string | null;
};

export type GoalConnectedMilestoneSummary = {
	id: string;
	title: string;
	state_key: 'pending' | 'in_progress' | 'completed' | 'missed';
	due_at: string | null;
	updated_at: string | null;
};

export type GoalTrackingSummary = {
	source: 'none' | 'milestones';
	completed: number;
	total: number;
	percent: number | null;
};

export type GoalConnectionSummary = {
	goal_id: string;
	created_at: string;
	updated_at: string | null;
	last_activity_at: string;
	tasks: GoalTaskConnectionCounts & { items: GoalConnectedTaskSummary[] };
	plans: GoalPlanConnectionCounts & { items: GoalConnectedPlanSummary[] };
	milestones: GoalMilestoneConnectionCounts & { items: GoalConnectedMilestoneSummary[] };
	tracking: GoalTrackingSummary;
};

export type ProjectGoalConnectionOverview = {
	project_id: string;
	goals: GoalConnectionSummary[];
	tasks: {
		total: number;
		connected: number;
		project_level: number;
	};
};
