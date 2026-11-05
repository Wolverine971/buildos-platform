// packages/shared-agent-ops/src/calendar/project-member-targets.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Member fan-out reads project_calendars, and a mapping row outlives membership
 * (removal only sets removed_at). Keep only users who still own the project or
 * are active members, so task details never go to someone who lost access.
 */
export async function filterToActiveProjectMembers(
	client: SupabaseClient<Database>,
	projectId: string,
	userIds: string[]
): Promise<string[]> {
	const unique = Array.from(new Set(userIds.filter(Boolean)));
	if (unique.length === 0) return [];

	const { data: actors, error: actorError } = await client
		.from('onto_actors')
		.select('id, user_id')
		.in('user_id', unique);
	if (actorError) throw new Error(actorError.message);

	const userByActor = new Map<string, string>();
	for (const actor of actors ?? []) {
		if (actor?.id && actor.user_id) userByActor.set(actor.id, actor.user_id);
	}
	if (userByActor.size === 0) return [];

	const [projectResult, memberResult] = await Promise.all([
		client
			.from('onto_projects')
			.select('created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle(),
		client
			.from('onto_project_members')
			.select('actor_id')
			.eq('project_id', projectId)
			.is('removed_at', null)
			.in('actor_id', Array.from(userByActor.keys()))
	]);
	if (projectResult.error) throw new Error(projectResult.error.message);
	if (memberResult.error) throw new Error(memberResult.error.message);
	if (!projectResult.data) return [];

	const allowed = new Set<string>();
	const owner = userByActor.get(projectResult.data.created_by);
	if (owner) allowed.add(owner);
	for (const member of memberResult.data ?? []) {
		const userId = userByActor.get(member.actor_id);
		if (userId) allowed.add(userId);
	}
	return unique.filter((userId) => allowed.has(userId));
}
