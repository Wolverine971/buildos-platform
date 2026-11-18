// apps/web/src/routes/api/knowledge/mentions/+server.ts
/**
 * GET /api/knowledge/mentions?record_kind=document&record_id=<uuid>
 *
 * The people, organizations and places in the caller's knowledge that a document (or chat
 * session) is linked to, with the words each was read from, so the reader can turn those words
 * into names that open the knowledge card (tasker 160). Owner-only (knowledge_record_links RLS
 * plus an explicit owner filter): a collaborator reading the same doc sees only names in their
 * own graph. Hidden entries are left out; merged ones point at the entry they were merged into.
 * { mentions: Array<{ entity_id, kind, name, quote }> }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';

const RECORD_KINDS = new Set(['document', 'chat_session']);
const MENTION_KINDS = new Set(['person', 'org', 'place']);
const MAX_MENTIONS = 60;

type LinkRow = {
	quote: string | null;
	entity: {
		id: string;
		kind: string;
		name: string;
		status: string;
		merged_into_id: string | null;
	} | null;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const recordKind = url.searchParams.get('record_kind') ?? '';
	const recordId = url.searchParams.get('record_id') ?? '';
	if (!RECORD_KINDS.has(recordKind)) return ApiResponse.badRequest('Invalid record kind');
	if (!UUID_PATTERN.test(recordId)) return ApiResponse.badRequest('Invalid record id');

	const { data, error } = await knowledgeDb(locals.supabase)
		.from('knowledge_record_links')
		.select('quote, entity:knowledge_entities(id, kind, name, status, merged_into_id)')
		.eq('owner_user_id', user.id)
		.eq('record_kind', recordKind)
		.eq('record_id', recordId)
		.limit(200);
	if (error) return ApiResponse.internalError(error, 'Could not load names');

	const seen = new Set<string>();
	const mentions: Array<{ entity_id: string; kind: string; name: string; quote: string | null }> =
		[];
	for (const link of (data ?? []) as LinkRow[]) {
		const entity = link.entity;
		if (!entity || !MENTION_KINDS.has(entity.kind) || entity.status === 'hidden') continue;
		const id = entity.status === 'merged' ? entity.merged_into_id : entity.id;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		mentions.push({ entity_id: id, kind: entity.kind, name: entity.name, quote: link.quote });
		if (mentions.length >= MAX_MENTIONS) break;
	}
	return ApiResponse.success({ mentions });
};
