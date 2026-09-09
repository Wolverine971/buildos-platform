// apps/web/src/routes/onboarding/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { onboardingStep } from '$lib/utils/onboarding-state';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';

type OnboardingProjectPreview = {
	id: string;
	name: string;
	description: string | null;
	status: string;
	created_at: string | null;
	task_count: number;
};

function toLegacyStatus(stateKey: string | null | undefined): string {
	switch ((stateKey || '').toLowerCase()) {
		case 'planning':
		case 'active':
		case 'project.state.active':
			return 'active';
		case 'paused':
		case 'project.state.paused':
			return 'paused';
		case 'completed':
		case 'project.state.completed':
			return 'completed';
		case 'cancelled':
		case 'project.state.archived':
			return 'archived';
		default:
			return 'active';
	}
}

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase },
	depends,
	url
}) => {
	depends('app:onboarding');
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// safeGetSession returns the freshly loaded public profile, including saved milestones.
	if (user.onboarding_completed_at) {
		throw redirect(303, '/today');
	}

	// Load any existing projects so the capture step can preview them.
	// New users start with none; users who created a project mid-onboarding
	// (and reloaded or returned via OAuth) will see what they already have.
	let existingProjects: OnboardingProjectPreview[] = [];
	try {
		const actorId = await ensureActorId(supabase, user.id);
		const summaries = await fetchProjectSummaries(supabase, actorId);
		existingProjects = summaries
			.filter((p) => {
				const status = toLegacyStatus(p.state_key);
				return status === 'active';
			})
			.slice(0, 6)
			.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				status: toLegacyStatus(p.state_key),
				created_at: p.created_at,
				task_count: p.task_count ?? 0
			}));
	} catch (error) {
		console.error('Error fetching existing projects for onboarding:', error);
	}

	return {
		user,
		existingProjects,
		calendarReturn: url.searchParams.get('calendar') === '1',
		savedStep: onboardingStep(
			user.onboarding_step,
			user.onboarding_intent,
			user.onboarding_stakes
		),
		savedProjectId: user.onboarding_project_id ?? null,
		savedIntent: user.onboarding_intent,
		savedStakes: user.onboarding_stakes
	};
};
