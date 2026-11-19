// apps/web/src/routes/api/knowledge/project-people/+server.ts
/**
 * GET /api/knowledge/project-people?project_id=<uuid> → the People tab on a project (tasker 168):
 * everyone this project's tasks and docs name, and who knows them.
 * { mine:   your own entries linked to this project's tasks/docs (person/org/place, active),
 *           [{ id, kind, name, summary, records }],
 *   others: in a project other people are in, what their People hold about names here
 *           (the lens across up to 100 recent tasks and 100 recent docs), LensEntry[],
 *   shared: whether anyone else is in the project }
 * Reads go through the caller's client (RLS + the lens function's membership check).
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import {
	loadProjectLens,
	projectHasOtherMembers,
	sharingErrorResponse,
	type LensEntry
} from '$lib/server/knowledge/sharing.server';

const KINDS = new Set(['person', 'org', 'place']);

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const projectId = url.searchParams.get('project_id') ?? '';
	if (!UUID_PATTERN.test(projectId)) return ApiResponse.badRequest('Invalid project');
	const db = locals.supabase as any;

	try {
		const [tasks, docs, shared] = await Promise.all([
			db
				.from('onto_tasks')
				.select('id')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(100),
			db
				.from('onto_documents')
				.select('id')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(100),
			projectHasOtherMembers(locals.supabase, projectId, user.id)
		]);
		if (tasks.error || docs.error) throw new Error('Could not read the project');
		const taskIds = ((tasks.data ?? []) as Array<{ id: string }>).map((r) => r.id);
		const docIds = ((docs.data ?? []) as Array<{ id: string }>).map((r) => r.id);
		const recordIds = [...taskIds, ...docIds];
		if (!recordIds.length) return ApiResponse.success({ mine: [], others: [], shared });

		const [links, taskLens, docLens] = await Promise.all([
			db
				.from('knowledge_record_links')
				.select('record_id, entity:knowledge_entities(id, kind, name, summary, status)')
				.eq('owner_user_id', user.id)
				.in('record_kind', ['task', 'document'])
				.in('record_id', recordIds)
				.limit(1000),
			shared && taskIds.length
				? loadProjectLens(locals.supabase, {
						projectId,
						recordKind: 'task',
						recordIds: taskIds
					})
				: Promise.resolve([] as LensEntry[]),
			shared && docIds.length
				? loadProjectLens(locals.supabase, {
						projectId,
						recordKind: 'document',
						recordIds: docIds
					})
				: Promise.resolve([] as LensEntry[])
		]);
		if (links.error) throw new Error(links.error.message);

		const mine = new Map<
			string,
			{ id: string; kind: string; name: string; summary: string | null; records: number }
		>();
		for (const link of (links.data ?? []) as Array<{
			entity: {
				id: string;
				kind: string;
				name: string;
				summary: string | null;
				status: string;
			} | null;
		}>) {
			const e = link.entity;
			if (!e || e.status !== 'active' || !KINDS.has(e.kind)) continue;
			const row = mine.get(e.id) ?? {
				id: e.id,
				kind: e.kind,
				name: e.name,
				summary: e.summary,
				records: 0
			};
			row.records += 1;
			mine.set(e.id, row);
		}
		// One lens entry per owner entry: tasks and docs merged.
		const others = new Map<string, LensEntry>();
		for (const entry of [...taskLens, ...docLens]) {
			const seen = others.get(entry.entity.id);
			if (!seen) others.set(entry.entity.id, entry);
			else
				others.set(entry.entity.id, {
					...seen,
					record_ids: [...new Set([...seen.record_ids, ...entry.record_ids])]
				});
		}
		return ApiResponse.success({
			mine: [...mine.values()].sort(
				(a, b) => b.records - a.records || a.name.localeCompare(b.name)
			),
			others: [...others.values()],
			shared
		});
	} catch (error) {
		return sharingErrorResponse(
			error,
			ApiResponse,
			'Could not load the people in this project'
		);
	}
};
