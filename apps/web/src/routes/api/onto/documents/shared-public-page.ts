// apps/web/src/routes/api/onto/documents/shared-public-page.ts
import { ApiResponse } from '$lib/utils/api-response';

type RequiredAccess = 'read' | 'write' | 'admin';

export type DocumentAccessResult =
	| {
			document: Record<string, any>;
			actorId: string;
	  }
	| { error: Response };

export async function ensureDocumentAccessForPublicPage(
	locals: App.Locals,
	documentId: string,
	userId: string,
	requiredAccess: RequiredAccess
): Promise<DocumentAccessResult> {
	const supabase = locals.supabase;

	const { data: document, error: documentError } = await (supabase as any)
		.from('onto_documents')
		.select('*')
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (documentError) {
		return { error: ApiResponse.databaseError(documentError) };
	}

	if (!document) {
		return { error: ApiResponse.notFound('Document') };
	}

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});
	if (actorError || !actorId) {
		return {
			error: ApiResponse.internalError(actorError || new Error('Failed to resolve actor'))
		};
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: document.project_id,
			p_required_access: requiredAccess
		}
	);
	if (accessError) {
		return {
			error: ApiResponse.internalError(accessError, 'Failed to check project access')
		};
	}
	if (!hasAccess) {
		return {
			error: ApiResponse.forbidden('You do not have permission to access this document')
		};
	}

	return { document, actorId: String(actorId) };
}
