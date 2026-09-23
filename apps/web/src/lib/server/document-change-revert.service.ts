// apps/web/src/lib/server/document-change-revert.service.ts
//
// One-click Undo for agent document edits. The client returns the inverse patches
// from the edit's DocumentChangeSummaryV1 (newest edit first). They resolve against
// the current body through the same DocumentPatchV1 kernel proposals use: fast path
// when nothing changed since the edit, re-anchored when other text moved, conflict
// when the edited passage itself changed. The result lands as one guarded head +
// version write, so a merged multi-edit card undoes all-or-nothing.

import type { Database, Json } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	DocumentPatchIntegrityError,
	resolveDocumentPatch,
	type DocumentPatchConflictReason,
	type DocumentPatchV1
} from '@buildos/shared-agent-ops/ontology/document-patch';
import {
	summarizeDocumentChange,
	type DocumentChangeSummaryV1
} from '@buildos/shared-agent-ops/ontology/document-edits';
import { hashDocumentContent } from '@buildos/shared-agent-ops/utils/document-outline';
import {
	writeDocumentHeadAndVersion,
	type OntoDocumentUpdate
} from '$lib/services/ontology/document-write.service';
import { toDocumentSnapshot } from '$lib/services/ontology/versioning.service';

type Supabase = SupabaseClient<Database>;
type DocumentRow = Database['public']['Tables']['onto_documents']['Row'];

export const DOCUMENT_CHANGE_REVERT_MAX_PATCHES = 20;
export const DOCUMENT_CHANGE_REVERT_SOURCE = 'agent_undo';

// One retry absorbs a concurrent autosave landing between read and write.
const WRITE_ATTEMPTS = 2;

export type RevertDocumentChangeResult =
	| {
			status: 'reverted';
			document: DocumentRow;
			/** The Undo itself, summarized like any document change. */
			change: DocumentChangeSummaryV1 | null;
			strategy: 'fast_path' | 'reanchored';
			versionWarning: string | null;
	  }
	/** The body already matches the pre-edit text (Undo ran before, or it was restored). */
	| { status: 'already_reverted'; document: DocumentRow }
	| { status: 'conflict'; reason: DocumentPatchConflictReason }
	| { status: 'invalid_patch'; message: string }
	| { status: 'not_found' };

type ResolvedRevert =
	| { status: 'resolved'; content: string; strategy: 'fast_path' | 'reanchored' }
	| { status: 'conflict'; reason: DocumentPatchConflictReason }
	| { status: 'invalid_patch'; message: string };

/** Apply the inverse patches in order (newest edit first) to the current body. */
function resolveRevertPatches(patches: DocumentPatchV1[], content: string): ResolvedRevert {
	let next = content;
	let strategy: 'fast_path' | 'reanchored' = 'fast_path';
	try {
		for (const patch of patches) {
			const resolved = resolveDocumentPatch(patch, next);
			if (resolved.status === 'conflict') return resolved;
			if (resolved.strategy === 'reanchored') strategy = 'reanchored';
			next = resolved.next_content;
		}
	} catch (error) {
		// The patch comes back from the client, so a malformed or altered one is a bad
		// request, not a server fault. Authorization never rests on it: the caller
		// already needs write access, which lets them set any body directly.
		if (
			error instanceof DocumentPatchIntegrityError ||
			error instanceof TypeError ||
			error instanceof RangeError
		) {
			return { status: 'invalid_patch', message: 'The revert patch is not valid.' };
		}
		throw error;
	}
	return { status: 'resolved', content: next, strategy };
}

export async function revertDocumentChange(params: {
	supabase: Supabase;
	documentId: string;
	patches: DocumentPatchV1[];
	/** Body hash before the edit; a body already there reports `already_reverted`. */
	beforeHash?: string | null;
	actorId: string;
}): Promise<RevertDocumentChangeResult> {
	for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
		const { data: document, error } = await params.supabase
			.from('onto_documents')
			.select('*')
			.eq('id', params.documentId)
			.is('deleted_at', null)
			.maybeSingle();
		if (error) throw error;
		if (!document) return { status: 'not_found' };
		if (params.patches.some((patch) => patch.project_id !== document.project_id)) {
			return {
				status: 'invalid_patch',
				message: 'The revert patch belongs to a different project.'
			};
		}

		const current = document.content ?? '';
		if (params.beforeHash && hashDocumentContent(current) === params.beforeHash) {
			return { status: 'already_reverted', document };
		}

		const resolved = resolveRevertPatches(params.patches, current);
		if (resolved.status !== 'resolved') return resolved;

		const nextProps = {
			...((document.props as Record<string, unknown> | null) ?? {}),
			body_markdown: resolved.content
		};
		const write = await writeDocumentHeadAndVersion({
			supabase: params.supabase,
			documentId: document.id,
			projectId: document.project_id,
			update: {
				content: resolved.content,
				props: nextProps as Json,
				updated_at: new Date().toISOString()
			} as OntoDocumentUpdate,
			expectedUpdatedAt: document.updated_at,
			actorId: params.actorId,
			previousSnapshot: toDocumentSnapshot(document),
			changeSource: DOCUMENT_CHANGE_REVERT_SOURCE,
			forceCreateVersion: true
		});
		if (write.status === 'conflict') continue;
		if (write.status === 'error') throw write.error;

		return {
			status: 'reverted',
			document: write.document,
			change: summarizeDocumentChange({
				project_id: document.project_id,
				document_id: document.id,
				title: document.title,
				before: current,
				after: resolved.content
			}),
			strategy: resolved.strategy,
			versionWarning: write.versionWarning
		};
	}
	return { status: 'conflict', reason: 'WRITE_RACE' };
}
