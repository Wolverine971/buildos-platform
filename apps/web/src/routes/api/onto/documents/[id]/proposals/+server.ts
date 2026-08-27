// apps/web/src/routes/api/onto/documents/[id]/proposals/+server.ts

import { z } from 'zod';
import type { RequestHandler } from './$types';
import type { Database } from '@buildos/shared-types';
import { DocumentPatchIntegrityError } from '@buildos/shared-agent-ops/ontology/document-patch';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { requireProjectEntityAccess } from '$lib/server/ontology-api-access';
import { captureServerEvent } from '$lib/server/posthog';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	DOCUMENT_PROPOSAL_INSTRUCTION_MAX,
	DOCUMENT_PROPOSAL_SELECTION_MAX,
	DocumentProposalGenerationError,
	createDocumentProposal
} from '$lib/server/document-proposal.service';

const createProposalSchema = z
	.object({
		instruction: z.string().trim().min(1).max(DOCUMENT_PROPOSAL_INSTRUCTION_MAX),
		selection_from: z.number().int().nonnegative(),
		selection_to: z.number().int().positive(),
		base_content_hash: z.string().regex(/^[0-9a-f]{64}$/),
		replaces_proposal_id: z.string().uuid().optional()
	})
	.strict()
	.refine(
		(value) =>
			value.selection_to > value.selection_from &&
			value.selection_to - value.selection_from <= DOCUMENT_PROPOSAL_SELECTION_MAX,
		{
			message: 'Select between 1 and 20,000 characters.',
			path: ['selection_to']
		}
	);

type DocumentRow = Database['public']['Tables']['onto_documents']['Row'];

function accessAudit(documentId: string, method: 'GET' | 'POST') {
	return {
		endpoint: `/api/onto/documents/${documentId}/proposals`,
		method,
		entityType: 'document',
		entityId: documentId,
		consoleLabel: 'Document Proposals API'
	};
}

async function requireDocumentAccess(params: {
	locals: App.Locals;
	user: { id: string };
	documentId: string;
	method: 'GET' | 'POST';
}) {
	return requireProjectEntityAccess<DocumentRow>({
		supabase: params.locals.supabase,
		user: params.user,
		loadEntity: () =>
			params.locals.supabase
				.from('onto_documents')
				.select('*')
				.eq('id', params.documentId)
				.is('deleted_at', null)
				.maybeSingle(),
		requiredAccess: params.method === 'POST' ? 'write' : 'read',
		audit: accessAudit(params.documentId, params.method),
		actorOperation: 'document_proposal_actor_resolve',
		entityOperation: 'document_proposal_document_fetch',
		accessOperation: 'document_proposal_access_check',
		tableName: 'onto_documents',
		notFoundResource: 'Document',
		forbiddenMessage: 'You do not have permission to access document proposals'
	});
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id) return ApiResponse.badRequest('Document ID required');

	const access = await requireDocumentAccess({
		locals,
		user,
		documentId: params.id,
		method: 'GET'
	});
	if (!access.ok) return access.response;

	const { data, error } = await locals.supabase
		.from('onto_document_proposals')
		.select('*')
		.eq('document_id', params.id)
		.order('created_at', { ascending: false })
		.limit(20);
	if (error) return ApiResponse.databaseError(error);
	return ApiResponse.success({ proposals: data ?? [] });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id) return ApiResponse.badRequest('Document ID required');

	const parsed = await parseJsonRequest(request, createProposalSchema);
	if (!parsed.ok) return parsed.response;

	const access = await requireDocumentAccess({
		locals,
		user,
		documentId: params.id,
		method: 'POST'
	});
	if (!access.ok) return access.response;

	try {
		// Proposal mutations are server-owned so clients cannot forge a reviewed or
		// applied lifecycle through the Supabase REST API. Project write access and
		// all request fields were validated above before creating this narrow client.
		const proposalSupabase = createAdminSupabaseClient();
		const proposal = await createDocumentProposal({
			supabase: locals.supabase,
			proposalSupabase,
			document: access.entity,
			actorId: access.actorId,
			userId: user.id,
			instruction: parsed.data.instruction,
			selectionFrom: parsed.data.selection_from,
			selectionTo: parsed.data.selection_to,
			baseContentHash: parsed.data.base_content_hash
		});
		await captureServerEvent(user.id, 'document_proposal_generated', {
			project_id: access.entity.project_id,
			document_id: params.id,
			proposal_id: proposal.id,
			selection_length: parsed.data.selection_to - parsed.data.selection_from,
			instruction_length: parsed.data.instruction.length,
			is_regeneration: Boolean(parsed.data.replaces_proposal_id),
			replaces_proposal_id: parsed.data.replaces_proposal_id ?? null
		});
		return ApiResponse.created({ proposal });
	} catch (error) {
		if (error instanceof DocumentPatchIntegrityError) {
			return ApiResponse.error(
				error.message,
				HttpStatus.CONFLICT,
				'DOCUMENT_SELECTION_STALE'
			);
		}
		if (error instanceof RangeError) return ApiResponse.badRequest(error.message);
		if (error instanceof DocumentProposalGenerationError) {
			const status =
				error.code === 'NO_CHANGE'
					? HttpStatus.UNPROCESSABLE_ENTITY
					: HttpStatus.SERVICE_UNAVAILABLE;
			return ApiResponse.error(error.message, status, error.code);
		}
		console.error('[Document Proposals API] POST failed:', error);
		return ApiResponse.internalError(error, 'Failed to create document proposal');
	}
};
