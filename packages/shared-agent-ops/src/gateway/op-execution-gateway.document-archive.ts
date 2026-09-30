// packages/shared-agent-ops/src/gateway/op-execution-gateway.document-archive.ts
// Worker archive seam: fresh user access, server facts bound to review, and
// the existing atomic tree writer. Ordinary document edits stay on the gateway.
import { isValidUUID, type JsonObject } from '@buildos/shared-types';
import { archiveDocumentInTree } from '../ontology/doc-structure.service';
import { normalizeDocumentStateInput } from '../ontology/document-state';
import { logUpdateAsync } from '../ops/async-activity-logger';
import {
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	contextActorId,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { ExternalToolGatewayError, normalizeGatewayError } from './op-execution-gateway.responses';
import { serializeExternalEntity } from './op-execution-gateway.serializers';
import type { ToolExecutionContext } from './op-execution-gateway.types';
import type { GatewayWriteOpResult } from './op-execution-gateway.worker';

export type DocumentArchiveReviewSnapshot = JsonObject & {
	project_id: string;
	document_id: string;
	archive_mode: 'archive_children' | 'promote_children';
	target_updated_at: string;
	tree_fingerprint: string;
	archived_document_ids: string[];
	documents: (JsonObject & { id: string; title: string; effect: 'archive' | 'promote' })[];
	public_pages: (JsonObject & { document_id: string; slug: string; status: string })[];
};

/** Structured state aliases must never escape into the ordinary row writer. */
export function isDocumentArchiveState(value: unknown): boolean {
	return normalizeDocumentStateInput(value) === 'archived';
}

export function isDocumentArchiveReviewSnapshot(
	value: unknown
): value is DocumentArchiveReviewSnapshot {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.project_id === 'string' &&
		isValidUUID(v.project_id) &&
		typeof v.document_id === 'string' &&
		isValidUUID(v.document_id) &&
		['archive_children', 'promote_children'].includes(String(v.archive_mode)) &&
		typeof v.target_updated_at === 'string' &&
		typeof v.tree_fingerprint === 'string' &&
		Array.isArray(v.archived_document_ids) &&
		v.archived_document_ids.length > 0 &&
		v.archived_document_ids.every((id) => typeof id === 'string' && isValidUUID(id)) &&
		Array.isArray(v.documents) &&
		v.documents.length > 0 &&
		v.documents.every(
			(d) =>
				d &&
				typeof d === 'object' &&
				typeof d.id === 'string' &&
				isValidUUID(d.id) &&
				typeof d.title === 'string' &&
				['archive', 'promote'].includes(d.effect)
		) &&
		Array.isArray(v.public_pages) &&
		v.public_pages.every(
			(p) =>
				p &&
				typeof p === 'object' &&
				typeof p.document_id === 'string' &&
				typeof p.slug === 'string' &&
				typeof p.status === 'string'
		)
	);
}

type Params = Pick<ToolExecutionContext, 'admin' | 'userId' | 'scope' | 'chatSessionId'> & {
	args: Record<string, unknown>;
};

async function loadArchiveTarget(params: Params) {
	const { args } = params;
	if (
		typeof args.document_id !== 'string' ||
		!isValidUUID(args.document_id) ||
		args.state_key !== 'archived' ||
		!['archive_children', 'promote_children'].includes(String(args.archive_mode))
	) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Document archive requires document_id, state_key: archived, and explicit archive_mode: archive_children or promote_children.'
		);
	}
	const allowed = new Set(['document_id', 'state_key', 'archive_mode', '_archive_review']);
	if (Object.keys(args).some((key) => !allowed.has(key))) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Archive separately from content, title, or other document changes.'
		);
	}
	if (params.scope.mode !== 'read_write')
		throw new ExternalToolGatewayError('FORBIDDEN', 'Document archive requires write access.');
	// Never reuse the turn's access memo: membership may have changed during review.
	const visible = await loadVisibleProjects({
		admin: params.admin,
		userId: params.userId,
		scope: params.scope
	});
	const { data: document, error } = await params.admin
		.from('onto_documents')
		.select('id, project_id, title, state_key, type_key, updated_at')
		.eq('id', args.document_id)
		.in(
			'project_id',
			visible.projects.map((p) => p.id)
		)
		.maybeSingle();
	if (error)
		throw new ExternalToolGatewayError('INTERNAL', 'Could not verify document archive access.');
	if (!document)
		throw new ExternalToolGatewayError(
			'NOT_FOUND',
			'Document not found in the writable project scope.'
		);
	const project = assertVisibleEntityProject(visible.projectMap, document.project_id);
	assertProjectWriteAccess(project, params.scope);
	return { document, project };
}

function archiveFailure(error: unknown) {
	// These structured database/service failures happen before any write. All
	// unknown errors remain INTERNAL, so the executor records an uncertain outcome.
	const message = error instanceof Error ? error.message : '';
	const precommit = [
		'document_archive_explicit_mode_required',
		'document_archive_project_not_found',
		'document_archive_scope_too_large',
		'document_archive_target_missing_or_already_archived',
		'document_archive_start_here_protected',
		'document_archive_document_mismatch',
		'document_archive_review_required',
		'document_archive_review_changed',
		'Document archive review changed:',
		'Document version conflict:',
		'Structure version conflict:'
	];
	if (precommit.some((code) => message.includes(code))) {
		return {
			code: 'VALIDATION_ERROR' as const,
			message: `${message}. Nothing was archived; preview and review again.`
		};
	}
	return normalizeGatewayError(error);
}

export async function previewGatewayDocumentArchive(
	params: Params
): Promise<
	| { ok: true; snapshot: DocumentArchiveReviewSnapshot }
	| { ok: false; error: { code: string; message: string } }
> {
	try {
		const { document, project } = await loadArchiveTarget(params);
		const { data, error } = await params.admin.rpc(
			'onto_document_archive_review_snapshot' as never,
			{
				p_project_id: project.id,
				p_document_id: document.id,
				p_archive_mode: params.args.archive_mode
			} as never
		);
		if (error) throw new Error(error.message);
		if (!isDocumentArchiveReviewSnapshot(data))
			throw new ExternalToolGatewayError(
				'INTERNAL',
				'Document archive preview was unavailable. Nothing was archived.'
			);
		return { ok: true, snapshot: data };
	} catch (error) {
		return { ok: false, error: archiveFailure(error) };
	}
}

export async function runReviewedDocumentArchive(params: Params): Promise<GatewayWriteOpResult> {
	try {
		const snapshot = params.args._archive_review;
		if (
			!isDocumentArchiveReviewSnapshot(snapshot) ||
			snapshot.document_id !== params.args.document_id ||
			snapshot.archive_mode !== params.args.archive_mode
		) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'Document archive requires current server facts bound to independent review.'
			);
		}
		const { document, project } = await loadArchiveTarget(params);
		if (snapshot.project_id !== project.id)
			throw new ExternalToolGatewayError('FORBIDDEN', 'Document archive project changed.');
		const actorId = await contextActorId(params);
		const result = await archiveDocumentInTree(
			params.admin,
			project.id,
			document.id,
			{
				mode: snapshot.archive_mode,
				expectedUpdatedAt: snapshot.target_updated_at,
				expectedReviewSnapshot: snapshot
			},
			actorId
		);
		await logUpdateAsync(
			params.admin,
			project.id,
			'document',
			document.id,
			{ title: document.title, state_key: document.state_key, type_key: document.type_key },
			{
				title: result.document.title,
				state_key: result.document.state_key,
				type_key: result.document.type_key
			},
			params.userId,
			'agent_call',
			params.chatSessionId
		);
		return {
			ok: true,
			data: {
				document: serializeExternalEntity('document', { ...result.document }, project.name),
				archived_document_ids: result.archivedDocumentIds,
				archive_mode: result.archiveMode,
				public_pages_preserved: snapshot.public_pages.filter(
					(p) => p.status === 'published'
				)
			}
		};
	} catch (error) {
		return { ok: false, error: archiveFailure(error) };
	}
}
