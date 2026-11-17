// apps/web/src/routes/api/knowledge/lookup/+server.ts
/**
 * GET /api/knowledge/lookup?name=Kyle%20Kulinski&kind=person&task_id=<task>
 * The knowledge entry a task's entity card refers to: the entry linked to that task with the
 * same name, else the caller's entry with exactly that name. { entity_id: string | null }.
 */
import type { RequestHandler } from './$types';
import { normalizeKnowledgeName } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

const KINDS = ['person', 'org', 'place'] as const;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const name = (url.searchParams.get('name') ?? '').trim();
	const kind = url.searchParams.get('kind') ?? '';
	const taskId = url.searchParams.get('task_id') ?? '';
	if (!name || name.length > 300) return ApiResponse.badRequest('Invalid name');
	if (!(KINDS as readonly string[]).includes(kind)) return ApiResponse.badRequest('Invalid kind');
	const wanted = normalizeKnowledgeName(name);

	try {
		const store = knowledgeStoreFor(locals.supabase, user.id);
		if (UUID_PATTERN.test(taskId)) {
			const { data } = await knowledgeDb(locals.supabase)
				.from('knowledge_record_links')
				.select('entity_id')
				.eq('owner_user_id', user.id)
				.eq('record_kind', 'task')
				.eq('record_id', taskId);
			const ids = ((data ?? []) as Array<{ entity_id: string }>).map((r) => r.entity_id);
			const linked = await store.getSummaries(ids);
			const hit = [...linked.values()].find((e) => normalizeKnowledgeName(e.name) === wanted);
			if (hit) return ApiResponse.success({ entity_id: hit.id });
		}
		const hits = await store.search(name, {
			kinds: [kind as (typeof KINDS)[number]],
			limit: 5
		});
		const exact = hits.find((h) => normalizeKnowledgeName(h.name) === wanted);
		return ApiResponse.success({ entity_id: exact?.id ?? null });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not look that up');
	}
};
