// apps/web/src/lib/server/knowledge/knowledge.server.ts
//
// Web glue for the personal knowledge graph (tasker 160). Routes use the caller's own
// Supabase client, so RLS and KnowledgeStore's viewer filter both apply.

import {
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	KnowledgeStoreError,
	type KnowledgeDataClient,
	type KnowledgeEntityDetail,
	type KnowledgeRecordKind
} from '@buildos/shared-agent-ops/knowledge';
import type { KnowledgeLinkedRecord } from '$lib/components/knowledge/knowledge-client';
import { ApiResponse } from '$lib/utils/api-response';

export const UUID_PATTERN = KNOWLEDGE_UUID_PATTERN;

/**
 * The generated Database types don't include the knowledge tables until the migration is
 * applied and `pnpm gen:all` runs; route code reads them through this loosely typed view.
 */
export function knowledgeDb(supabase: unknown): KnowledgeDataClient {
	return supabase as KnowledgeDataClient;
}

export function knowledgeStoreFor(supabase: unknown, userId: string): KnowledgeStore {
	return new KnowledgeStore(knowledgeDb(supabase), userId);
}

export function knowledgeErrorResponse(error: unknown, fallback: string) {
	if (error instanceof KnowledgeStoreError) {
		if (error.code === 'INVALID') return ApiResponse.badRequest(error.message);
		if (error.code === 'NOT_FOUND') return ApiResponse.notFound('Entry');
	}
	return ApiResponse.internalError(error, fallback);
}

/**
 * Titles for an entity's linked tasks, documents, projects and chats, read with the caller's
 * client: records they can no longer open simply drop out. A chat link comes from chat
 * checkpoint capture (tasker 164) and opens that chat.
 */
export async function loadLinkedRecords(
	supabase: any,
	links: KnowledgeEntityDetail['links']
): Promise<KnowledgeLinkedRecord[]> {
	const ids = (kind: KnowledgeRecordKind) =>
		links.filter((l) => l.record_kind === kind).map((l) => l.record_id);
	const [tasks, documents, projects, chats] = await Promise.all([
		ids('task').length
			? supabase
					.from('onto_tasks')
					.select('id, title, project_id, state_key')
					.in('id', ids('task'))
					.is('deleted_at', null)
			: { data: [] },
		ids('document').length
			? supabase
					.from('onto_documents')
					.select('id, title, project_id, state_key')
					.in('id', ids('document'))
					.is('deleted_at', null)
			: { data: [] },
		ids('project').length
			? supabase
					.from('onto_projects')
					.select('id, name')
					.in('id', ids('project'))
					.is('deleted_at', null)
			: { data: [] },
		ids('chat_session').length
			? supabase
					.from('chat_sessions')
					.select('id, title, auto_title')
					.in('id', ids('chat_session'))
			: { data: [] }
	]);
	const chatTitles = new Map<string, string>(
		(
			(chats.data ?? []) as Array<{
				id: string;
				title: string | null;
				auto_title: string | null;
			}>
		).map((chat) => [chat.id, chat.title?.trim() || chat.auto_title?.trim() || 'Chat'])
	);
	type Rec = {
		id: string;
		title?: string;
		name?: string;
		project_id?: string;
		state_key?: string;
	};
	const byId = new Map<string, Rec>();
	for (const row of [
		...(tasks.data ?? []),
		...(documents.data ?? []),
		...(projects.data ?? [])
	] as Rec[]) {
		byId.set(row.id, row);
	}
	const projectIds = [
		...new Set(
			[...byId.values()].map((r) => r.project_id).filter((id): id is string => Boolean(id))
		)
	];
	const projectNames = new Map<string, string>();
	if (projectIds.length) {
		const { data } = await supabase
			.from('onto_projects')
			.select('id, name')
			.in('id', projectIds);
		for (const row of (data ?? []) as Array<{ id: string; name: string }>)
			projectNames.set(row.id, row.name);
	}

	const out: KnowledgeLinkedRecord[] = [];
	for (const link of links) {
		if (link.record_kind === 'chat_session') {
			const title = chatTitles.get(link.record_id);
			if (!title) continue;
			out.push({
				id: link.id,
				record_kind: link.record_kind,
				record_id: link.record_id,
				title,
				project_id: null,
				project_name: 'Chat',
				state: null,
				href: `/history?chat=${encodeURIComponent(link.record_id)}`,
				quote: link.quote
			});
			continue;
		}
		const rec = byId.get(link.record_id);
		if (!rec) continue;
		const projectId = link.record_kind === 'project' ? rec.id : (rec.project_id ?? null);
		out.push({
			id: link.id,
			record_kind: link.record_kind,
			record_id: link.record_id,
			title: rec.title ?? rec.name ?? 'Untitled',
			project_id: projectId,
			project_name: projectId
				? (projectNames.get(projectId) ??
					(link.record_kind === 'project' ? (rec.name ?? null) : null))
				: null,
			state: rec.state_key ?? null,
			href:
				link.record_kind === 'project'
					? `/projects/${rec.id}`
					: projectId
						? link.record_kind === 'task'
							? `/projects/${projectId}/tasks/${rec.id}`
							: `/projects/${projectId}/documents/${rec.id}`
						: null,
			quote: link.quote
		});
	}
	return out;
}
