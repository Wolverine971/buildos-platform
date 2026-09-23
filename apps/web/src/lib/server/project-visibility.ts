// apps/web/src/lib/server/project-visibility.ts
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

type Supabase = App.Locals['supabase'];

export type ProjectVisibilityPreflight = {
	hasProjects: boolean;
	actorId: string | null;
};

/**
 * Does this user have any project (as a member or creator)? Head-count queries only, no rows.
 * Some existing users have projects while `onboarding_completed_at` is still null, so that flag
 * alone can't say whether someone is new.
 */
export async function preflightProjectVisibility(
	supabase: Supabase,
	userId: string
): Promise<ProjectVisibilityPreflight> {
	try {
		const actorId = await ensureActorId(supabase, userId);

		const [memberResult, ownedResult] = await Promise.all([
			supabase
				.from('onto_project_members')
				.select('id', { count: 'exact', head: true })
				.eq('actor_id', actorId)
				.is('removed_at', null),
			supabase
				.from('onto_projects')
				.select('id', { count: 'exact', head: true })
				.eq('created_by', actorId)
				.is('deleted_at', null)
		]);

		if (memberResult.error) {
			console.warn(
				'[ProjectVisibility] Failed to count project memberships:',
				memberResult.error
			);
		}
		if (ownedResult.error) {
			console.warn('[ProjectVisibility] Failed to count owned projects:', ownedResult.error);
		}

		if ((memberResult.count ?? 0) > 0) {
			return { hasProjects: true, actorId };
		}
		if (memberResult.error && ownedResult.error) {
			return { hasProjects: false, actorId };
		}
		return { hasProjects: (ownedResult.count ?? 0) > 0, actorId };
	} catch (error) {
		console.warn('[ProjectVisibility] Failed to preflight project visibility:', error);
		return { hasProjects: false, actorId: null };
	}
}

/**
 * Whether a signed-in user belongs in /onboarding rather than the app: the onboarding flag is
 * unset AND they have no projects. The project check only runs when the flag is unset.
 */
export async function needsOnboarding(
	supabase: Supabase,
	user: { id: string; onboarding_completed_at?: string | null }
): Promise<boolean> {
	if (user.onboarding_completed_at) return false;
	const { hasProjects } = await preflightProjectVisibility(supabase, user.id);
	return !hasProjects;
}
