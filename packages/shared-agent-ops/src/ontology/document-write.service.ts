// packages/shared-agent-ops/src/ontology/document-write.service.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot,
	type DocumentSnapshot
} from './versioning.service';

type Supabase = SupabaseClient<Database>;

export type OntoDocumentRow = Database['public']['Tables']['onto_documents']['Row'];
export type OntoDocumentUpdate = Database['public']['Tables']['onto_documents']['Update'];

type VersionWriter = typeof createOrMergeDocumentVersion;

export const DOCUMENT_VERSION_WRITE_WARNING =
	'Your change was saved, but this edit could not be added to version history.';

export type GuardedDocumentWriteResult =
	| {
			status: 'updated';
			document: OntoDocumentRow;
			versionWarning: string | null;
			versionError: unknown | null;
	  }
	| { status: 'conflict' }
	| { status: 'error'; error: unknown };

export type GuardedDocumentWriteParams = {
	supabase: Supabase;
	documentId: string;
	projectId: string;
	update: OntoDocumentUpdate;
	expectedUpdatedAt?: string | null;
	actorId: string;
	previousSnapshot?: DocumentSnapshot | null;
	changeSource?: string | null;
	forceCreateVersion?: boolean;
	/** Test/web adapter seam; production callers normally use the shared default. */
	versionWriter?: VersionWriter;
};

/**
 * Update the document head with an optional compare-and-swap condition, then
 * synchronously attempt to record the corresponding version.
 *
 * The two writes are not yet transactionally atomic. A committed head update
 * is therefore returned with a caller-visible warning when versioning fails. Keeping
 * both steps behind one function prevents web and agent write paths from
 * silently drifting while a later database mutation service is designed.
 */
export async function writeDocumentHeadAndVersion(
	params: GuardedDocumentWriteParams
): Promise<GuardedDocumentWriteResult> {
	const {
		supabase,
		documentId,
		projectId,
		update,
		expectedUpdatedAt,
		actorId,
		previousSnapshot,
		changeSource,
		forceCreateVersion = false,
		versionWriter = createOrMergeDocumentVersion
	} = params;

	let updateQuery = supabase
		.from('onto_documents')
		.update(update)
		.eq('id', documentId)
		.eq('project_id', projectId)
		.is('deleted_at', null);

	if (expectedUpdatedAt) {
		updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
	}

	const { data, error } = await updateQuery.select('*').single();
	const matchedNoRows = !data && (!error || error.code === 'PGRST116');

	if (expectedUpdatedAt && matchedNoRows) {
		return { status: 'conflict' };
	}

	if (error || !data) {
		return {
			status: 'error',
			error: error ?? new Error('Document update returned no row')
		};
	}

	try {
		await versionWriter({
			supabase,
			documentId,
			actorId,
			snapshot: toDocumentSnapshot(data),
			previousSnapshot,
			changeSource,
			forceCreateVersion
		});

		return {
			status: 'updated',
			document: data,
			versionWarning: null,
			versionError: null
		};
	} catch (versionError) {
		return {
			status: 'updated',
			document: data,
			versionWarning: DOCUMENT_VERSION_WRITE_WARNING,
			versionError
		};
	}
}
