import { onboardingStep } from '$lib/utils/onboarding-state';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';

/** Saves a milestone monotonically; an older tab cannot roll progress back. */
export async function saveOnboardingProgress(
	locals: App.Locals,
	userId: string,
	step: number,
	projectId?: string | null
): Promise<void> {
	const { supabase } = locals;
	const { data: user, error } = await supabase
		.from('users')
		.select(
			'onboarding_intent, onboarding_stakes, onboarding_step, onboarding_completed_at, onboarding_project_id'
		)
		.eq('id', userId)
		.single();
	if (error || !user) throw new Error('Could not load your saved setup. Please try again.');
	if (user.onboarding_completed_at) return;
	if (!user.onboarding_intent || !user.onboarding_stakes)
		throw new Error('Choose your intent and stakes before continuing.');

	const selectedProject = projectId === undefined ? user.onboarding_project_id : projectId;
	if (selectedProject) {
		const access = await requireProjectMemberAccess({
			locals,
			user: { id: userId },
			projectId: selectedProject
		});
		if (!access.ok)
			throw new Error(
				'This project is no longer available. Choose another project to continue.'
			);
	} else if (step >= 2 && user.onboarding_intent !== 'explore') {
		throw new Error('Review your first project before continuing.');
	}

	const { error: saveError } = await supabase
		.from('users')
		.update({
			onboarding_step: Math.max(step, onboardingStep(user.onboarding_step)),
			...(projectId !== undefined ? { onboarding_project_id: projectId } : {})
		})
		.eq('id', userId)
		.lte('onboarding_step', Math.max(step, user.onboarding_step))
		.is('onboarding_completed_at', null);
	if (saveError)
		throw new Error('Could not save your progress. Your project is safe; please try again.');
}
