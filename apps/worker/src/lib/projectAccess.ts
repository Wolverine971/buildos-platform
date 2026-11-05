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
