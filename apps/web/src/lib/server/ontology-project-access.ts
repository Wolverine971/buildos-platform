// apps/web/src/lib/server/ontology-project-access.ts
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export type ProjectAccessLevel = 'read' | 'write' | 'admin';

export type ProjectMemberAccessResult =
	| {
			ok: true;
			projectId: string;
			userId: string;
			actorId: string;
	  }
	| {
			ok: false;
			response: Response;
	  };

type ProjectMemberAccessOptions = {
	locals: App.Locals;
	projectId: string | undefined;
	requiredAccess?: ProjectAccessLevel;
	user?: { id: string } | null;
	notFoundMessage?: string;
	forbiddenMessage?: string;
};

/**
 * Authorizes internal project APIs.
 *
 * This is intentionally stricter than current_actor_has_project_access('read'):
 * public projects are not collaborators. Public-facing routes should use their
 * own public-page/graph access checks and explicitly shape the public payload.
 */
export async function requireProjectMemberAccess({
	locals,
	projectId,
	requiredAccess = 'read',
	user: providedUser,
	notFoundMessage = 'Project',
	forbiddenMessage = 'You do not have permission to access this project'
}: ProjectMemberAccessOptions): Promise<ProjectMemberAccessResult> {
	if (!projectId) {
		return { ok: false, response: ApiResponse.badRequest('Project ID required') };
	}

	if (!isValidUUID(projectId)) {
		return { ok: false, response: ApiResponse.badRequest('Invalid project ID') };
	}

	const user = providedUser ?? (await locals.safeGetSession()).user;
	if (!user) {
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	}

	const supabase = locals.supabase;

	let actorId: string;
	try {
		actorId = await ensureActorId(supabase as any, user.id);
	} catch (error) {
		console.error('[ProjectAccess] Failed to resolve actor:', error);
		return {
			ok: false,
			response: ApiResponse.internalError(error, 'Failed to resolve user actor')
		};
	}

	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id')
		.eq('id', projectId)
		.is('deleted_at', null)
		.maybeSingle();

	if (projectError) {
		console.error('[ProjectAccess] Failed to fetch project:', projectError);
		return {
			ok: false,
			response: ApiResponse.databaseError(projectError)
		};
	}

	if (!project) {
		return { ok: false, response: ApiResponse.notFound(notFoundMessage) };
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_member_access',
		{
			p_project_id: projectId,
			p_required_access: requiredAccess
		}
	);

	if (accessError) {
		console.error('[ProjectAccess] Failed to check member access:', accessError);
		return {
			ok: false,
			response: ApiResponse.internalError(accessError, 'Failed to check project access')
		};
	}

	if (!hasAccess) {
		return { ok: false, response: ApiResponse.forbidden(forbiddenMessage) };
	}

	return {
		ok: true,
		projectId,
		userId: user.id,
		actorId
	};
}
