// apps/web/src/lib/server/people/people-hub.ts
//
// Data for Profile > People & agents: everyone you share your projects with
// (grouped by person, one row per project), the invites nobody answered, the
// projects people share with you, and the requests waiting on you. One call so
// the hub renders in one round trip.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import {
	readPeopleRequests,
	type PeopleProfile,
	type PeopleRequests
} from '$lib/components/people/people-types';
import type { AgentAccess, PersonRole } from '$lib/components/people/people-copy';
import type { HubInvite, HubPerson, PeopleHubData } from '$lib/components/people/hub/hub-types';
import { hideHandleInviteEmail } from './people-api';

export type * from '$lib/components/people/hub/hub-types';

type MemberRow = {
	id: string;
	project_id: string;
	actor_id: string;
	role_key: string | null;
	agent_access: string | null;
	created_at: string | null;
	joined_via_invite_link_id: string | null;
	actor: {
		id?: string;
		user_id?: string | null;
		name?: string | null;
		email?: string | null;
	} | null;
};

type InviteRow = {
	id: string;
	project_id: string;
	invitee_email: string | null;
	invitee_handle: string | null;
	role_key: string | null;
	agent_access: string | null;
	created_at: string;
	expires_at: string;
};

function readRole(value: string | null | undefined): PersonRole {
	return value === 'editor' ? 'editor' : 'viewer';
}

function readAgentAccess(value: string | null | undefined): AgentAccess {
	return value === 'off' || value === 'write' ? value : 'read';
}

function personLabel(row: MemberRow): string {
	const name = row.actor?.name?.trim();
	if (name) return name;
	const email = row.actor?.email?.trim();
	return email || 'Someone';
}

/** One entry per person across your projects, most-shared first. */
export function groupPeople(
	rows: MemberRow[],
	projectNames: Map<string, string>,
	handlesByUserId: Map<string, string>,
	myActorId: string
): HubPerson[] {
	const byActor = new Map<string, HubPerson>();
	for (const row of rows) {
		if (!row.actor_id || row.actor_id === myActorId) continue;
		if (row.role_key === 'owner') continue;
		const projectName = projectNames.get(row.project_id);
		if (!projectName) continue;
		let person = byActor.get(row.actor_id);
		if (!person) {
			const userId = row.actor?.user_id ?? null;
			person = {
				actor_id: row.actor_id,
				name: personLabel(row),
				handle: userId ? (handlesByUserId.get(userId) ?? null) : null,
				email: row.actor?.email?.trim() || null,
				memberships: []
			};
			byActor.set(row.actor_id, person);
		}
		person.memberships.push({
			member_id: row.id,
			project_id: row.project_id,
			project_name: projectName,
			role: readRole(row.role_key),
			agent_access: readAgentAccess(row.agent_access),
			joined_at: row.created_at,
			joined_via_link: Boolean(row.joined_via_invite_link_id)
		});
	}
	const people = Array.from(byActor.values());
	for (const person of people) {
		person.memberships.sort((a, b) => a.project_name.localeCompare(b.project_name));
	}
	return people.sort(
		(a, b) => b.memberships.length - a.memberships.length || a.name.localeCompare(b.name)
	);
}

/** Pending invites, with the ones past their expiry date called what they are. */
export function toHubInvites(
	rows: InviteRow[],
	projectNames: Map<string, string>,
	now: number = Date.now()
): HubInvite[] {
	return rows
		.filter((row) => projectNames.has(row.project_id))
		.map((row) => {
			const visible = hideHandleInviteEmail(row);
			const expiresAt = Date.parse(row.expires_at);
			return {
				id: row.id,
				project_id: row.project_id,
				project_name: projectNames.get(row.project_id) ?? 'Project',
				invitee_email: visible.invitee_email ?? null,
				invitee_handle: row.invitee_handle ?? null,
				role: readRole(row.role_key),
				agent_access: readAgentAccess(row.agent_access),
				created_at: row.created_at,
				expires_at: row.expires_at,
				effective_status:
					Number.isFinite(expiresAt) && expiresAt < now ? 'expired' : 'pending'
			} satisfies HubInvite;
		})
		.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * Loads the hub. `supabase` is the user-scoped client (RLS limits members and
 * invites to projects you can manage); `admin` is used only to read the @handles
 * of people already in your projects.
 */
export async function loadPeopleHub({
	supabase,
	admin,
	userId
}: {
	supabase: SupabaseClient;
	admin: SupabaseClient;
	userId: string;
}): Promise<PeopleHubData> {
	const errors: string[] = [];
	const actorId = await ensureActorId(supabase as any, userId);

	const [requestsResult, profileResult, projects] = await Promise.all([
		supabase.rpc('list_people_requests', {}),
		supabase
			.from('users')
			.select('username, discoverability, accepts_agent_requests')
			.eq('id', userId)
			.maybeSingle(),
		fetchProjectSummaries(supabase as any, actorId).catch((error) => {
			console.error('[PeopleHub] Failed to load projects', error);
			return null;
		})
	]);

	let requests: PeopleRequests = { incoming: [], outgoing: [] };
	if (requestsResult.error) {
		console.error('[PeopleHub] Failed to load requests', requestsResult.error);
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

	const owned = (projects ?? []).filter(
		(project) => !project.is_shared && project.kind !== 'workspace'
	);
	const shared = (projects ?? []).filter((project) => project.is_shared);
	const ownedIds = owned.map((project) => project.id);
	const sharedIds = shared.map((project) => project.id);
	const projectNames = new Map(
		owned.map((project) => [project.id, project.name?.trim() || 'Untitled project'])
	);

	const ownerIds = Array.from(
		new Set(shared.map((project) => project.owner_actor_id).filter(Boolean))
	) as string[];

	const [
		membersResult,
		invitesResult,
		settingsResult,
		restrictedResult,
		myRowsResult,
		ownersResult
	] = await Promise.all([
		ownedIds.length > 0
			? supabase
					.from('onto_project_members')
					.select(
						'id, project_id, actor_id, role_key, agent_access, created_at, joined_via_invite_link_id, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)'
					)
					.in('project_id', ownedIds)
					.is('removed_at', null)
			: Promise.resolve({ data: [], error: null }),
		ownedIds.length > 0
			? supabase
					.from('onto_project_invites')
					.select(
						'id, project_id, invitee_email, invitee_handle, role_key, agent_access, created_at, expires_at'
					)
					.in('project_id', ownedIds)
					.eq('status', 'pending')
			: Promise.resolve({ data: [], error: null }),
		ownedIds.length > 0
			? supabase
					.from('project_agent_settings')
					.select('project_id, editor_agents_write')
					.in('project_id', ownedIds)
			: Promise.resolve({ data: [], error: null }),
		ownedIds.length > 0
			? supabase.from('onto_projects').select('id, external_agent_access').in('id', ownedIds)
			: Promise.resolve({ data: [], error: null }),
		sharedIds.length > 0
			? supabase
					.from('onto_project_members')
					.select('project_id, role_key, agent_access')
					.eq('actor_id', actorId)
					.in('project_id', sharedIds)
					.is('removed_at', null)
			: Promise.resolve({ data: [], error: null }),
		ownerIds.length > 0
			? supabase.from('onto_actors').select('id, name').in('id', ownerIds)
			: Promise.resolve({ data: [], error: null })
	]);

	if (membersResult.error) {
		console.error('[PeopleHub] Failed to load members', membersResult.error);
		errors.push('people');
	}
	if (invitesResult.error) {
		console.error('[PeopleHub] Failed to load invites', invitesResult.error);
		errors.push('invites');
	}

	const memberRows = (membersResult.data ?? []) as unknown as MemberRow[];
	const userIds = Array.from(
		new Set(
			memberRows
				.filter((row) => row.actor_id !== actorId)
				.map((row) => row.actor?.user_id)
				.filter((id): id is string => typeof id === 'string')
		)
	);
	const handlesByUserId = new Map<string, string>();
	if (userIds.length > 0) {
		const { data: handleRows, error: handleError } = await admin
			.from('users')
			.select('id, username')
			.in('id', userIds);
		if (handleError) console.error('[PeopleHub] Failed to load handles', handleError);
		for (const row of (handleRows ?? []) as { id: string; username: string | null }[]) {
			if (row.username?.trim()) handlesByUserId.set(row.id, row.username.trim());
		}
	}

	const editorsWrite = new Set(
		((settingsResult.data ?? []) as { project_id: string; editor_agents_write: boolean }[])
			.filter((row) => row.editor_agents_write)
			.map((row) => row.project_id)
	);
	const restricted = new Set(
		((restrictedResult.data ?? []) as { id: string; external_agent_access: string | null }[])
			.filter((row) => row.external_agent_access === 'restricted')
			.map((row) => row.id)
	);
	const ownerNames = new Map<string, string>();
	for (const owner of (ownersResult.data ?? []) as { id: string; name: string | null }[]) {
		if (owner.name?.trim()) ownerNames.set(owner.id, owner.name.trim());
	}
	const myRows = new Map(
		(
			(myRowsResult.data ?? []) as {
				project_id: string;
				role_key: string;
				agent_access: string;
			}[]
		).map((row) => [row.project_id, row])
	);

	return {
		profile,
		requests,
		ownedProjects: owned
			.map((project) => ({
				id: project.id,
				name: projectNames.get(project.id) ?? 'Untitled project',
				editor_agents_write: editorsWrite.has(project.id),
				restricted: restricted.has(project.id)
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		people: groupPeople(memberRows, projectNames, handlesByUserId, actorId),
		invites: toHubInvites((invitesResult.data ?? []) as InviteRow[], projectNames),
		sharedWithYou: shared.map((project) => {
			const mine = myRows.get(project.id);
			return {
				id: project.id,
				name: project.name?.trim() || 'Untitled project',
				owner_name: project.owner_actor_id
					? (ownerNames.get(project.owner_actor_id) ?? null)
					: null,
				role: readRole(mine?.role_key ?? project.access_role),
				agent_access: readAgentAccess(mine?.agent_access)
			};
		}),
		loadError:
			errors.length > 0
				? `Some of this could not be loaded (${errors.join(', ')}). Refresh to try again.`
				: null
	};
}
