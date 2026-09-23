// apps/worker/src/scheduler/operativeProjectAccess.ts
import type { AgentOperativeRowShape } from '@buildos/shared-types';

import { supabase } from '../lib/supabase';

/**
 * Scheduled runs spend money with nobody watching, so a project-bound Operative
 * re-checks what web enforced at save time (assertAgentOperativeProjectAccess):
 * the project still exists and the owner is still a member. `revoked` means the
 * schedule can never succeed again; otherwise the check itself failed.
 */
export async function checkOperativeProjectAccess(
	operative: Pick<AgentOperativeRowShape, 'project_id' | 'user_id'>
): Promise<{ ok: true } | { ok: false; revoked: boolean; message: string }> {
	if (!operative.project_id) return { ok: true };

	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id')
		.eq('id', operative.project_id)
		.is('deleted_at', null)
		.maybeSingle();
	if (projectError) {
		return {
			ok: false,
			revoked: false,
			message: `Failed to check project: ${projectError.message}`
		};
	}
	if (!project) {
		return { ok: false, revoked: true, message: 'Schedule stopped: the project was deleted' };
	}

	const { data: actor, error: actorError } = await supabase
		.from('onto_actors')
		.select('id')
		.eq('user_id', operative.user_id)
		.maybeSingle();
	if (actorError) {
		return {
			ok: false,
			revoked: false,
			message: `Failed to check project access: ${actorError.message}`
		};
	}
	const { data: membership, error: membershipError } = actor?.id
		? await supabase
				.from('onto_project_members')
				.select('project_id')
				.eq('actor_id', actor.id)
				.eq('project_id', operative.project_id)
				.is('removed_at', null)
				.maybeSingle()
		: { data: null, error: null };
	if (membershipError) {
		return {
			ok: false,
			revoked: false,
			message: `Failed to check project access: ${membershipError.message}`
		};
	}
	if (!membership) {
		return {
			ok: false,
			revoked: true,
			message: 'Schedule stopped: you no longer have access to this project'
		};
	}
	return { ok: true };
}
