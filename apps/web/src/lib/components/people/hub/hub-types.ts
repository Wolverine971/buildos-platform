// apps/web/src/lib/components/people/hub/hub-types.ts
//
// Shapes for Profile > People & agents (GET /api/people/hub). Client-safe; the
// loader lives in $lib/server/people/people-hub.ts.

import type {
	OwnedProjectOption,
	PeopleProfile,
	PeopleRequests
} from '$lib/components/people/people-types';
import type { AgentAccess, PersonRole } from '$lib/components/people/people-copy';

export type HubMembership = {
	member_id: string;
	project_id: string;
	project_name: string;
	role: PersonRole;
	agent_access: AgentAccess;
	joined_at: string | null;
	joined_via_link: boolean;
};

export type HubPerson = {
	actor_id: string;
	name: string;
	handle: string | null;
	/** You own every project listed, so you see the email they were invited with. */
	email: string | null;
	memberships: HubMembership[];
};

export type HubInvite = {
	id: string;
	project_id: string;
	project_name: string;
	/** Null for invites sent to an @handle: the email behind a handle stays private. */
	invitee_email: string | null;
	invitee_handle: string | null;
	role: PersonRole;
	agent_access: AgentAccess;
	created_at: string;
	expires_at: string;
	effective_status: 'pending' | 'expired';
};

export type HubSharedProject = {
	id: string;
	name: string;
	owner_name: string | null;
	role: PersonRole;
	/** What the owner lets your agents do there. */
	agent_access: AgentAccess;
};

export type HubProject = OwnedProjectOption & {
	/** "Editors' agents can make changes" is on for this project. */
	editor_agents_write: boolean;
	restricted: boolean;
};

export type PeopleHubData = {
	profile: PeopleProfile;
	requests: PeopleRequests;
	/** Every project you own (not the Workspace): what you can share. */
	ownedProjects: HubProject[];
	people: HubPerson[];
	invites: HubInvite[];
	sharedWithYou: HubSharedProject[];
	loadError: string | null;
};
