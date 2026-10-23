// apps/web/src/routes/api/onto/projects/[id]/members/+server.ts
/**
 * Project members endpoint
 * - GET: list active members (read access), each with what their agents may do
 *   here (agent_access: off | read | write) and, for people who joined with the
 *   project's invite link, joined_via_invite_link_id.
 *
 * Privacy: only the project owner (admin access) sees members' emails. Everyone
 * else gets names and @handles; their own row keeps their own email.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

type MemberWithRole = {
	role_key: string | null;
	created_at: string | null;
};

type MemberRow = MemberWithRole & {
	actor_id: string;
	access: string | null;
	actor?: {
		id: string;
		user_id: string | null;
		name: string | null;
		email: string | null;
	} | null;
	[key: string]: unknown;
};

function sortMembersByRoleAndCreatedAt<T extends MemberWithRole>(rows: T[]): T[] {
	const roleOrder: Record<string, number> = { owner: 0, editor: 1, viewer: 2 };
	return [...rows].sort((a, b) => {
		const roleDelta = (roleOrder[a.role_key ?? ''] ?? 99) - (roleOrder[b.role_key ?? ''] ?? 99);
		if (roleDelta !== 0) return roleDelta;

		const aTime = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
		const bTime = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
		return aTime - bTime;
	});
}

/** Emails stay with the owner; everyone else sees their own email only. */
function hideMemberEmails<T extends MemberRow>(
	rows: T[],
	viewerActorId: string,
	viewerIsOwner: boolean
): T[] {
	if (viewerIsOwner) return rows;
	return rows.map((row) =>
		row.actor && row.actor_id !== viewerActorId
			? { ...row, actor: { ...row.actor, email: null } }
			: row
	);
}

/**
 * Each member's @handle (users.username), when they have one. Read with the admin
 * client because users rows are private to their owner; only the username leaves here.
 */
async function loadHandles(userIds: string[]): Promise<Map<string, string>> {
	const handles = new Map<string, string>();
	if (userIds.length === 0) return handles;
	try {
		const { data, error } = await createAdminSupabaseClient()
			.from('users')
			.select('id, username')
			.in('id', userIds);
		if (error) throw error;
		for (const row of (data ?? []) as Array<{ id: string; username: string | null }>) {
			if (typeof row.username === 'string' && row.username.trim()) {
				handles.set(row.id, row.username.trim());
			}
		}
	} catch (error) {
		// Handles are a nicety: the list still works without them.
		console.warn('[Project Members API] Failed to load handles:', error);
	}
	return handles;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const supabase = locals.supabase;

		const access = await requireProjectMemberAccess({
			locals,
			projectId: params.id,
			requiredAccess: 'read',
			forbiddenMessage: 'Access denied'
		});
		if (!access.ok) return access.response;

		const projectId = access.projectId;

		const { data: members, error } = await supabase
			.from('onto_project_members')
			.select(
				'id, project_id, actor_id, role_key, access, agent_access, joined_via_invite_link_id, role_name, role_description, created_at, added_by_actor_id, removed_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)'
			)
			.eq('project_id', projectId)
			.is('removed_at', null)
			.order('created_at', { ascending: true });

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/members`,
				method: 'GET',
				userId: access.userId,
				projectId,
				entityType: 'project',
				operation: 'project_members_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(error);
		}

		const rows = (members ?? []) as unknown as MemberRow[];
		const viewerIsOwner = rows.some(
			(row) => row.actor_id === access.actorId && row.access === 'admin'
		);
		const handles = await loadHandles([
			...new Set(rows.map((row) => row.actor?.user_id).filter((id): id is string => !!id))
		]);
		const withHandles = hideMemberEmails(rows, access.actorId, viewerIsOwner).map((row) => ({
			...row,
			handle: (row.actor?.user_id && handles.get(row.actor.user_id)) || null
		}));

		const sortedMembers = sortMembersByRoleAndCreatedAt(withHandles);

		return ApiResponse.success({
			members: sortedMembers,
			actorId: access.actorId,
			viewer_is_owner: viewerIsOwner
		});
	} catch (error) {
		console.error('[Project Members API] Failed to load members:', error);
		return ApiResponse.internalError(error, 'Failed to load members');
	}
};
