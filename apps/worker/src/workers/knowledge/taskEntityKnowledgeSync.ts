// apps/worker/src/workers/knowledge/taskEntityKnowledgeSync.ts
//
// After a task's text is read for entities, add the people and organizations it names to the
// task owner's private knowledge graph, linked back to the task (tasker 160). Best effort:
// the task read already succeeded, so a failure here is logged, never thrown. Skipped when the
// owner can no longer open the project (removed from a shared project): other people's edits
// must not keep feeding names and contact details into their graph.

import {
	KnowledgeStore,
	planTaskEntityKnowledge,
	type KnowledgeDataClient,
	type TaskEntityRowForKnowledge
} from '@buildos/shared-agent-ops/knowledge';

export async function syncTaskEntitiesToKnowledge(
	db: KnowledgeDataClient,
	input: { userId: string; projectId: string; task: { id: string; title: string } }
): Promise<{ entities: number; facts: number } | null> {
	try {
		if (!(await canOpenProject(db, input.userId, input.projectId))) return null;
		const { data, error } = await db
			.from('onto_task_entities')
			.select('id, kind, natural_key, value, display, role, about, quote, status')
			.eq('task_id', input.task.id);
		if (error) throw new Error(error.message);
		const batch = planTaskEntityKnowledge(
			input.task,
			(data ?? []) as TaskEntityRowForKnowledge[]
		);
		if (!batch.entities.length) return { entities: 0, facts: 0 };
		const receipt = await new KnowledgeStore(db, input.userId).record(batch, { via: 'task' });
		return { entities: receipt.entities.length, facts: receipt.facts.added };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[knowledge] task entity sync failed', input.task.id, message);
		return null;
	}
}

/** The user created the project or is a current member of it. */
async function canOpenProject(
	db: KnowledgeDataClient,
	userId: string,
	projectId: string
): Promise<boolean> {
	const { data: actor, error } = await db
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!actor?.id) return false;
	const [project, member] = await Promise.all([
		db
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.eq('created_by', actor.id)
			.is('deleted_at', null)
			.maybeSingle(),
		db
			.from('onto_project_members')
			.select('project_id')
			.eq('project_id', projectId)
			.eq('actor_id', actor.id)
			.is('removed_at', null)
			.maybeSingle()
	]);
	if (project.error) throw new Error(project.error.message);
	if (member.error) throw new Error(member.error.message);
	return Boolean(project.data || member.data);
}
