// apps/worker/src/lib/projectAccess.ts
// Service-role twin of web's requireProjectMemberAccess: does this user own the
// project or hold an active membership at the required level? Queue processors
// call it with job.userId (the queue row owner) before acting on a project
// named in metadata.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export type ProjectAccessLevel = 'read' | 'write' | 'admin';

/** False when the user has no actor, the project is gone, or access is missing. Throws on DB errors. */
export async function userHasProjectAccess(
	client: SupabaseClient<Database>,
	userId: string | null | undefined,
	projectId: string | null | undefined,
	requiredAccess: ProjectAccessLevel = 'read'
): Promise<boolean> {
	if (!userId || !projectId) return false;
	const { data: actor, error: actorError } = await client
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (actorError) throw new Error(`Failed to resolve actor: ${actorError.message}`);
	if (!actor?.id) return false;

	const { data, error } = await client.rpc('actor_has_project_member_access', {
		p_actor_id: actor.id,
		p_project_id: projectId,
		p_required_access: requiredAccess
	});
	if (error) throw new Error(`Failed to check project access: ${error.message}`);
	return data === true;
}

/**
 * The project a chat session is scoped to, or null unless the session's owner can reach it.
 *
 * `chat_sessions.context_type` and `entity_id` are written by the signed-in user (the close
 * route takes them from the request, and the table's own-row policy allows a direct update), so
 * a session can name any project id. Processors run with the service role, so they must not
 * read or write a project on the strength of that column alone.
 */
export async function accessibleSessionProjectId(
	client: SupabaseClient<Database>,
	userId: string | null | undefined,
	session: { context_type?: string | null; entity_id?: string | null } | null | undefined,
	requiredAccess: ProjectAccessLevel = 'read'
): Promise<string | null> {
	if (session?.context_type !== 'project' || !session.entity_id) return null;
	return (await userHasProjectAccess(client, userId, session.entity_id, requiredAccess))
		? session.entity_id
		: null;
}
