/** Read-only task dependency impact, returned by onto_task_affected_work. */
export interface AffectedTaskPathEntry {
	task_id: string;
	title: string;
}

export interface AffectedTask {
	id: string;
	title: string;
	state_key: string;
	due_at: string | null;
	distance: number;
	/** One shortest path, including the selected task and this result. */
	path: AffectedTaskPathEntry[];
	edge_ids: string[];
	relations: string[];
}

export interface TaskAffectedWorkPayload {
	source_task: { id: string; title: string; project_id: string };
	tasks: AffectedTask[];
	limits: { max_depth: number; max_tasks: number };
	truncated: boolean;
	truncation_reasons: Array<'depth' | 'tasks'>;
}
