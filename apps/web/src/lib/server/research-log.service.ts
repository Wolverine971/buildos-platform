// apps/web/src/lib/server/research-log.service.ts
//
// Deterministic research capture — the floor beneath the model's own document writes.
//
// Why this exists in code rather than as a prompt rule or a skill (both measured 2026-07-25):
//   - A persistence rule added at position 13 of the 20-item "How to act" list scored 0/5.
//   - `activation: always_on` is a dead enum; across 10 instrumented turns the model issued exactly
//     one `skill_load`. Skills cannot carry behavior that must hold every turn.
// So a turn that researched and saved nothing is repaired by the model when possible
// (`shouldRepairResearchNoPersist`) and captured here regardless of what the model chose to do.
//
// Storage note: `document.knowledge.research` is deliberately NOT a `*scratch*` type key.
// `ontology-context-loader.ts` filters any type_key containing 'scratch' or 'workspace' out of
// project context, so a scratch-typed log could be written but never read back. This type key is
// visible in document highlights (metadata only — title/type/description), with the body fetched on
// demand via get_document_outline / read_document_section.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	buildResearchLogDescription,
	buildResearchEntryFromCalls,
	renderResearchEntry,
	runMarker,
	type ResearchEntryInput,
	type ResearchToolCall,
	RESEARCH_CAPTURE_MINIMUM_CALLS,
	RESEARCH_ENTRY_MAX_CHARS,
	RESEARCH_LOG_ARCHIVE_TITLE,
	RESEARCH_LOG_MAX_BYTES,
	RESEARCH_LOG_MAX_ENTRIES,
	RESEARCH_LOG_TITLE,
	RESEARCH_LOG_TYPE_KEY
} from '@buildos/agentic-chat-runtime/loop';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';

const LOG_HEADER = [
	`# ${RESEARCH_LOG_TITLE}`,
	'',
	'Research captured automatically from chat turns, newest first. Each entry records what was',
	'searched, which sources were read, and what went unresolved.',
	''
].join('\n');

const ARCHIVE_HEADER = [
	`# ${RESEARCH_LOG_ARCHIVE_TITLE}`,
	'',
	`Older entries rotated out of ${RESEARCH_LOG_TITLE}, newest first.`,
	''
].join('\n');

export {
	buildResearchLogDescription as buildLogDescription,
	buildResearchEntryFromCalls,
	renderResearchEntry,
	runMarker,
	RESEARCH_CAPTURE_MINIMUM_CALLS,
	RESEARCH_ENTRY_MAX_CHARS,
	RESEARCH_LOG_ARCHIVE_TITLE,
	RESEARCH_LOG_MAX_BYTES,
	RESEARCH_LOG_MAX_ENTRIES,
	RESEARCH_LOG_TITLE,
	RESEARCH_LOG_TYPE_KEY,
	type ResearchEntryInput,
	type ResearchToolCall
};

/** True when this turn's entry is already in the log. Finalization can run more than once. */
export function hasEntryForRun(content: string, streamRunId: string): boolean {
	if (!streamRunId) return false;
	return content.includes(runMarker(streamRunId));
}

/** Splits a log body into its entries (each begins with a level-2 heading), discarding the header. */
export function splitEntries(content: string): string[] {
	if (!content) return [];
	const parts = content.split(/\n(?=## )/g);
	return parts.map((part) => part.trim()).filter((part) => part.startsWith('## '));
}

function joinEntries(header: string, entries: string[]): string {
	if (entries.length === 0) return header.trimEnd();
	return `${header}\n${entries.join('\n\n')}`.trimEnd();
}

/** Newest entry goes directly under the header, so reading the top of the doc gives latest research. */
export function prependEntry(content: string, entry: string): string {
	const entries = splitEntries(content);
	return joinEntries(LOG_HEADER, [entry, ...entries]);
}

export interface RotationPlan {
	liveContent: string;
	rotatedEntries: string[];
}

/**
 * Returns null when no rotation is needed. Otherwise the live body keeps the newest entries under
 * both caps and `rotatedEntries` are the oldest, in newest-first order for the archive.
 */
export function planRotation(content: string): RotationPlan | null {
	const entries = splitEntries(content);
	const overCount = entries.length > RESEARCH_LOG_MAX_ENTRIES;
	const overBytes = Buffer.byteLength(content, 'utf8') > RESEARCH_LOG_MAX_BYTES;
	if (!overCount && !overBytes) return null;

	let keep = Math.min(entries.length, RESEARCH_LOG_MAX_ENTRIES);
	// Always keep at least the newest entry, even if it alone exceeds the byte cap.
	while (keep > 1) {
		const candidate = joinEntries(LOG_HEADER, entries.slice(0, keep));
		if (Buffer.byteLength(candidate, 'utf8') <= RESEARCH_LOG_MAX_BYTES) break;
		keep -= 1;
	}
	if (keep >= entries.length) return null;

	return {
		liveContent: joinEntries(LOG_HEADER, entries.slice(0, keep)),
		rotatedEntries: entries.slice(keep)
	};
}

type Client = SupabaseClient<Database>;
type DocumentRow = { id: string; content: string | null; title: string; props: unknown };

async function findLogDocument(
	supabase: Client,
	projectId: string,
	title: string
): Promise<DocumentRow | null> {
	const { data, error } = await supabase
		.from('onto_documents')
		.select('id, content, title, props')
		.eq('project_id', projectId)
		.eq('type_key', RESEARCH_LOG_TYPE_KEY)
		.eq('title', title)
		.is('deleted_at', null)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return (data as DocumentRow | null) ?? null;
}

async function createLogDocument(
	supabase: Client,
	params: {
		projectId: string;
		actorId: string;
		title: string;
		content: string;
		description: string;
	}
): Promise<DocumentRow> {
	const { data, error } = await supabase
		.from('onto_documents')
		.insert({
			project_id: params.projectId,
			title: params.title,
			type_key: RESEARCH_LOG_TYPE_KEY,
			state_key: 'draft',
			content: params.content,
			description: params.description,
			props: { body_markdown: params.content },
			created_by: params.actorId
		})
		.select('id, content, title, props')
		.single();
	if (error) throw error;
	const document = data as DocumentRow;

	// Both are nice-to-have: a log that exists but is missing a tree slot or a version row is still
	// a successful capture, and capture must never fail the turn.
	try {
		await createOrMergeDocumentVersion({
			supabase,
			documentId: document.id,
			actorId: params.actorId,
			snapshot: toDocumentSnapshot(data as Record<string, unknown>),
			changeSource: 'chat'
		});
	} catch (versionError) {
		console.warn('[research-log] version create failed (non-fatal)', versionError);
	}
	try {
		await addDocumentToTree(
			supabase,
			params.projectId,
			document.id,
			{ title: params.title, description: params.description },
			params.actorId
		);
	} catch (treeError) {
		console.warn('[research-log] doc-tree placement failed (non-fatal)', treeError);
	}

	return document;
}

async function writeLogContent(
	supabase: Client,
	documentId: string,
	content: string,
	description?: string
): Promise<void> {
	const { error } = await supabase
		.from('onto_documents')
		.update({
			content,
			props: { body_markdown: content },
			...(description ? { description } : {})
		})
		.eq('id', documentId);
	if (error) throw error;
}

async function resolveActorId(supabase: Client, userId: string): Promise<string> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', { p_user_id: userId });
	if (error) throw error;
	if (!data) throw new Error('[research-log] ensure_actor_for_user returned no actor');
	return data as unknown as string;
}

export interface AppendResearchEntryParams {
	projectId: string;
	userId: string;
	actorId?: string;
	entry: ResearchEntryInput;
}

export type AppendResearchEntryResult =
	| { status: 'appended'; documentId: string; rotated: number }
	| { status: 'duplicate'; documentId: string }
	| { status: 'skipped'; reason: string };

/**
 * Appends one entry to the project's Research Log, creating the log on first use and rotating older
 * entries into the archive when either cap trips.
 *
 * Callers should await this before closing the response — a fire-and-forget write races the e2e
 * assertions. It is one read plus one write.
 */
export async function appendResearchEntry(
	supabase: Client,
	params: AppendResearchEntryParams
): Promise<AppendResearchEntryResult> {
	const { projectId, entry } = params;
	if (!projectId) return { status: 'skipped', reason: 'no_project' };
	if (!entry.streamRunId) return { status: 'skipped', reason: 'no_stream_run_id' };

	const actorId = params.actorId ?? (await resolveActorId(supabase, params.userId));
	const description = buildResearchLogDescription(entry);
	const rendered = renderResearchEntry(entry);

	const existing = await findLogDocument(supabase, projectId, RESEARCH_LOG_TITLE);

	if (!existing) {
		const created = await createLogDocument(supabase, {
			projectId,
			actorId,
			title: RESEARCH_LOG_TITLE,
			content: prependEntry('', rendered),
			description
		});
		return { status: 'appended', documentId: created.id, rotated: 0 };
	}

	const currentContent = existing.content ?? '';
	if (hasEntryForRun(currentContent, entry.streamRunId)) {
		return { status: 'duplicate', documentId: existing.id };
	}

	const nextContent = prependEntry(currentContent, rendered);
	const rotation = planRotation(nextContent);

	if (!rotation) {
		await writeLogContent(supabase, existing.id, nextContent, description);
		return { status: 'appended', documentId: existing.id, rotated: 0 };
	}

	await archiveEntries(supabase, { projectId, actorId, entries: rotation.rotatedEntries });
	await writeLogContent(supabase, existing.id, rotation.liveContent, description);
	return { status: 'appended', documentId: existing.id, rotated: rotation.rotatedEntries.length };
}

async function archiveEntries(
	supabase: Client,
	params: { projectId: string; actorId: string; entries: string[] }
): Promise<void> {
	if (params.entries.length === 0) return;
	const archive = await findLogDocument(supabase, params.projectId, RESEARCH_LOG_ARCHIVE_TITLE);
	if (!archive) {
		await createLogDocument(supabase, {
			projectId: params.projectId,
			actorId: params.actorId,
			title: RESEARCH_LOG_ARCHIVE_TITLE,
			content: `${ARCHIVE_HEADER}\n${params.entries.join('\n\n')}`.trimEnd(),
			description: 'Older auto-captured research entries rotated out of the Research Log.'
		});
		return;
	}
	const existingEntries = splitEntries(archive.content ?? '');
	const merged =
		`${ARCHIVE_HEADER}\n${[...params.entries, ...existingEntries].join('\n\n')}`.trimEnd();
	await writeLogContent(supabase, archive.id, merged);
}
