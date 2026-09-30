// apps/web/src/lib/services/ontology/project-hierarchy.service.ts
//
// Project hierarchy, phase 1: set a project's parent and read its family
// (parent, shared-docs shelf, children). Both go through RPCs that decide
// access themselves (supabase/migrations/20260930130000_project_hierarchy_shared_shelf.sql),
// so pass the signed-in user's client, never the admin client.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	parseProjectFamilyV1,
	type Database,
	type ProjectFamilyV1,
	type ProjectSetParentResultV1
} from '@buildos/shared-types';

type Client = SupabaseClient<Database>;

export type ProjectHierarchyErrorCode =
	| 'access_denied'
	| 'not_found'
	| 'parent_not_found'
	| 'parent_self'
	| 'parent_is_a_child'
	| 'has_children'
	| 'invalid'
	| 'unknown';

export class ProjectHierarchyError extends Error {
	constructor(
		readonly code: ProjectHierarchyErrorCode,
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'ProjectHierarchyError';
	}
}

// RPC exception messages are fixed identifiers raised by the migration.
const RPC_ERRORS: Record<
	string,
	{ code: ProjectHierarchyErrorCode; status: number; message: string }
> = {
	project_parent_access_denied: {
		code: 'access_denied',
		status: 403,
		message:
			'You need admin access on this project and edit access on the parent project to do that.'
	},
	project_family_access_denied: {
		code: 'access_denied',
		status: 403,
		message: 'You do not have access to this project.'
	},
	project_parent_auth_required: {
		code: 'access_denied',
		status: 401,
		message: 'Sign in to organize projects.'
	},
	project_hierarchy_columns_protected: {
		code: 'access_denied',
		status: 403,
		message: 'Project nesting can only be changed from the project menu.'
	},
	project_not_found: { code: 'not_found', status: 404, message: 'Project not found.' },
	project_parent_not_found: {
		code: 'parent_not_found',
		status: 404,
		message: 'That parent project no longer exists or is archived.'
	},
	project_parent_self: {
		code: 'parent_self',
		status: 409,
		message: 'A project can’t be placed inside itself.'
	},
	project_parent_is_a_child: {
		code: 'parent_is_a_child',
		status: 409,
		message:
			'That project is already inside another project. Only one level of nesting is supported for now.'
	},
	project_has_children: {
		code: 'has_children',
		status: 409,
		message: 'This project has its own sub-projects, so it can’t go inside another project yet.'
	},
	project_parent_invalid_arguments: {
		code: 'invalid',
		status: 400,
		message: 'Invalid project.'
	},
	project_family_invalid_arguments: {
		code: 'invalid',
		status: 400,
		message: 'Invalid project.'
	}
};

/** Machine-readable code for API responses (matches the RPC identifiers). */
export function hierarchyErrorApiCode(error: ProjectHierarchyError): string {
	const entry = Object.entries(RPC_ERRORS).find(([, value]) => value.code === error.code);
	return entry?.[0] ?? 'project_hierarchy_error';
}

export function toProjectHierarchyError(error: unknown): ProjectHierarchyError {
	if (error instanceof ProjectHierarchyError) return error;
	const text =
		typeof error === 'object' && error && 'message' in error
			? String((error as { message?: unknown }).message ?? '')
			: String(error ?? '');
	const key = Object.keys(RPC_ERRORS).find((candidate) => text.includes(candidate));
	if (key) {
		const mapped = RPC_ERRORS[key]!;
		return new ProjectHierarchyError(mapped.code, mapped.message, mapped.status);
	}
	return new ProjectHierarchyError('unknown', 'Could not update project nesting.', 500);
}

export async function getProjectFamily(
	supabase: Client,
	projectId: string
): Promise<ProjectFamilyV1> {
	const { data, error } = await supabase.rpc('onto_project_family_v1', {
		p_project_id: projectId
	});
	if (error) throw toProjectHierarchyError(error);
	const family = parseProjectFamilyV1(data);
	if (!family) throw new ProjectHierarchyError('unknown', 'Could not read project family.', 500);
	return family;
}

/** Same as getProjectFamily, but null on any failure (page loads must not break on it). */
export async function tryGetProjectFamily(
	supabase: Client,
	projectId: string
): Promise<ProjectFamilyV1 | null> {
	try {
		return await getProjectFamily(supabase, projectId);
	} catch {
		return null;
	}
}

export async function setProjectParent(
	supabase: Client,
	projectId: string,
	parentProjectId: string | null
): Promise<ProjectSetParentResultV1> {
	const { data, error } = await supabase.rpc('onto_project_set_parent_atomic', {
		p_project_id: projectId,
		// Postgres takes null to clear the parent; the generated type omits null.
		p_parent_project_id: parentProjectId as string
	});
	if (error) throw toProjectHierarchyError(error);
	const row = (data ?? {}) as Record<string, unknown>;
	const str = (value: unknown) => (typeof value === 'string' ? value : null);
	return {
		project_id: str(row.project_id) ?? projectId,
		parent_project_id: str(row.parent_project_id),
		previous_parent_project_id: str(row.previous_parent_project_id),
		shared_folder_document_id: str(row.shared_folder_document_id)
	};
}

/**
 * Parent ids for a set of projects the viewer can already see, keeping only
 * parents that are in the same visible set (the visibility rule for nesting).
 */
export async function loadVisibleParentIds(
	supabase: Client,
	visibleProjectIds: readonly string[]
): Promise<Map<string, string>> {
	const parents = new Map<string, string>();
	if (!visibleProjectIds.length) return parents;
	const visible = new Set(visibleProjectIds);
	const { data, error } = await supabase
		.from('onto_projects')
		.select('id, parent_project_id')
		.in('id', [...visible])
		.not('parent_project_id', 'is', null);
	if (error || !Array.isArray(data)) return parents;
	for (const row of data as { id: string; parent_project_id: string | null }[]) {
		if (row.parent_project_id && visible.has(row.parent_project_id)) {
			parents.set(row.id, row.parent_project_id);
		}
	}
	return parents;
}
