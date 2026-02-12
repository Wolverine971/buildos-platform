// apps/web/src/lib/types/dashboard-analytics.ts
/**
 * User dashboard analytics payload shared by server load + dashboard UI.
 */

export interface DashboardSnapshot {
	totalProjects: number;
	activeProjects: number;
	totalTasks: number;
	totalGoals: number;
	totalDocuments: number;
	tasksUpdated24h: number;
	tasksUpdated7d: number;
	documentsUpdated24h: number;
	documentsUpdated7d: number;
	goalsUpdated24h: number;
	goalsUpdated7d: number;
	chatSessions24h: number;
	chatSessions7d: number;
}

export interface DashboardAttention {
	overdueTasks: number;
	staleProjects7d: number;
	staleProjects30d: number;
}

export interface DashboardProjectActivity {
	id: string;
	name: string;
	description: string | null;
	state_key: string;
	is_shared: boolean;
	updated_at: string;
	task_count: number;
	goal_count: number;
	document_count: number;
}

export interface DashboardTaskActivity {
	id: string;
	project_id: string;
	project_name: string;
	title: string;
	description: string | null;
	state_key: string;
	due_at: string | null;
	updated_at: string;
}

export interface DashboardDocumentActivity {
	id: string;
	project_id: string;
	project_name: string;
	title: string;
	description: string | null;
	state_key: string;
	updated_at: string;
}

export interface DashboardGoalActivity {
	id: string;
	project_id: string;
	project_name: string;
	name: string;
	description: string | null;
	state_key: string;
	target_date: string | null;
	updated_at: string;
}

export interface DashboardChatSessionActivity {
	id: string;
	title: string;
	summary: string | null;
	status: string;
	context_type: string | null;
	entity_id: string | null;
	context_label: string;
	project_id: string | null;
	project_name: string | null;
	message_count: number;
	last_activity_at: string;
}

export interface UserDashboardAnalytics {
	snapshot: DashboardSnapshot;
	attention: DashboardAttention;
	recent: {
		projects: DashboardProjectActivity[];
		tasks: DashboardTaskActivity[];
		documents: DashboardDocumentActivity[];
		goals: DashboardGoalActivity[];
		chatSessions: DashboardChatSessionActivity[];
	};
}

export function createEmptyUserDashboardAnalytics(): UserDashboardAnalytics {
	return {
		snapshot: {
			totalProjects: 0,
			activeProjects: 0,
			totalTasks: 0,
			totalGoals: 0,
			totalDocuments: 0,
			tasksUpdated24h: 0,
			tasksUpdated7d: 0,
			documentsUpdated24h: 0,
			documentsUpdated7d: 0,
			goalsUpdated24h: 0,
			goalsUpdated7d: 0,
			chatSessions24h: 0,
			chatSessions7d: 0
		},
		attention: {
			overdueTasks: 0,
			staleProjects7d: 0,
			staleProjects30d: 0
		},
		recent: {
			projects: [],
			tasks: [],
			documents: [],
			goals: [],
			chatSessions: []
		}
	};
}
