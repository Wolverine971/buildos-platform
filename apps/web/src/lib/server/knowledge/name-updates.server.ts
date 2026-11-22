// apps/web/src/lib/server/knowledge/name-updates.server.ts
//
// "Update the name in N places" (tasker 167). After an entry is renamed or a spelling fix folds
// one entry into another, its tags in tasks and docs may still spell the old name. This lists
// those places (record, the sentence before → after) and, on request, replaces exactly those
// spans of text. Never silent: only the places the user ticked change.
//
// Writes go through the normal task/doc update routes (PATCH /api/onto/tasks/:id and
// /api/onto/documents/:id) so permissions, history and versions apply as for any edit. Each span
// is re-anchored right before the write and skipped if its words no longer match. The tag rows
// are updated in place, so the renamed mentions stay attached to the entry. Undo is the same
// call with the old words.

import {
	anchorAt,
	applyMentionRenames,
	mentionTextHash,
	offersRename,
	reanchorMentions,
	sentenceAround,
	type KnowledgeDataClient,
	type MentionField,
	type MentionRename
} from '@buildos/shared-agent-ops/knowledge';

export const MAX_NAME_UPDATE_PLACES = 100;

type MentionRow = {
	id: string;
	entity_id: string;
	record_kind: 'task' | 'document';
	record_id: string;
	field: MentionField;
	start_offset: number;
	end_offset: number;
	text: string;
	prefix: string;
	suffix: string;
	status: string;
};

type RecordText = {
	kind: 'task' | 'document';
	id: string;
	title: string;
	projectId: string | null;
	updatedAt: string | null;
	fields: Partial<Record<MentionField, string>>;
};

export type NameUpdatePlace = {
	mention_id: string;
	record_kind: 'task' | 'document';
	record_id: string;
	record_title: string;
	project_id: string | null;
	field: MentionField;
	from: string;
	before: string;
	after: string;
	can_edit: boolean;
};

export interface NameUpdateDeps {
	db: KnowledgeDataClient;
	userId: string;
	/** Whether the user may edit records in this project. */
	canEdit: (projectId: string) => Promise<boolean>;
}

const MENTION_COLUMNS =
	'id, entity_id, record_kind, record_id, field, start_offset, end_offset, text, prefix, suffix, status';

export async function loadTexts(
	db: KnowledgeDataClient,
	refs: Array<{ kind: 'task' | 'document'; id: string }>
): Promise<Map<string, RecordText>> {
	const out = new Map<string, RecordText>();
	const taskIds = [...new Set(refs.filter((r) => r.kind === 'task').map((r) => r.id))];
	const docIds = [...new Set(refs.filter((r) => r.kind === 'document').map((r) => r.id))];
	const [tasks, docs] = await Promise.all([
		taskIds.length
			? db
					.from('onto_tasks')
					.select('id, title, description, project_id, updated_at')
					.in('id', taskIds)
					.is('deleted_at', null)
			: { data: [], error: null },
		docIds.length
			? db
					.from('onto_documents')
					.select('id, title, content, project_id, updated_at')
					.in('id', docIds)
					.is('deleted_at', null)
			: { data: [], error: null }
	]);
	if (tasks.error) throw new Error(tasks.error.message);
	if (docs.error) throw new Error(docs.error.message);
	for (const t of tasks.data ?? []) {
		out.set(`task|${t.id}`, {
			kind: 'task',
			id: t.id,
			title: t.title ?? 'Untitled task',
			projectId: t.project_id ?? null,
			updatedAt: t.updated_at ?? null,
			fields: { title: t.title ?? '', description: t.description ?? '' }
		});
	}
	for (const d of docs.data ?? []) {
		out.set(`document|${d.id}`, {
			kind: 'document',
			id: d.id,
			title: d.title ?? 'Untitled doc',
			projectId: d.project_id ?? null,
			updatedAt: d.updated_at ?? null,
			fields: { title: d.title ?? '', content: d.content ?? '' }
		});
	}
	return out;
}

/** Where the mention is in the current text, if its words are still exactly there. */
function locate(text: RecordText, mention: MentionRow): { start: number; end: number } | null {
	const outcome = reanchorMentions(text.fields, [
		{
			id: mention.id,
			anchor: {
				field: mention.field,
				start: mention.start_offset,
				end: mention.end_offset,
				text: mention.text,
				prefix: mention.prefix,
				suffix: mention.suffix
			}
		}
	]).get(mention.id);
	if (!outcome || (outcome.status !== 'same' && outcome.status !== 'moved')) return null;
	const field = text.fields[mention.field] ?? '';
	const span = { start: outcome.anchor.start, end: outcome.anchor.end };
	return field.slice(span.start, span.end) === mention.text ? span : null;
}

/** The places an entry's tags still spell another full name, with a before/after preview. */
export async function listNameUpdates(
	deps: NameUpdateDeps,
	entityId: string
): Promise<{ name: string; places: NameUpdatePlace[] }> {
	const { data: entity, error } = await deps.db
		.from('knowledge_entities')
		.select('id, name, status')
		.eq('id', entityId)
		.eq('owner_user_id', deps.userId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!entity || entity.status !== 'active') return { name: '', places: [] };
	const { data: rows, error: mentionError } = await deps.db
		.from('knowledge_mentions')
		.select(MENTION_COLUMNS)
		.eq('owner_user_id', deps.userId)
		.eq('entity_id', entityId)
		.eq('status', 'active')
		.limit(500);
	// Before migration 20261118200000: nothing to update.
	if (mentionError) return { name: entity.name, places: [] };
	const stale = ((rows ?? []) as MentionRow[]).filter((m) => offersRename(m.text, entity.name));
	if (!stale.length) return { name: entity.name, places: [] };
	const texts = await loadTexts(
		deps.db,
		stale.map((m) => ({ kind: m.record_kind, id: m.record_id }))
	);
	const editable = new Map<string, boolean>();
	const places: NameUpdatePlace[] = [];
	for (const mention of stale) {
		const text = texts.get(`${mention.record_kind}|${mention.record_id}`);
		if (!text) continue;
		const span = locate(text, mention);
		if (!span) continue;
		const projectId = text.projectId;
		if (projectId && !editable.has(projectId))
			editable.set(projectId, await deps.canEdit(projectId));
		const sentence = sentenceAround(text.fields[mention.field] ?? '', span);
		places.push({
			mention_id: mention.id,
			record_kind: text.kind,
			record_id: text.id,
			record_title: text.title,
			project_id: projectId,
			field: mention.field,
			from: mention.text,
			before: sentence.text,
			after:
				sentence.text.slice(0, sentence.start) +
				entity.name +
				sentence.text.slice(sentence.end),
			can_edit: projectId ? (editable.get(projectId) ?? false) : false
		});
		if (places.length >= MAX_NAME_UPDATE_PLACES) break;
	}
	return { name: entity.name, places };
}

export type NameUpdateChange = { mention_id: string; to: string };

export interface ApplyNameUpdateDeps extends NameUpdateDeps {
	/** The app's own fetch (cookies forwarded): writes go through the normal update routes. */
	fetch: typeof fetch;
}

export type NameUpdateResult = {
	applied: Array<{
		mention_id: string;
		from: string;
		to: string;
		record_kind: string;
		record_id: string;
	}>;
	skipped: Array<{ mention_id: string; reason: string }>;
};

/**
 * Replace exactly the tagged words in each record (one write per record), then update the tag
 * rows to the new words and positions. Records the user can't edit, spans whose words changed,
 * and writes the update route refuses are skipped and reported.
 */
export async function applyNameUpdates(
	deps: ApplyNameUpdateDeps,
	changes: NameUpdateChange[]
): Promise<NameUpdateResult> {
	const result: NameUpdateResult = { applied: [], skipped: [] };
	const wanted = new Map(changes.map((c) => [c.mention_id, c.to]));
	const { data, error } = await deps.db
		.from('knowledge_mentions')
		.select(MENTION_COLUMNS)
		.eq('owner_user_id', deps.userId)
		.in('id', [...wanted.keys()]);
	if (error) throw new Error(error.message);
	const mentions = ((data ?? []) as MentionRow[]).filter((m) => m.status === 'active');
	for (const id of wanted.keys()) {
		if (!mentions.some((m) => m.id === id))
			result.skipped.push({ mention_id: id, reason: 'Tag not found' });
	}
	const texts = await loadTexts(
		deps.db,
		mentions.map((m) => ({ kind: m.record_kind, id: m.record_id }))
	);

	const byRecord = new Map<string, MentionRow[]>();
	for (const m of mentions) {
		const key = `${m.record_kind}|${m.record_id}`;
		byRecord.set(key, [...(byRecord.get(key) ?? []), m]);
	}
	const editable = new Map<string, boolean>();
	for (const [key, list] of byRecord) {
		const text = texts.get(key);
		if (!text) {
			for (const m of list)
				result.skipped.push({ mention_id: m.id, reason: 'The record is gone' });
			continue;
		}
		const projectId = text.projectId;
		if (projectId && !editable.has(projectId))
			editable.set(projectId, await deps.canEdit(projectId));
		if (!projectId || !editable.get(projectId)) {
			for (const m of list)
				result.skipped.push({ mention_id: m.id, reason: 'You can’t edit this' });
			continue;
		}
		// Per field: locate every span now, replace right to left.
		const patch: Partial<Record<MentionField, string>> = {};
		const updates: Array<{ mention: MentionRow; field: MentionField; rename: MentionRename }> =
			[];
		const fields = [...new Set(list.map((m) => m.field))];
		for (const field of fields) {
			const renames: Array<{ mention: MentionRow; rename: MentionRename }> = [];
			for (const m of list.filter((x) => x.field === field)) {
				const to = (wanted.get(m.id) ?? '').trim();
				const span = locate(text, m);
				if (!span) {
					result.skipped.push({ mention_id: m.id, reason: 'The words changed since' });
					continue;
				}
				if (to === m.text) continue;
				renames.push({ mention: m, rename: { ...span, expect: m.text, to } });
			}
			if (!renames.length) continue;
			const out = applyMentionRenames(
				text.fields[field] ?? '',
				renames.map((r) => r.rename)
			);
			for (const r of renames) {
				if (out.skipped.includes(r.rename))
					result.skipped.push({
						mention_id: r.mention.id,
						reason: 'Overlaps another change'
					});
			}
			if (!out.applied.length) continue;
			patch[field] = out.text;
			for (const r of renames.filter((x) => out.applied.includes(x.rename))) {
				const span = out.shifted.get(r.rename)!;
				updates.push({
					mention: r.mention,
					field,
					rename: { ...r.rename, start: span.start, end: span.end }
				});
			}
		}
		if (!Object.keys(patch).length) continue;

		const response = await deps.fetch(
			text.kind === 'task' ? `/api/onto/tasks/${text.id}` : `/api/onto/documents/${text.id}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					text.kind === 'task'
						? patch
						: {
								...patch,
								...(text.updatedAt ? { expected_updated_at: text.updatedAt } : {})
							}
				)
			}
		);
		if (!response.ok) {
			const reason =
				response.status === 409
					? 'It changed while you were looking'
					: 'The update was refused';
			for (const u of updates) result.skipped.push({ mention_id: u.mention.id, reason });
			continue;
		}

		// The tags follow their new words.
		const stamp = new Date().toISOString();
		for (const u of updates) {
			const fieldText = patch[u.field]!;
			const anchor = anchorAt(
				fieldText,
				{ start: u.rename.start, end: u.rename.end },
				u.field
			);
			await deps.db
				.from('knowledge_mentions')
				.update({
					text: anchor.text,
					start_offset: anchor.start,
					end_offset: anchor.end,
					prefix: anchor.prefix,
					suffix: anchor.suffix,
					content_hash: mentionTextHash(fieldText),
					updated_at: stamp
				})
				.eq('id', u.mention.id)
				.eq('owner_user_id', deps.userId);
			result.applied.push({
				mention_id: u.mention.id,
				from: u.mention.text,
				to: anchor.text,
				record_kind: text.kind,
				record_id: text.id
			});
		}
	}
	return result;
}
