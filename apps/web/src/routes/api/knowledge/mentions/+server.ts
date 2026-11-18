// apps/web/src/routes/api/knowledge/mentions/+server.ts
/**
 * GET /api/knowledge/mentions?record_kind=document|task|chat_session&record_id=<uuid>
 *
 * The people, organizations and places in the caller's knowledge that a record is linked to
 * (tasker 160), and every place their names are tagged in its text (tasker 167), so the reader
 * can highlight each tag and open its knowledge card. Owner-only (RLS plus an explicit owner
 * filter): a collaborator reading the same doc sees only names in their own graph. Hidden
 * entries are left out; merged ones point at the entry they were merged into.
 * {
 *   mentions: Array<{ entity_id, kind, name, quote }>,          // one per entry (links)
 *   tags: Array<{ id, entity_id, kind, name, summary, field, text, prefix, suffix, status }>
 * }
 * Tags are where the names are (offsets are re-found client-side from text + context, since
 * the rendered page isn't the stored markdown). Before the mentions table exists: tags = [].
 * For a task or doc in a project other people are in, also `lens` (tasker 168): what the other
 * members' People hold about the names on it ({ project_id, entries }); null otherwise.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import {
	loadProjectLens,
	projectHasOtherMembers,
	type LensEntry
} from '$lib/server/knowledge/sharing.server';

const RECORD_KINDS = new Set(['document', 'task', 'chat_session']);
const MENTION_KINDS = new Set(['person', 'org', 'place']);
const MAX_MENTIONS = 60;
const MAX_TAGS = 400;

type EntityEmbed = {
	id: string;
	kind: string;
	name: string;
	summary?: string | null;
	status: string;
	merged_into_id: string | null;
} | null;

type LinkRow = { quote: string | null; entity: EntityEmbed };

type TagRow = {
	id: string;
	field: string;
	text: string;
	prefix: string;
	suffix: string;
	status: string;
	start_offset: number;
	entity: EntityEmbed;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const recordKind = url.searchParams.get('record_kind') ?? '';
	const recordId = url.searchParams.get('record_id') ?? '';
	if (!RECORD_KINDS.has(recordKind)) return ApiResponse.badRequest('Invalid record kind');
	if (!UUID_PATTERN.test(recordId)) return ApiResponse.badRequest('Invalid record id');

	const db = knowledgeDb(locals.supabase);
	const entityColumns = 'id, kind, name, summary, status, merged_into_id';
	const [links, tagRows, lens] = await Promise.all([
		db
			.from('knowledge_record_links')
			.select(`quote, entity:knowledge_entities(${entityColumns})`)
			.eq('owner_user_id', user.id)
			.eq('record_kind', recordKind)
			.eq('record_id', recordId)
			.limit(200),
		recordKind === 'chat_session'
			? Promise.resolve({ data: [], error: null })
			: db
					.from('knowledge_mentions')
					.select(
						`id, field, text, prefix, suffix, status, start_offset, entity:knowledge_entities(${entityColumns})`
					)
					.eq('owner_user_id', user.id)
					.eq('record_kind', recordKind)
					.eq('record_id', recordId)
					.order('start_offset', { ascending: true })
					.limit(MAX_TAGS),
		recordKind === 'chat_session'
			? Promise.resolve(null)
			: loadRecordLens(locals.supabase, user.id, recordKind, recordId).catch(() => null)
	]);
	if (links.error) return ApiResponse.internalError(links.error, 'Could not load names');

	// Merged entries: show the survivor (one extra read only when there are merges).
	const merged = new Set<string>();
	const all = [
		...((links.data ?? []) as LinkRow[]).map((l) => l.entity),
		...((tagRows.error ? [] : (tagRows.data ?? [])) as TagRow[]).map((t) => t.entity)
	];
	for (const entity of all)
		if (entity?.status === 'merged' && entity.merged_into_id) merged.add(entity.merged_into_id);
	const survivors = new Map<string, NonNullable<EntityEmbed>>();
	if (merged.size) {
		const { data } = await db
			.from('knowledge_entities')
			.select(entityColumns)
			.in('id', [...merged])
			.eq('owner_user_id', user.id);
		for (const row of (data ?? []) as Array<NonNullable<EntityEmbed>>)
			survivors.set(row.id, row);
	}
	const resolve = (entity: EntityEmbed) => {
		if (!entity) return null;
		const live =
			entity.status === 'merged' && entity.merged_into_id
				? survivors.get(entity.merged_into_id)
				: entity;
		if (!live || live.status !== 'active' || !MENTION_KINDS.has(live.kind)) return null;
		return live;
	};

	const seen = new Set<string>();
	const mentions: Array<{ entity_id: string; kind: string; name: string; quote: string | null }> =
		[];
	for (const link of (links.data ?? []) as LinkRow[]) {
		const entity = resolve(link.entity);
		if (!entity || seen.has(entity.id)) continue;
		seen.add(entity.id);
		mentions.push({
			entity_id: entity.id,
			kind: entity.kind,
			name: entity.name,
			quote: link.quote
		});
		if (mentions.length >= MAX_MENTIONS) break;
	}

	const tags: Array<{
		id: string;
		entity_id: string;
		kind: string;
		name: string;
		summary: string | null;
		field: string;
		text: string;
		prefix: string;
		suffix: string;
		status: string;
	}> = [];
	for (const row of (tagRows.error ? [] : (tagRows.data ?? [])) as TagRow[]) {
		const entity = resolve(row.entity);
		if (!entity) continue;
		tags.push({
			id: row.id,
			entity_id: entity.id,
			kind: entity.kind,
			name: entity.name,
			summary: entity.summary ?? null,
			field: row.field,
			text: row.text,
			prefix: row.prefix,
			suffix: row.suffix,
			status: row.status
		});
	}
	return ApiResponse.success({ mentions, tags, lens });
};

/** Other members' entries for the names on a shared project's task or doc (tasker 168). */
async function loadRecordLens(
	supabase: App.Locals['supabase'],
	userId: string,
	recordKind: string,
	recordId: string
): Promise<{ project_id: string; entries: LensEntry[] } | null> {
	const table = recordKind === 'task' ? 'onto_tasks' : 'onto_documents';
	const { data } = await supabase
		.from(table)
		.select('project_id')
		.eq('id', recordId)
		.maybeSingle();
	const projectId = (data as { project_id: string | null } | null)?.project_id;
	if (!projectId || !(await projectHasOtherMembers(supabase, projectId, userId))) return null;
	const entries = await loadProjectLens(supabase, {
		projectId,
		recordKind: recordKind === 'task' ? 'task' : 'document',
		recordIds: [recordId]
	});
	return { project_id: projectId, entries };
}
