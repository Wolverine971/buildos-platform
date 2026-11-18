// apps/worker/src/workers/knowledge/taskEntityKnowledgeSync.ts
//
// After a task's text is read for entities, add the people and organizations it names to the
// task owner's private knowledge graph, linked back to the task (tasker 160), then bring the
// task's mentions in step with the new text (tasker 167): tags follow moved names, a corrected
// spelling folds the old entry into the new one (or asks "same person?"), a deleted name loses
// its tag and its reader-made link, and an entry a reader made that has nothing left is hidden.
// Best effort: the task read already succeeded, so a failure here is logged, never thrown.
// Skipped when the owner can no longer open the project (removed from a shared project): other
// people's edits must not keep feeding names and contact details into their graph. Names the
// owner hid in their knowledge ("not a thing") are never filed again. No model calls here.

import {
	type KnowledgeDataClient,
	KnowledgeStore,
	type MentionReaderName,
	type MentionSyncReport,
	type TaskEntityRowForKnowledge,
	normalizeKnowledgeName,
	planTaskEntityKnowledge,
	reviveOrphanEntries,
	syncRecordMentions,
	withoutTaskEntityRefs
} from '@buildos/shared-agent-ops/knowledge';

export type TaskKnowledgeSyncResult = {
	entities: number;
	facts: number;
	mentions: MentionSyncReport['counts'] | null;
};

export async function syncTaskEntitiesToKnowledge(
	db: KnowledgeDataClient,
	input: {
		userId: string;
		projectId: string;
		task: { id: string; title: string; description: string | null };
		/** Rows this edit added (tasker 168: a name goes to whoever typed it). */
		newRowIds?: string[];
	}
): Promise<TaskKnowledgeSyncResult | null> {
	try {
		if (!(await canOpenProject(db, input.userId, input.projectId))) return null;
		const { data, error } = await db
			.from('onto_task_entities')
			.select('id, kind, natural_key, value, display, role, about, quote, status')
			.eq('task_id', input.task.id);
		if (error) throw new Error(error.message);
		const rows = (data ?? []) as TaskEntityRowForKnowledge[];
		const planned = planTaskEntityKnowledge(input.task, rows, {
			onlyRowIds: await editorRowIds(db, input, rows)
		});
		// Entries hidden only because they lost their last mention come back with the name.
		await reviveOrphanEntries(db, input.userId, planned.entities);
		const batch = withoutTaskEntityRefs(
			planned,
			await hiddenRefs(db, input.userId, planned.entities)
		);
		let entities = 0;
		let facts = 0;
		const reader: MentionReaderName[] = [];
		if (batch.entities.length) {
			const receipt = await new KnowledgeStore(db, input.userId).record(batch, {
				via: 'task'
			});
			entities = receipt.entities.length;
			facts = receipt.facts.added;
			const rowById = new Map(rows.map((row) => [`t${row.id}`, row]));
			for (const filed of receipt.entities) {
				const row = rowById.get(filed.ref);
				if (!row) continue;
				reader.push({
					entityId: filed.id,
					kind: filed.kind,
					names: taskRowNames(row)
				});
			}
		}
		const mentions = await syncTaskMentions(db, input, reader);
		return { entities, facts, mentions };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[knowledge] task entity sync failed', input.task.id, message);
		return null;
	}
}

/**
 * Which names a writer files (tasker 168, "the name goes to whoever types it"). The task's
 * creator files every name in it, as before. Anyone else editing it (a collaborator) files only
 * the names their edit added, plus the ones already in their own People from this task, so
 * editing one word of someone else's task never copies all of their names. Undefined = all.
 */
export async function editorRowIds(
	db: KnowledgeDataClient,
	input: { userId: string; task: { id: string }; newRowIds?: string[] },
	rows: Array<
		Pick<TaskEntityRowForKnowledge, 'id' | 'display' | 'value' | 'natural_key' | 'quote'>
	>
): Promise<string[] | undefined> {
	const { data: task } = await db
		.from('onto_tasks')
		.select('created_by')
		.eq('id', input.task.id)
		.maybeSingle();
	const createdBy = (task as { created_by: string | null } | null)?.created_by;
	if (!createdBy) return undefined;
	const { data: creator } = await db
		.from('onto_actors')
		.select('user_id')
		.eq('id', createdBy)
		.maybeSingle();
	if ((creator as { user_id: string | null } | null)?.user_id === input.userId) return undefined;

	const { data: links } = await db
		.from('knowledge_record_links')
		.select('entity:knowledge_entities(name)')
		.eq('owner_user_id', input.userId)
		.eq('record_kind', 'task')
		.eq('record_id', input.task.id);
	const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
	const mine = new Set(
		((links ?? []) as Array<{ entity: { name: string } | null }>)
			.map((link) => link.entity?.name)
			.filter((name): name is string => Boolean(name))
			.map(norm)
	);
	const fresh = new Set(input.newRowIds ?? []);
	return rows
		.filter(
			(row) => fresh.has(row.id) || taskRowNames(row).some((name) => mine.has(norm(name)))
		)
		.map((row) => row.id);
}

/** The words a task entity row may appear as in the text: its label, value and a short quote. */
export function taskRowNames(
	row: Pick<TaskEntityRowForKnowledge, 'display' | 'value' | 'natural_key' | 'quote'>
): string[] {
	const names = [row.display, row.value, row.natural_key].filter(
		(name): name is string => typeof name === 'string' && name.trim().length > 1
	);
	// A quote short enough to be the name as written ("Bruce P."), never a sentence.
	if (row.quote && row.quote.trim().length <= 40 && !row.quote.includes('\n'))
		names.push(row.quote.trim());
	return names;
}

async function syncTaskMentions(
	db: KnowledgeDataClient,
	input: { userId: string; task: { id: string; title: string; description: string | null } },
	reader: MentionReaderName[]
): Promise<MentionSyncReport['counts'] | null> {
	try {
		const report = await syncRecordMentions(
			db,
			input.userId,
			{
				record: {
					kind: 'task',
					id: input.task.id,
					title: input.task.title,
					projectId: null
				},
				fields: {
					title: input.task.title ?? '',
					description: input.task.description ?? ''
				},
				reader,
				readerComplete: true
			},
			{ via: 'task' }
		);
		return report.counts;
	} catch (error) {
		// Before migration 20261118200000 the mentions table doesn't exist: links still sync.
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[knowledge] task mention sync failed', input.task.id, message);
		return null;
	}
}

/** Batch refs whose name and kind the owner already has as a hidden entry. */
async function hiddenRefs(
	db: KnowledgeDataClient,
	userId: string,
	entities: Array<{ ref: string; kind?: string; name?: string }>
): Promise<Set<string>> {
	const named = entities.filter((e) => e.name && e.kind);
	if (!named.length) return new Set();
	const { data, error } = await db
		.from('knowledge_entities')
		.select('kind, normalized_name')
		.eq('owner_user_id', userId)
		.eq('status', 'hidden')
		.in('normalized_name', [...new Set(named.map((e) => normalizeKnowledgeName(e.name!)))]);
	if (error) throw new Error(error.message);
	const hidden = new Set(
		((data ?? []) as Array<{ kind: string; normalized_name: string }>).map(
			(row) => `${row.kind}|${row.normalized_name}`
		)
	);
	return new Set(
		named
			.filter((e) => hidden.has(`${e.kind}|${normalizeKnowledgeName(e.name!)}`))
			.map((e) => e.ref)
	);
}

/** The user created the project or is a current member of it. */
export async function canOpenProject(
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
