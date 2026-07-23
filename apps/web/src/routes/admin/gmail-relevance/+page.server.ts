// apps/web/src/routes/admin/gmail-relevance/+page.server.ts
import { env as privateEnv } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isGmailRelevancePhaseAUserAllowed } from '$lib/server/gmail-relevance/config';
import { compileProjectEmailProfile } from '$lib/server/gmail-relevance/project-email-profile';
import {
	buildProjectEmailProfileCandidates,
	getProjectEmailProfileSnapshotAt,
	type BuildProjectEmailProfileCandidatesInput,
	type ProjectEmailProfileDocumentRow,
	type ProjectEmailProfileEventRow,
	type ProjectEmailProfileGoalRow,
	type ProjectEmailProfileMemberRow,
	type ProjectEmailProfileMilestoneRow,
	type ProjectEmailProfileProjectRow,
	type ProjectEmailProfileTaskRow
} from '$lib/server/gmail-relevance/project-email-profile-sources';

type OwnedProjectRow = ProjectEmailProfileProjectRow & { created_by: string };

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();
	if (!user) throw redirect(303, '/auth/login');
	if (!isGmailRelevancePhaseAUserAllowed(user.id, privateEnv)) {
		throw error(404, 'Not found');
	}

	// This preview is deliberately read-only. Do not call ensureActorId here because
	// that helper may create an actor row for a user who does not already have one.
	const { data: actor, error: actorError } = await supabase
		.from('onto_actors')
		.select('id')
		.eq('user_id', user.id)
		.maybeSingle();
	if (actorError) throw error(500, 'Could not load the Phase A preview');
	if (!actor) {
		return { projects: [], selectedProjectId: null, profile: null };
	}

	const [
		{ data: ownerMemberships, error: membershipError },
		{ data: projectRows, error: projectError }
	] = await Promise.all([
		supabase
			.from('onto_project_members')
			.select('project_id')
			.eq('actor_id', actor.id)
			.eq('role_key', 'owner')
			.is('removed_at', null),
		supabase
			.from('onto_projects')
			.select(
				'id, name, description, next_step_short, next_step_long, props, updated_at, created_by'
			)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(200)
	]);

	if (membershipError || projectError) throw error(500, 'Could not load the Phase A preview');

	const ownerProjectIds = new Set((ownerMemberships ?? []).map((row) => row.project_id));
	const ownedProjects = ((projectRows ?? []) as OwnedProjectRow[]).filter(
		(project) => project.created_by === actor.id || ownerProjectIds.has(project.id)
	);
	const requestedProjectId = url.searchParams.get('project_id');
	const selectedProject = requestedProjectId
		? ownedProjects.find((project) => project.id === requestedProjectId)
		: ownedProjects[0];

	if (requestedProjectId && !selectedProject) throw error(404, 'Project not found');
	if (!selectedProject) {
		return { projects: [], selectedProjectId: null, profile: null };
	}

	const [
		tasksResult,
		documentsResult,
		goalsResult,
		milestonesResult,
		eventsResult,
		membersResult
	] = await Promise.all([
		supabase
			.from('onto_tasks')
			.select('id, title, description, state_key, props, updated_at')
			.eq('project_id', selectedProject.id)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(60),
		supabase
			.from('onto_documents')
			.select('id, title, description, props, updated_at')
			.eq('project_id', selectedProject.id)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(60),
		supabase
			.from('onto_goals')
			.select('id, name, description, goal, updated_at')
			.eq('project_id', selectedProject.id)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(30),
		supabase
			.from('onto_milestones')
			.select('id, title, description, milestone, updated_at')
			.eq('project_id', selectedProject.id)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(30),
		supabase
			.from('onto_events')
			.select('id, title, description, external_link, updated_at')
			.eq('project_id', selectedProject.id)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(30),
		supabase
			.from('onto_project_members')
			.select(
				'id, role_name, role_description, actor:onto_actors!onto_project_members_actor_id_fkey(id, name, email, user_id)'
			)
			.eq('project_id', selectedProject.id)
			.is('removed_at', null)
			.limit(50)
	]);

	if (
		tasksResult.error ||
		documentsResult.error ||
		goalsResult.error ||
		milestonesResult.error ||
		eventsResult.error ||
		membersResult.error
	) {
		throw error(500, 'Could not compile the Phase A preview');
	}

	const sourceInput: BuildProjectEmailProfileCandidatesInput = {
		user_id: user.id,
		project: selectedProject,
		tasks: (tasksResult.data ?? []) as ProjectEmailProfileTaskRow[],
		documents: (documentsResult.data ?? []) as ProjectEmailProfileDocumentRow[],
		goals: (goalsResult.data ?? []) as ProjectEmailProfileGoalRow[],
		milestones: (milestonesResult.data ?? []) as ProjectEmailProfileMilestoneRow[],
		events: (eventsResult.data ?? []) as ProjectEmailProfileEventRow[],
		members: (membersResult.data ?? []) as unknown as ProjectEmailProfileMemberRow[],
		nearby_projects: ownedProjects.map(({ id, name, updated_at }) => ({ id, name, updated_at }))
	};
	const profile = compileProjectEmailProfile({
		user_id: user.id,
		project_id: selectedProject.id,
		profile_version: 1,
		source_snapshot_at: getProjectEmailProfileSnapshotAt(sourceInput),
		candidates: buildProjectEmailProfileCandidates(sourceInput)
	});

	return {
		projects: ownedProjects.map(({ id, name }) => ({ id, name })),
		selectedProjectId: selectedProject.id,
		profile
	};
};
