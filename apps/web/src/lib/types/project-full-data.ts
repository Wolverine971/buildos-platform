// apps/web/src/lib/types/project-full-data.ts
export type ProjectEventsCoverage = {
	scope: 'all' | 'initial-window';
	complete: boolean;
	returned: number;
	recent_since?: string;
	recent_limit?: number;
	upcoming_limit?: number;
	recent_has_more?: boolean;
	upcoming_has_more?: boolean;
};

export const PROJECT_ACTIVE_TASK_BUCKET_KEYS = [
	'backlog',
	'in_progress',
	'scheduled',
	'overdue',
	'blocked',
	'done'
] as const;

export type ProjectActiveTaskBucketKey = (typeof PROJECT_ACTIVE_TASK_BUCKET_KEYS)[number];
export type ProjectTaskBoardBucketKey = ProjectActiveTaskBucketKey | 'archived';

export type ProjectTaskBucketCoverage = {
	returned: number;
	total: number;
	complete: boolean;
};

export type ProjectTasksCoverage = {
	scope: 'all' | 'initial-board';
	as_of: string;
	complete: boolean;
	returned: number;
	total: number;
	limit_per_bucket?: number;
	buckets: Record<ProjectActiveTaskBucketKey, ProjectTaskBucketCoverage>;
};
