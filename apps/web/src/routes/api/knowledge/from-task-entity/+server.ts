// apps/web/src/routes/api/knowledge/from-task-entity/+server.ts
/**
 * POST /api/knowledge/from-task-entity  { task_entity_id }
 *
 * "Add to People" (or Organizations / Places) on a task card for a name that isn't in your
 * knowledge yet: files that one person, organization or place into the caller's own private
 * graph, linked to the task, with the phone/email/address the task ties to it (tasker 160).
 * Returns { entity_id }. Reads the task through the caller's client (RLS: they must be able to
 * read it) and writes only to their own graph, so a collaborator adding a name from someone
 * else's task files it for themselves, never for the task's owner.
 */
import type { RequestHandler } from './$types';
import {
	planTaskEntityKnowledge,
	type TaskEntityRowForKnowledge
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

const FILEABLE = new Set(['person', 'org', 'place']);
const ROW_COLUMNS = 'id, task_id, kind, natural_key, value, display, role, about, quote, status';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: { task_entity_id?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const rowId = typeof body.task_entity_id === 'string' ? body.task_entity_id : '';
	if (!UUID_PATTERN.test(rowId)) return ApiResponse.badRequest('Invalid task entity');

	try {
		const db = knowledgeDb(locals.supabase);
		const { data: target, error } = await db
			.from('onto_task_entities')
			.select(ROW_COLUMNS)
			.eq('id', rowId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!target) return ApiResponse.notFound('That name');
		const row = target as TaskEntityRowForKnowledge & { task_id: string };
		if (!FILEABLE.has(row.kind) || row.status === 'dismissed') {
			return ApiResponse.badRequest('Only people, organizations and places can be added');
		}

		const [rows, task] = await Promise.all([
			db.from('onto_task_entities').select(ROW_COLUMNS).eq('task_id', row.task_id),
			db.from('onto_tasks').select('id, title').eq('id', row.task_id).maybeSingle()
		]);
		if (rows.error) throw new Error(rows.error.message);
		if (task.error) throw new Error(task.error.message);
		if (!task.data) return ApiResponse.notFound('Task');

		const batch = planTaskEntityKnowledge(
			{ id: row.task_id, title: (task.data as { title: string }).title ?? '' },
			(rows.data ?? []) as TaskEntityRowForKnowledge[],
			{ onlyRowIds: [row.id], includePlaces: true }
		);
		if (!batch.entities.length) return ApiResponse.badRequest('Nothing to add for that name');

		const receipt = await knowledgeStoreFor(locals.supabase, user.id).record(batch, {
			via: 'task'
		});
		const filed = receipt.entities.find((entity) => entity.ref === `t${row.id}`);
		if (!filed) {
			return ApiResponse.badRequest(receipt.problems[0]?.message ?? 'Could not add that');
		}
		return ApiResponse.success({ entity_id: filed.id, matched: filed.matched });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not add that');
	}
};
