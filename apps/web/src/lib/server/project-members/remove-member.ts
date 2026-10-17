// apps/web/src/lib/server/project-members/remove-member.ts
//
// Remove one member from a project, as the signed-in user. Extracted verbatim
// from DELETE /api/onto/projects/[id]/members/[memberId] so the combine card
// (tasker 122) can remove the people who would otherwise gain access through a
// combine, through the exact same checks: admin on the project (session client
// RPC), the member row must be live and not the owner, and
// `update_project_membership_guarded` does the guarded write. The route maps
// each result to the same response it always returned.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

type Client = SupabaseClient<Database>;

export type RemoveProjectMemberOperation =
	| 'project_members_access'
	| 'project_members_fetch'
	| 'project_members_remove';

export type RemovedProjectMember = {
	id: string;
	actor_id: string;
	role_key: string;
	access: string;
};

export type RemoveProjectMemberResult =
	| { ok: true; memberId: string; removed: RemovedProjectMember }
	| { ok: false; reason: 'access_check_failed'; error: unknown }
	| { ok: false; reason: 'forbidden' }
	| { ok: false; reason: 'member_lookup_failed'; error: unknown }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'already_removed' }
	| { ok: false; reason: 'owner' }
	| { ok: false; reason: 'remove_failed'; error: unknown }
	/** Changed by another collaborator between the read and the guarded write. */
	| { ok: false; reason: 'conflict' };

/**
 * Throws only what `ensureActorId` throws (the route answers that with its
 * generic 500). `onError` receives each database failure for logging.
 */
export async function removeProjectMember(params: {
	supabase: Client;
	userId: string;
	projectId: string;
	memberId: string;
	onError?: (failure: {
		error: unknown;
		operation: RemoveProjectMemberOperation;
		tableName?: 'onto_project_members';
	}) => Promise<void> | void;
}): Promise<RemoveProjectMemberResult> {
	const { supabase, userId, projectId, memberId, onError } = params;
	const actorId = await ensureActorId(supabase, userId);

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_member_access',
		{
			p_project_id: projectId,
			p_required_access: 'admin'
		}
	);

	if (accessError) {
		await onError?.({ error: accessError, operation: 'project_members_access' });
		return { ok: false, reason: 'access_check_failed', error: accessError };
	}

	if (!hasAccess) {
		return { ok: false, reason: 'forbidden' };
	}

	const { data: member, error: memberError } = await supabase
		.from('onto_project_members')
		.select('id, actor_id, role_key, access, removed_at')
		.eq('id', memberId)
		.eq('project_id', projectId)
		.maybeSingle();

	if (memberError) {
		await onError?.({
			error: memberError,
			operation: 'project_members_fetch',
			tableName: 'onto_project_members'
		});
		return { ok: false, reason: 'member_lookup_failed', error: memberError };
	}

	if (!member) {
		return { ok: false, reason: 'not_found' };
	}

	if (member.removed_at) {
		return { ok: false, reason: 'already_removed' };
	}

	if (member.role_key === 'owner') {
		return { ok: false, reason: 'owner' };
	}

	const { data: removedMember, error: updateError } = await (supabase as any).rpc(
		'update_project_membership_guarded',
		{ p_project: projectId, p_member: memberId, p_action: 'remove' }
	);

	if (updateError) {
		await onError?.({
			error: updateError,
			operation: 'project_members_remove',
			tableName: 'onto_project_members'
		});
		return { ok: false, reason: 'remove_failed', error: updateError };
	}

	if (!removedMember) {
		const { data: latestMember } = await supabase
			.from('onto_project_members')
			.select('id, role_key, removed_at')
			.eq('id', memberId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (!latestMember) {
			return { ok: false, reason: 'not_found' };
		}

		if (latestMember.removed_at) {
			return { ok: false, reason: 'already_removed' };
		}

		if (latestMember.role_key === 'owner') {
			return { ok: false, reason: 'owner' };
		}

		return { ok: false, reason: 'conflict' };
	}

	await supabase.from('onto_project_logs').insert({
		project_id: projectId,
		entity_type: 'project',
		entity_id: projectId,
		action: 'updated',
		changed_by: userId,
		changed_by_actor_id: actorId,
		change_source: 'api',
		after_data: {
			event: 'member_removed',
			member_id: memberId,
			actor_id: removedMember.actor_id,
			role_key: removedMember.role_key,
			access: removedMember.access
		}
	});

	return {
		ok: true,
		memberId,
		removed: {
			id: memberId,
			actor_id: removedMember.actor_id,
			role_key: removedMember.role_key,
			access: removedMember.access
		}
	};
}
