// apps/web/src/routes/api/onto/assets/shared.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export type OntoAssetRow = Database['public']['Tables']['onto_assets']['Row'];

export type AssetAccess = {
	asset: OntoAssetRow;
	actorId: string;
};

export type ProjectAccess = {
	actorId: string;
};

type RequiredAccess = 'read' | 'write' | 'admin';

const ENTITY_TABLE_BY_KIND: Record<string, string> = {
	project: 'onto_projects',
	task: 'onto_tasks',
	document: 'onto_documents',
	plan: 'onto_plans',
	goal: 'onto_goals',
	risk: 'onto_risks',
	milestone: 'onto_milestones'
};

export function isEntityKind(value: string): boolean {
	return Boolean(ENTITY_TABLE_BY_KIND[value]);
}

export async function ensureActorForUser(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<{ actorId: string } | { error: Response }> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (error || !data) {
		return { error: ApiResponse.internalError(error || new Error('Failed to resolve actor')) };
	}

	return { actorId: data };
}

export async function ensureProjectAccess(
	supabase: SupabaseClient<Database>,
	projectId: string,
	userId: string,
	requiredAccess: RequiredAccess
): Promise<ProjectAccess | { error: Response }> {
	const actorResult = await ensureActorForUser(supabase, userId);
	if ('error' in actorResult) {
		return actorResult;
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: projectId,
			p_required_access: requiredAccess
		}
	);

	if (accessError) {
		return { error: ApiResponse.internalError(accessError, 'Failed to check project access') };
	}

	if (!hasAccess) {
		return {
			error: ApiResponse.forbidden('You do not have permission to access this project')
		};
	}

	return { actorId: actorResult.actorId };
}

export async function ensureAssetAccess(
	supabase: SupabaseClient<Database>,
	assetId: string,
	userId: string,
	requiredAccess: RequiredAccess
): Promise<AssetAccess | { error: Response }> {
	const actorResult = await ensureActorForUser(supabase, userId);
	if ('error' in actorResult) {
		return actorResult;
	}

	const { data: asset, error: assetError } = await (supabase as any)
		.from('onto_assets')
		.select('*')
		.eq('id', assetId)
		.is('deleted_at', null)
		.maybeSingle();

	if (assetError) {
		return { error: ApiResponse.databaseError(assetError) };
	}

	if (!asset) {
		return { error: ApiResponse.notFound('Asset') };
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: asset.project_id,
			p_required_access: requiredAccess
		}
	);

	if (accessError) {
		return { error: ApiResponse.internalError(accessError, 'Failed to check project access') };
	}

	if (!hasAccess) {
		return { error: ApiResponse.forbidden('You do not have permission to access this asset') };
	}

	return { asset, actorId: actorResult.actorId };
}

export async function ensureEntityInProject(
	supabase: SupabaseClient<Database>,
	params: {
		projectId: string;
		entityKind: string;
		entityId: string;
	}
): Promise<{ ok: true } | { error: Response }> {
	const table = ENTITY_TABLE_BY_KIND[params.entityKind];
	if (!table) {
		return { error: ApiResponse.badRequest('Invalid entity_kind') };
	}

	if (params.entityKind === 'project') {
		if (params.entityId !== params.projectId) {
			return { error: ApiResponse.badRequest('Project links must use the same project ID') };
		}
		return { ok: true };
	}

	const { data, error } = await (supabase as any)
		.from(table)
		.select('id, project_id, deleted_at')
		.eq('id', params.entityId)
		.maybeSingle();

	if (error) {
		return { error: ApiResponse.databaseError(error) };
	}

	if (!data || data.deleted_at) {
		return { error: ApiResponse.notFound('Entity') };
	}

	if (data.project_id !== params.projectId) {
		return { error: ApiResponse.badRequest('Entity does not belong to the same project') };
	}

	return { ok: true };
}

export function getFileExtension(filename: string, contentType: string): string {
	const byFilename = filename.split('.').pop()?.toLowerCase();
	if (byFilename && byFilename.length <= 8) return byFilename;

	switch (contentType) {
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		case 'image/gif':
			return 'gif';
		case 'image/svg+xml':
			return 'svg';
		case 'image/avif':
			return 'avif';
		case 'image/heic':
			return 'heic';
		case 'image/heif':
			return 'heif';
		case 'image/tiff':
			return 'tiff';
		case 'image/bmp':
			return 'bmp';
		default:
			return 'jpg';
	}
}

export function parsePositiveInt(value: string | null, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}
