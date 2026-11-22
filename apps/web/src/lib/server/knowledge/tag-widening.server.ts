// apps/web/src/lib/server/knowledge/tag-widening.server.ts
//
// After an entry is renamed (or another entry folds into it), its tags may sit on part of the
// new name: the doc reader filed "Strategies" and tagged it wherever "Wayne Strategies" is
// written; the user renames the card to "Wayne Strategies". This finds the records where the
// new name is written around one of the entry's tags (from each tag's stored surroundings, no
// record text loaded yet) and re-syncs just those records, so each tag grows to the whole name
// and other entries' fragments inside it fold in. The new name is the user's own input; the
// records are matched on its exact words, never on what the prose means.
//
// Runs with the signed-in user's client (RLS: own tags and entries only). No model calls.

import {
	addsWords,
	findNameSpans,
	syncRecordMentions,
	type KnowledgeDataClient
} from '@buildos/shared-agent-ops/knowledge';
import { loadTexts } from './name-updates.server';

/** Records re-synced per rename; the rest catch up at their next scheduled read. */
export const MAX_WIDEN_RECORDS = 25;

type TagRow = {
	record_kind: 'task' | 'document';
	record_id: string;
	text: string;
	prefix: string;
	suffix: string;
	made_by: string;
};

/** The new name is written around this tag, covering it (from the tag's stored context). */
export function nameCoversTag(
	tag: Pick<TagRow, 'text' | 'prefix' | 'suffix'>,
	name: string
): boolean {
	const around = `${tag.prefix}${tag.text}${tag.suffix}`;
	const start = tag.prefix.length;
	const end = start + tag.text.length;
	if (name.trim().length <= tag.text.trim().length) return false;
	return findNameSpans(around, name).some(
		(span) => span.start <= start && span.end >= end && addsWords(around, { start, end }, span)
	);
}

export async function widenTagsToName(
	db: KnowledgeDataClient,
	userId: string,
	entityId: string
): Promise<{ widened: number; records: number }> {
	const { data: entity, error } = await db
		.from('knowledge_entities')
		.select('id, name, status')
		.eq('id', entityId)
		.eq('owner_user_id', userId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!entity || entity.status !== 'active') return { widened: 0, records: 0 };
	const { data: rows, error: tagError } = await db
		.from('knowledge_mentions')
		.select('record_kind, record_id, text, prefix, suffix, made_by')
		.eq('owner_user_id', userId)
		.eq('entity_id', entityId)
		.eq('status', 'active')
		.limit(1000);
	// Before migration 20261118200000: no tags to widen.
	if (tagError) return { widened: 0, records: 0 };
	const refs = new Map<string, { kind: 'task' | 'document'; id: string }>();
	for (const tag of (rows ?? []) as TagRow[]) {
		if (tag.made_by !== 'reader' || !nameCoversTag(tag, entity.name)) continue;
		refs.set(`${tag.record_kind}|${tag.record_id}`, {
			kind: tag.record_kind,
			id: tag.record_id
		});
		if (refs.size >= MAX_WIDEN_RECORDS) break;
	}
	if (!refs.size) return { widened: 0, records: 0 };
	const texts = await loadTexts(db, [...refs.values()]);
	let widened = 0;
	let records = 0;
	for (const text of texts.values()) {
		const report = await syncRecordMentions(
			db,
			userId,
			{
				record: {
					kind: text.kind,
					id: text.id,
					title: text.title,
					projectId: text.projectId
				},
				fields: text.fields,
				reader: [],
				readerComplete: false
			},
			{ via: 'system', rememberRead: false }
		);
		widened += report.counts.widened;
		if (report.counts.widened) records++;
	}
	return { widened, records };
}
