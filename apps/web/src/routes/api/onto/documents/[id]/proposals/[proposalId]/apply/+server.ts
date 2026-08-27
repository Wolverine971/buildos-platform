// apps/web/src/routes/api/onto/documents/[id]/proposals/[proposalId]/apply/+server.ts

import type { RequestHandler } from './$types';
import { DocumentPatchIntegrityError } from '@buildos/shared-agent-ops/ontology/document-patch';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { requireProjectEntityAccess } from '$lib/server/ontology-api-access';
import { captureServerEvent } from '$lib/server/posthog';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { applyDocumentProposal } from '$lib/server/document-proposal.service';

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id || !params.proposalId) {
		return ApiResponse.badRequest('Document and proposal IDs are required');
	}

	const access = await requireProjectEntityAccess({
		supabase: locals.supabase,
		user,
		loadEntity: () =>
			locals.supabase
				.from('onto_documents')
				.select('id, project_id')
				.eq('id', params.id)
				.is('deleted_at', null)
				.maybeSingle(),
		requiredAccess: 'write',
		audit: {
			endpoint: `/api/onto/documents/${params.id}/proposals/${params.proposalId}/apply`,
			method: 'POST',
			entityType: 'document',
			entityId: params.id,
			consoleLabel: 'Document Proposal Apply API'
		},
		actorOperation: 'document_proposal_apply_actor_resolve',
		entityOperation: 'document_proposal_apply_document_fetch',
		accessOperation: 'document_proposal_apply_access_check',
		tableName: 'onto_documents',
		notFoundResource: 'Document',
		forbiddenMessage: 'You do not have permission to apply document proposals'
	});
	if (!access.ok) return access.response;

	try {
		// Only this validated server path may advance proposal lifecycle state.
		const proposalSupabase = createAdminSupabaseClient();
		const result = await applyDocumentProposal({
			supabase: locals.supabase,
			proposalSupabase,
			documentId: params.id,
			proposalId: params.proposalId,
			actorId: access.actorId
		});

		if (result.status === 'not_found') return ApiResponse.notFound('Document proposal');
		if (result.status === 'not_pending') {
			if (result.proposal.status === 'applied') {
				return ApiResponse.success({ proposal: result.proposal, already_applied: true });
			}
			return ApiResponse.error(
				'This document proposal is no longer pending review.',
				HttpStatus.CONFLICT,
				result.proposal.conflict_reason ?? 'PROPOSAL_NOT_PENDING',
				{ proposal: result.proposal }
			);
		}
		if (result.status === 'conflict') {
			await captureServerEvent(user.id, 'document_proposal_conflicted', {
				project_id: access.entity.project_id,
				document_id: params.id,
				proposal_id: params.proposalId,
				reason: result.reason
			});
			return ApiResponse.error(
				'The target passage changed while this proposal was under review.',
				HttpStatus.CONFLICT,
				result.reason,
				{ proposal: result.proposal }
			);
		}
		await captureServerEvent(user.id, 'document_proposal_applied', {
			project_id: access.entity.project_id,
			document_id: params.id,
			proposal_id: params.proposalId,
			resolution_strategy: result.strategy,
			version_warning: Boolean(result.versionWarning)
		});

		return ApiResponse.success({
			proposal: result.proposal,
			document: result.document,
			version_warning: result.versionWarning
		});
	} catch (error) {
		if (error instanceof DocumentPatchIntegrityError) {
			console.error('[Document Proposal Apply API] Stored patch failed integrity:', error);
			return ApiResponse.internalError(
				error,
				'Stored document proposal failed integrity checks'
			);
		}
		console.error('[Document Proposal Apply API] POST failed:', error);
		return ApiResponse.internalError(error, 'Failed to apply document proposal');
	}
};
