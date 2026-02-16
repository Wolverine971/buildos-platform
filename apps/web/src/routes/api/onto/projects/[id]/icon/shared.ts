// apps/web/src/routes/api/onto/projects/[id]/icon/shared.ts
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

export const PROJECT_ICON_MAX_CANDIDATES = 8;
export const PROJECT_ICON_DEFAULT_CANDIDATES = 4;

type AccessLevel = 'read' | 'write' | 'admin';

export type ProjectAccessResult =
	| {
			ok: true;
			userId: string;
			supabase: any;
	  }
	| {
			ok: false;
			response: Response;
	  };

export function normalizePrompt(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function parseCandidateCount(value: unknown): number | null {
	if (value === undefined) return PROJECT_ICON_DEFAULT_CANDIDATES;
	if (typeof value !== 'number' || !Number.isInteger(value)) return null;
	if (value < 1 || value > PROJECT_ICON_MAX_CANDIDATES) return null;
	return value;
}

export function validateProjectAndGenerationIds(
	projectId: string,
	generationId?: string
): Response | null {
	if (!projectId) return ApiResponse.badRequest('Project ID required');
	if (!isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');
	if (!generationId) return null;
	if (!isValidUUID(generationId)) return ApiResponse.badRequest('Invalid generation ID');
	return null;
}

export async function requireProjectAccess(
	locals: App.Locals,
	projectId: string,
	requiredAccess: AccessLevel
): Promise<ProjectAccessResult> {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	}

	const supabase = locals.supabase as any;
	const [projectResult, accessResult] = await Promise.all([
		supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle(),
		supabase.rpc('current_actor_has_project_access', {
			p_project_id: projectId,
			p_required_access: requiredAccess
		})
	]);

	if (projectResult.error) {
		return { ok: false, response: ApiResponse.databaseError(projectResult.error) };
	}
	if (!projectResult.data) {
		return { ok: false, response: ApiResponse.notFound('Project') };
	}

	if (accessResult.error) {
		return {
			ok: false,
			response: ApiResponse.internalError(
				accessResult.error,
				'Failed to check project access'
			)
		};
	}
	if (!accessResult.data) {
		return { ok: false, response: ApiResponse.forbidden('Access denied') };
	}

	return { ok: true, userId: user.id, supabase };
}
