// apps/web/src/lib/server/inherited-doc-copy.ts
//
// "Copy here" for a document on a child project's shared shelf: the child gets
// its own draft copy at the root of its tree, with `props.copied_from` pointing
// at the parent's original. The parent's START HERE and thinking log become
// ordinary documents (a project has one of each). Used by the document window's
// Copy here button and by the chat confirm card's Copy here choice.
//
// Callers check write access to the child and that the document is on the
// child's shelf (it lives in `parentId`) before calling.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectLogChangeSource } from '@buildos/shared-types';
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import { logCreateAsync } from '$lib/services/async-activity-logger';
import { START_HERE_DOCUMENT_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/start-here';
import { THINKING_LOG_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/thinking-log';

const SINGLETON_CONTEXT_TYPE_KEYS = new Set<string>([
	START_HERE_DOCUMENT_TYPE_KEY,
	THINKING_LOG_TYPE_KEY
]);

export type InheritedDocumentCopyResult =
	| {
			status: 'copied';
			document: { id: string; title: string | null };
			warnings: string[];
	  }
	/** The shared original is gone from the parent. */
	| { status: 'not_found' }
	/** The original is no longer at `expectedUpdatedAt` (only checked when given). */
	| { status: 'changed' }
	| { status: 'error'; error: unknown };

export async function copyInheritedDocument(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	actorId: string;
	/** The child project receiving the copy. */
	projectId: string;
	/** The parent project that owns the shared original. */
	parentId: string;
	documentId: string;
	changeSource: ProjectLogChangeSource;
	/** Copy only this exact version of the original. */
	expectedUpdatedAt?: string;
}): Promise<InheritedDocumentCopyResult> {
	const { supabase, projectId, parentId, documentId, actorId } = params;
	const { data: source, error: sourceError } = await supabase
		.from('onto_documents')
		.select('title, description, content, type_key, state_key, updated_at')
		.eq('id', documentId)
		.eq('project_id', parentId)
		.is('deleted_at', null)
		.maybeSingle();
	if (sourceError) return { status: 'error', error: sourceError };
	if (!source) return { status: 'not_found' };
	if (params.expectedUpdatedAt !== undefined && source.updated_at !== params.expectedUpdatedAt) {
		return { status: 'changed' };
	}

	const content = source.content ?? null;
	const { data: document, error: insertError } = await supabase
		.from('onto_documents')
		.insert({
			project_id: projectId,
			title: source.title,
			// A project has one START HERE and one thinking log; copies of the
			// parent's become ordinary documents here.
			type_key: SINGLETON_CONTEXT_TYPE_KEYS.has(source.type_key)
				? 'document.default'
				: source.type_key,
			state_key: 'draft',
			content,
			description: source.description,
			props: {
				...(content ? { body_markdown: content } : {}),
				copied_from: {
					document_id: documentId,
					project_id: parentId,
					copied_at: new Date().toISOString()
				}
			},
			created_by: actorId
		})
		.select('*')
		.single();
	if (insertError || !document) return { status: 'error', error: insertError };

	const warnings: string[] = [];
	try {
		await createOrMergeDocumentVersion({
			supabase,
			documentId: document.id,
			actorId,
			snapshot: toDocumentSnapshot(document),
			changeSource: params.changeSource
		});
	} catch {
		warnings.push(
			'The copy was created, but its first version could not be recorded in history.'
		);
	}
	try {
		await addDocumentToTree(
			supabase,
			projectId,
			document.id,
			{
				parentId: null,
				title: document.title ?? null,
				description: document.description ?? null
			},
			actorId
		);
	} catch {
		warnings.push('The copy was created but could not be placed in the document tree.');
	}

	logCreateAsync(
		supabase,
		projectId,
		'document',
		document.id,
		{ title: document.title, type_key: document.type_key, state_key: document.state_key },
		params.userId,
		params.changeSource
	);

	return {
		status: 'copied',
		document: { id: document.id, title: document.title ?? null },
		warnings
	};
}
