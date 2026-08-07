// apps/web/src/routes/api/onto/tasks/task-linked-helpers.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	resolveTaskLinkedEntities,
	type TaskLinkedEntitiesResult,
	type TaskLinkedEntity
} from '@buildos/agentic-chat-runtime/tools';

export type LinkedEntity = TaskLinkedEntity;
export type LinkedEntitiesResult = TaskLinkedEntitiesResult;

/** Compatibility wrapper for the UI's full-task endpoint. */
export function resolveLinkedEntities(
	supabase: SupabaseClient,
	taskId: string,
	projectId: string
): Promise<LinkedEntitiesResult> {
	return resolveTaskLinkedEntities(supabase as never, { taskId, projectId });
}

export function hasLinkedEntities(linked: LinkedEntitiesResult): boolean {
	return (
		linked.plans.length > 0 ||
		linked.goals.length > 0 ||
		linked.milestones.length > 0 ||
		linked.documents.length > 0 ||
		linked.dependentTasks.length > 0
	);
}
