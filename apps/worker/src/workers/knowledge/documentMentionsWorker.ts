// apps/worker/src/workers/knowledge/documentMentionsWorker.ts
//
// knowledge_doc_mentions (tasker 167): after a document is saved and left alone for ~5 minutes,
// re-read it with the free local name finder (tasker 165) and bring its mentions in step with
// the text: tags follow moved names, a corrected spelling folds the old entry into the new one
// (or asks "same person?"), a deleted name loses its tag and reader-made link, and names new to
// the text are filed in the creator's private graph. Every other user with tags on the document
// (a shared doc) gets theirs re-anchored too, without new names. No model API calls.
//
// Queued by the embedding job (every writer of title/description/content lands there) with a
// dedup key per document and content hash, scheduled 5 minutes out: a job whose hash is no
// longer the document's is superseded by the newer one and exits at once. A content-hash +
// reader-version match skips the read entirely.

import {
	type KnowledgeDataClient,
	KnowledgeStore,
	MENTION_READER_VERSION,
	type MentionReaderName,
	type MentionSyncReport,
	mentionFieldsHash,
	normalizeKnowledgeName,
	reviveOrphanEntries,
	syncRecordMentions
} from '@buildos/shared-agent-ops/knowledge';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { canOpenProject } from './taskEntityKnowledgeSync';
import { documentNerText } from './documentEntityText';
import { type DocumentNer, loadDocumentNer } from './documentNer';
import { pickDocumentEntities, planDocumentEntityKnowledge } from './documentEntityPlan';

export const KNOWLEDGE_DOC_MENTIONS_JOB_TYPE = 'knowledge_doc_mentions';
/** Idle time after a save before the re-read (typing produces many saves). */
export const DOC_MENTIONS_DELAY_MS = 5 * 60 * 1000;
/** Research notes full of public names: link names already in the graph, file none (tasker 165). */
export const LINK_ONLY_DOC_TYPES = new Set(['document.knowledge.research']);

export type DocMentionsJobData = { documentId: string; contentHash?: string | null };

export type DocMentionsResult = {
	success: boolean;
	documentId: string;
	outcome: 'read' | 'skipped' | 'superseded';
	reason?: string;
	reports?: MentionSyncReport[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DocRow = {
	id: string;
	project_id: string | null;
	title: string | null;
	content: string | null;
	content_hash: string | null;
	type_key: string | null;
	created_by: string | null;
	deleted_at: string | null;
	archived_at: string | null;
};

/** Off with KNOWLEDGE_DOC_MENTIONS=off (kill switch). */
export function docMentionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return (env.KNOWLEDGE_DOC_MENTIONS ?? 'on').trim().toLowerCase() !== 'off';
}

/**
 * Queue the debounced re-read for a document (called after its embedding job). Best effort:
 * never throws.
 */
export async function enqueueDocumentMentions(
	db: KnowledgeDataClient,
	documentId: string,
	now = new Date()
): Promise<string | null> {
	if (!docMentionsEnabled() || !UUID.test(documentId)) return null;
	try {
		const { data: doc } = await db
			.from('onto_documents')
			.select('content_hash, created_by, deleted_at')
			.eq('id', documentId)
			.maybeSingle();
		if (!doc || doc.deleted_at || !doc.created_by) return null;
		const { data: actor } = await db
			.from('onto_actors')
			.select('user_id')
			.eq('id', doc.created_by)
			.maybeSingle();
		if (!actor?.user_id) return null;
		const { data, error } = await db.rpc('add_queue_job', {
			p_user_id: actor.user_id,
			p_job_type: KNOWLEDGE_DOC_MENTIONS_JOB_TYPE,
			p_metadata: { documentId, contentHash: doc.content_hash ?? null },
			p_priority: 20,
			p_scheduled_for: new Date(now.getTime() + DOC_MENTIONS_DELAY_MS).toISOString(),
			p_dedup_key: `knowledge-doc-mentions:${documentId}:${doc.content_hash ?? 'none'}`
		});
		if (error) throw new Error(error.message);
		return typeof data === 'string' ? data : null;
	} catch (error) {
		console.warn(
			'[knowledge] could not queue document mentions',
			documentId,
			error instanceof Error ? error.message : error
		);
		return null;
	}
}

export function processDocumentMentionsJob(
	job: ProcessingJob,
	deps: { db: KnowledgeDataClient; ner?: () => Promise<DocumentNer> }
): Promise<DocMentionsResult> {
	const meta = (job.data && typeof job.data === 'object' ? job.data : {}) as Record<
		string,
		unknown
	>;
	const documentId = typeof meta.documentId === 'string' ? meta.documentId : '';
	if (!UUID.test(documentId)) throw new Error('knowledge_doc_mentions needs documentId');
	const contentHash = typeof meta.contentHash === 'string' ? meta.contentHash : null;
	return refreshDocumentMentions(deps.db, documentId, {
		expectedContentHash: contentHash,
		ner: deps.ner ?? (() => loadDocumentNer()),
		signal: job.signal
	});
}

/**
 * Re-read one document and sync its mentions for its creator (with the name finder) and for
 * every other user with tags on it (re-anchor only). `dryRun` reads and reports, writes nothing.
 */
export async function refreshDocumentMentions(
	db: KnowledgeDataClient,
	documentId: string,
	options: {
		expectedContentHash?: string | null;
		ner: (() => Promise<DocumentNer>) | null;
		dryRun?: boolean;
		force?: boolean;
		signal?: AbortSignal;
	}
): Promise<DocMentionsResult> {
	const done = (
		outcome: DocMentionsResult['outcome'],
		extra: Partial<DocMentionsResult> = {}
	) => ({
		success: true,
		documentId,
		outcome,
		...extra
	});
	const { data, error } = await db
		.from('onto_documents')
		.select(
			'id, project_id, title, content, content_hash, type_key, created_by, deleted_at, archived_at'
		)
		.eq('id', documentId)
		.maybeSingle();
	if (error) throw new Error(`Could not load document: ${error.message}`);
	const doc = data as DocRow | null;
	if (!doc || doc.deleted_at) return done('skipped', { reason: 'document deleted' });
	if (
		options.expectedContentHash &&
		doc.content_hash &&
		doc.content_hash !== options.expectedContentHash
	)
		return done('superseded', { reason: 'the document changed again; a newer read is queued' });

	const fields = { title: doc.title ?? '', content: doc.content ?? '' };
	const hash = mentionFieldsHash(fields);
	const record = {
		kind: 'document' as const,
		id: doc.id,
		title: doc.title ?? 'Untitled',
		projectId: doc.project_id
	};

	// Who has tags here, and who reads new names into their graph (the creator).
	const { data: actor } = doc.created_by
		? await db.from('onto_actors').select('user_id').eq('id', doc.created_by).maybeSingle()
		: { data: null };
	const creator: string | null = actor?.user_id ?? null;
	const { data: taggers, error: taggersError } = await db
		.from('knowledge_mentions')
		.select('owner_user_id')
		.eq('record_kind', 'document')
		.eq('record_id', doc.id);
	if (taggersError) throw new Error(`Could not load mentions: ${taggersError.message}`);
	const owners = new Set<string>(
		((taggers ?? []) as Array<{ owner_user_id: string }>).map((t) => t.owner_user_id)
	);
	if (creator) owners.add(creator);

	const reports: MentionSyncReport[] = [];
	for (const owner of owners) {
		if (options.signal?.aborted) break;
		if (doc.project_id && !(await canOpenProject(db, owner, doc.project_id))) continue;
		if (!options.force) {
			const { data: read } = await db
				.from('knowledge_mention_reads')
				.select('content_hash, reader_version')
				.eq('owner_user_id', owner)
				.eq('record_kind', 'document')
				.eq('record_id', doc.id)
				.maybeSingle();
			if (read?.content_hash === hash && read?.reader_version === MENTION_READER_VERSION)
				continue;
		}
		const reader =
			owner === creator && options.ner && !doc.archived_at
				? await readNewNames(db, owner, doc, options.ner, Boolean(options.dryRun))
				: [];
		reports.push(
			await syncRecordMentions(
				db,
				owner,
				{ record, fields, reader, readerComplete: false },
				{ via: 'system', dryRun: options.dryRun }
			)
		);
	}
	if (!reports.length) return done('skipped', { reason: 'text unchanged since the last read' });
	return done('read', { reports });
}

/** The name finder on the document, filed into the owner's graph (dry: matched, not filed). */
async function readNewNames(
	db: KnowledgeDataClient,
	userId: string,
	doc: DocRow,
	ner: () => Promise<DocumentNer>,
	dryRun: boolean
): Promise<MentionReaderName[]> {
	const text = documentNerText(doc.title ?? '', doc.content);
	if (!text.chunks.length) return [];
	const [model, context] = await Promise.all([ner(), loadReaderContext(db, userId)]);
	const spans = await model.extract(text.chunks);
	const linkOnly = LINK_ONLY_DOC_TYPES.has(doc.type_key ?? '');
	const pick = pickDocumentEntities(spans, text.chunks, text.headings, context, {
		...(linkOnly ? { onlyExisting: context.existing } : {})
	});
	if (!pick.kept.length) return [];
	await reviveOrphanEntries(db, userId, pick.kept, { dryRun });
	if (dryRun) {
		// Only names already in the graph can be tagged without writing.
		return pick.kept
			.map((c) => ({
				c,
				id: context.idByKey.get(`${c.kind}|${normalizeKnowledgeName(c.name)}`)
			}))
			.filter((x): x is { c: (typeof pick.kept)[number]; id: string } => Boolean(x.id))
			.map(({ c, id }) => ({ entityId: id, kind: c.kind, names: [c.name] }));
	}
	const receipt = await new KnowledgeStore(db, userId).record(
		planDocumentEntityKnowledge(doc, pick.kept),
		{ via: 'system' }
	);
	const byRef = new Map(pick.kept.map((c, i) => [`d${i}`, c]));
	return receipt.entities.map((e) => ({
		entityId: e.id,
		kind: e.kind,
		names: [byRef.get(e.ref)?.name ?? e.name]
	}));
}

async function loadReaderContext(db: KnowledgeDataClient, userId: string) {
	const [{ data: user }, { data: actor }] = await Promise.all([
		db.from('users').select('name').eq('id', userId).maybeSingle(),
		db.from('onto_actors').select('id').eq('user_id', userId).maybeSingle()
	]);
	const entities: Array<{
		id: string;
		kind: string;
		name: string;
		normalized_name: string;
		status: string;
		is_self: boolean;
		hidden_reason?: string | null;
	}> = [];
	for (let from = 0; ; from += 1000) {
		let res = await db
			.from('knowledge_entities')
			.select('id, kind, name, normalized_name, status, is_self, hidden_reason')
			.eq('owner_user_id', userId)
			.in('kind', ['person', 'org'])
			// A unique sort key, so pages never overlap or skip rows.
			.order('id')
			.range(from, from + 999);
		if (res.error?.code === '42703')
			res = await db
				.from('knowledge_entities')
				.select('id, kind, name, normalized_name, status, is_self')
				.eq('owner_user_id', userId)
				.in('kind', ['person', 'org'])
				.order('id')
				.range(from, from + 999);
		if (res.error) throw new Error(res.error.message);
		entities.push(...(res.data ?? []));
		if ((res.data ?? []).length < 1000) break;
	}
	const projectNames: string[] = [];
	if (actor?.id) {
		const [owned, member] = await Promise.all([
			db
				.from('onto_projects')
				.select('name')
				.eq('created_by', actor.id)
				.is('deleted_at', null),
			db
				.from('onto_project_members')
				.select('project:onto_projects(name)')
				.eq('actor_id', actor.id)
				.is('removed_at', null)
		]);
		for (const p of owned.data ?? []) if (p.name) projectNames.push(p.name);
		for (const m of member.data ?? []) if (m.project?.name) projectNames.push(m.project.name);
	}
	const active = entities.filter((e) => e.status === 'active');
	return {
		selfNames: [user?.name ?? '', ...entities.filter((e) => e.is_self).map((e) => e.name)],
		projectNames,
		// Entries hidden only as orphans come back when the name shows up again.
		hiddenNames: entities
			.filter((e) => e.status === 'hidden' && e.hidden_reason !== 'orphan')
			.map((e) => e.name),
		knownPeople: new Set(
			active.filter((e) => e.kind === 'person' && !e.is_self).map((e) => e.normalized_name)
		),
		knownNames: active
			.filter((e) => !e.is_self && (e.kind === 'person' || e.kind === 'org'))
			.map((e) => ({ kind: e.kind as 'person' | 'org', name: e.name })),
		existing: new Set(active.map((e) => `${e.kind}|${e.normalized_name}`)),
		idByKey: new Map(active.map((e) => [`${e.kind}|${e.normalized_name}`, e.id]))
	};
}
