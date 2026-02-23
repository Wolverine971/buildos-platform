// apps/web/src/lib/services/ontology/versioning.service.ts
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';

type Supabase = SupabaseClient<Database>;

export const DEFAULT_DOCUMENT_VERSION_WINDOW_MINUTES = 60;
const INLINE_STORAGE_URI = 'inline://document-snapshot';

export type DocumentSnapshot = {
	title: string | null;
	content: string | null;
	description: string | null;
	props: Record<string, unknown>;
	state_key: string | null;
	type_key: string | null;
	project_id: string | null;
};

export type DocumentVersionProps = {
	snapshot: DocumentSnapshot;
	snapshot_hash: string;
	previous_snapshot_hash?: string;
	window: {
		started_at: string;
		ended_at: string;
	};
	change_count: number;
	change_source?: string | null;
	is_merged: boolean;
	pii_redacted?: boolean;
	restored_by_user_id?: string;
	restore_of_version?: number;
};

type VersionRow = {
	id: string;
	number: number;
	created_by: string;
	created_at: string;
	props: Json | null;
};

type CreateOrMergeVersionParams = {
	supabase: Supabase;
	documentId: string;
	actorId: string;
	snapshot: DocumentSnapshot;
	previousSnapshot?: DocumentSnapshot | null;
	mergeWindowMinutes?: number;
	changeSource?: string | null;
	piiRedacted?: boolean;
	forceCreateVersion?: boolean;
};

type VersioningResult =
	| { status: 'skipped'; reason: 'no_change' }
	| {
			status: 'created' | 'merged';
			versionNumber: number;
			versionId: string;
	  };

function safeProps(input: Json | null): Partial<DocumentVersionProps> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return {};
	}
	return input as Partial<DocumentVersionProps>;
}

function hashSnapshot(snapshot: DocumentSnapshot): string {
	return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function buildWindow(
	start: string | undefined,
	end: string
): { started_at: string; ended_at: string } {
	return {
		started_at: start ?? end,
		ended_at: end
	};
}

export function toDocumentSnapshot(document: Record<string, any>): DocumentSnapshot {
	return {
		title: (document.title as string) ?? null,
		content: (document.content as string) ?? null,
		description: (document.description as string) ?? null,
		props: (document.props as Record<string, unknown>) ?? {},
		state_key: (document.state_key as string) ?? null,
		type_key: (document.type_key as string) ?? null,
		project_id: (document.project_id as string) ?? null
	};
}

/**
 * Create or merge a document version using a per-user time window.
 * - New version on first create or when actor changes or window expires.
 * - Merge (update existing version) when same actor edits within window.
 * - Skip when no content change compared to previous snapshot.
 */
export async function createOrMergeDocumentVersion(
	params: CreateOrMergeVersionParams
): Promise<VersioningResult> {
	const {
		supabase,
		documentId,
		actorId,
		snapshot,
		previousSnapshot,
		changeSource,
		mergeWindowMinutes = DEFAULT_DOCUMENT_VERSION_WINDOW_MINUTES,
		piiRedacted,
		forceCreateVersion = false
	} = params;

	const now = new Date();
	const nowIso = now.toISOString();
	const snapshotHash = hashSnapshot(snapshot);

	if (
		!forceCreateVersion &&
		previousSnapshot &&
		hashSnapshot(previousSnapshot) === snapshotHash
	) {
		return { status: 'skipped', reason: 'no_change' };
	}

	const mergeWindowMs = mergeWindowMinutes * 60 * 1000;

	const { data: latestVersion, error: latestError } = await supabase
		.from('onto_document_versions')
		.select('id, number, created_by, created_at, props')
		.eq('document_id', documentId)
		.order('number', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (latestError) {
		throw latestError;
	}

	const latestVersionRow = (latestVersion as VersionRow | null) ?? null;
	const latestProps = safeProps(latestVersionRow?.props ?? null);
	const latestWindowEnd =
		latestProps.window?.ended_at ||
		latestProps.window?.started_at ||
		latestVersionRow?.created_at;
	const latestWindowEndMs = latestWindowEnd ? new Date(latestWindowEnd).getTime() : Number.NaN;
	const withinWindow = !Number.isNaN(latestWindowEndMs)
		? now.getTime() - latestWindowEndMs <= mergeWindowMs
		: false;

	// Merge when same actor within window, unless caller explicitly forces a new version.
	if (
		!forceCreateVersion &&
		latestVersionRow &&
		latestVersionRow.created_by === actorId &&
		withinWindow
	) {
		const updatedProps: DocumentVersionProps = {
			...latestProps,
			snapshot,
			snapshot_hash: snapshotHash,
			previous_snapshot_hash: latestProps.snapshot_hash ?? latestProps.previous_snapshot_hash,
			window: buildWindow(latestProps.window?.started_at, nowIso),
			change_count: (latestProps.change_count ?? 1) + 1,
			change_source: changeSource ?? latestProps.change_source ?? 'api',
			is_merged: true,
			pii_redacted: piiRedacted ?? latestProps.pii_redacted
		};

		const { data: merged, error: mergeError } = await supabase
			.from('onto_document_versions')
			.update({
				props: updatedProps as Json,
				storage_uri: INLINE_STORAGE_URI
			})
			.eq('id', latestVersionRow.id)
			.select('id, number')
			.single();

		if (mergeError || !merged) {
			throw mergeError || new Error('Failed to merge document version');
		}

		return {
			status: 'merged',
			versionNumber: merged.number,
			versionId: merged.id
		};
	}

	const nextNumber = (latestVersionRow?.number ?? 0) + 1;

	const newProps: DocumentVersionProps = {
		snapshot,
		snapshot_hash: snapshotHash,
		previous_snapshot_hash:
			latestProps.snapshot_hash ??
			latestProps.previous_snapshot_hash ??
			(previousSnapshot ? hashSnapshot(previousSnapshot) : undefined),
		window: buildWindow(undefined, nowIso),
		change_count: 1,
		change_source: changeSource ?? 'api',
		is_merged: false,
		pii_redacted: piiRedacted ?? latestProps.pii_redacted
	};

	const { data: inserted, error: insertError } = await supabase
		.from('onto_document_versions')
		.insert({
			document_id: documentId,
			number: nextNumber,
			storage_uri: INLINE_STORAGE_URI,
			props: newProps as Json,
			created_by: actorId
		})
		.select('id, number')
		.single();

	if (insertError || !inserted) {
		throw insertError || new Error('Failed to create document version');
	}

	return { status: 'created', versionNumber: inserted.number, versionId: inserted.id };
}
