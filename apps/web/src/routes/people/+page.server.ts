// apps/web/src/routes/people/+page.server.ts
//
// /people: find someone by handle, answer requests, see what you asked for and
// what people shared with you. Everything here runs on the user-scoped client;
// the request RPCs check who is asking themselves.

import type { PageServerLoad } from './$types';
import { redirectToLogin } from '$lib/server/auth-redirects';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import {
	readPeopleRequests,
	type OwnedProjectOption,
	type PeopleProfile,
	type PeopleRequests,
	type SharedWithYouProject
} from '$lib/components/people/people-types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		redirectToLogin(url);
	}

	const supabase = locals.supabase;

	const [requestsResult, profileResult, projects] = await Promise.all([
		supabase.rpc('list_people_requests', {}),
		supabase
			.from('users')
			.select('username, discoverability, accepts_agent_requests')
			.eq('id', user.id)
			.maybeSingle(),
		ensureActorId(supabase, user.id)
			.then((actorId) => fetchProjectSummaries(supabase, actorId, locals.serverTiming))
			.catch((error) => {
				console.error('[People] Failed to load projects', error);
				return null;
			})
	]);

	let requests: PeopleRequests = { incoming: [], outgoing: [] };
	const errors: string[] = [];
	if (requestsResult.error) {
		console.error('[People] Failed to load requests', requestsResult.error);
		errors.push('requests');
	} else {
		requests = readPeopleRequests(requestsResult.data);
	}
	if (projects === null) errors.push('projects');

	const profileRow = profileResult.data as {
		username?: string | null;
		discoverability?: string | null;
		accepts_agent_requests?: boolean | null;
	} | null;
	const profile: PeopleProfile = {
		username: profileRow?.username?.trim() || null,
		discoverability: profileRow?.discoverability === 'handle' ? 'handle' : 'none',
		accepts_agent_requests: profileRow?.accepts_agent_requests !== false
	};

	// Only projects you own can be shared (decide_people_request enforces it too).
	const ownedProjects: OwnedProjectOption[] = (projects ?? [])
		.filter((project) => !project.is_shared)
		.map((project) => ({ id: project.id, name: project.name?.trim() || 'Untitled project' }));

	const shared = (projects ?? []).filter((project) => project.is_shared);
	const ownerIds = Array.from(
		new Set(shared.map((project) => project.owner_actor_id).filter(Boolean))
	) as string[];
	const ownerNames = new Map<string, string>();
	if (ownerIds.length > 0) {
		const { data: owners, error: ownersError } = await supabase
			.from('onto_actors')
			.select('id, name')
			.in('id', ownerIds);
		if (ownersError) {
			console.error('[People] Failed to load project owners', ownersError);
		}
		for (const owner of owners ?? []) {
			if (owner?.id && owner.name?.trim()) ownerNames.set(owner.id, owner.name.trim());
		}
	}

	const sharedWithYou: SharedWithYouProject[] = shared.map((project) => ({
		id: project.id,
		name: project.name?.trim() || 'Untitled project',
		owner_name: project.owner_actor_id
			? (ownerNames.get(project.owner_actor_id) ?? null)
			: null,
		role: project.access_role === 'editor' ? 'editor' : 'viewer'
	}));

	return {
		requests,
		profile,
		ownedProjects,
		sharedWithYou,
		loadError:
			errors.length > 0
				? `Some of this page could not be loaded (${errors.join(', ')}). Refresh to try again.`
				: null
	};
};
