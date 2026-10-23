// apps/web/src/lib/components/people/people-types.ts
//
// Shapes the /people page works with, and readers that turn RPC/API JSON into
// them (dropping anything malformed instead of trusting it). Used by the page
// load, the page itself after a refresh, and tests.

import { isAgentAccess, isPersonRole, type AgentAccess, type PersonRole } from './people-copy';

export type IncomingPeopleRequest = {
	id: string;
	created_at: string;
	expires_at: string | null;
	/** access = wants to see your projects; rejoin = a former member used the project's link. */
	kind: 'access' | 'rejoin';
	/** The project a rejoin is about. */
	project: { id: string; name: string } | null;
	agent_access_requested: AgentAccess | null;
	role_requested: PersonRole;
	project_hint: string | null;
	note: string | null;
	via: 'web' | 'agent';
	via_agent_label: string | null;
	from: { name: string | null; handle: string | null; email: string | null };
};

export type OutgoingPeopleRequest = {
	id: string;
	created_at: string;
	decided_at: string | null;
	status: 'pending' | 'approved' | 'declined' | 'expired' | 'canceled';
	role_requested: PersonRole;
	project_hint: string | null;
	via: 'web' | 'agent';
	to: { name: string | null; handle: string | null };
};

export type PeopleRequests = {
	incoming: IncomingPeopleRequest[];
	outgoing: OutgoingPeopleRequest[];
};

export type FoundPerson = {
	handle: string;
	name: string | null;
	bio: string | null;
	is_self: boolean;
	accepts_agent_requests: boolean;
	relationship: { pending_request: boolean; projects_shared_with_you: number };
};

export type OwnedProjectOption = { id: string; name: string };

export type SharedWithYouProject = {
	id: string;
	name: string;
	owner_name: string | null;
	role: 'editor' | 'viewer';
};

export type PeopleProfile = {
	username: string | null;
	discoverability: 'none' | 'handle';
	accepts_agent_requests: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

const OUTGOING_STATUSES = new Set(['pending', 'approved', 'declined', 'expired', 'canceled']);

function readIncoming(value: unknown): IncomingPeopleRequest | null {
	const row = record(value);
	const id = text(row?.id);
	const createdAt = text(row?.created_at);
	if (!row || !id || !createdAt) return null;
	const from = record(row.from) ?? {};
	const project = record(row.project);
	const projectId = text(project?.id);
	const kind = row.kind === 'rejoin' && projectId ? 'rejoin' : 'access';
	return {
		id,
		created_at: createdAt,
		expires_at: text(row.expires_at),
		kind,
		project: projectId ? { id: projectId, name: text(project?.name) ?? 'your project' } : null,
		agent_access_requested: isAgentAccess(row.agent_access_requested)
			? row.agent_access_requested
			: null,
		role_requested: isPersonRole(row.role_requested) ? row.role_requested : 'viewer',
		project_hint: text(row.project_hint),
		note: text(row.note),
		via: row.via === 'agent' ? 'agent' : 'web',
		via_agent_label: text(row.via_agent_label),
		from: { name: text(from.name), handle: text(from.handle), email: text(from.email) }
	};
}

function readOutgoing(value: unknown): OutgoingPeopleRequest | null {
	const row = record(value);
	const id = text(row?.id);
	const createdAt = text(row?.created_at);
	if (!row || !id || !createdAt) return null;
	const to = record(row.to) ?? {};
	const status =
		typeof row.status === 'string' && OUTGOING_STATUSES.has(row.status)
			? (row.status as OutgoingPeopleRequest['status'])
			: 'pending';
	return {
		id,
		created_at: createdAt,
		decided_at: text(row.decided_at),
		status,
		role_requested: isPersonRole(row.role_requested) ? row.role_requested : 'viewer',
		project_hint: text(row.project_hint),
		via: row.via === 'agent' ? 'agent' : 'web',
		to: { name: text(to.name), handle: text(to.handle) }
	};
}

/** Reads list_people_requests output (or GET /api/people/requests data). */
export function readPeopleRequests(value: unknown): PeopleRequests {
	const result = record(value) ?? {};
	const incoming = Array.isArray(result.incoming) ? result.incoming : [];
	const outgoing = Array.isArray(result.outgoing) ? result.outgoing : [];
	return {
		incoming: incoming
			.map(readIncoming)
			.filter((row): row is IncomingPeopleRequest => row !== null),
		outgoing: outgoing
			.map(readOutgoing)
			.filter((row): row is OutgoingPeopleRequest => row !== null)
	};
}

/** Reads a find_person_by_handle result; null unless someone was found. */
export function readFoundPerson(value: unknown): FoundPerson | null {
	const row = record(value);
	const handle = text(row?.handle);
	if (!row || row.found !== true || !handle) return null;
	const relationship = record(row.relationship) ?? {};
	const shared = Number(relationship.projects_shared_with_you);
	return {
		handle,
		name: text(row.name),
		bio: text(row.bio),
		is_self: row.is_self === true,
		accepts_agent_requests: row.accepts_agent_requests !== false,
		relationship: {
			pending_request: relationship.pending_request === true,
			projects_shared_with_you: Number.isFinite(shared) && shared > 0 ? Math.floor(shared) : 0
		}
	};
}

/** What to call someone on this page: name, else @handle, else email. */
export function personName(person: {
	name?: string | null;
	handle?: string | null;
	email?: string | null;
}): string {
	return (
		person.name?.trim() ||
		(person.handle ? `@${person.handle}` : '') ||
		person.email?.trim() ||
		'Someone'
	);
}
