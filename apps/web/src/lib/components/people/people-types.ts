// apps/web/src/lib/components/people/people-types.ts
//
// Shapes the /people page works with, and readers that turn RPC/API JSON into
// them (dropping anything malformed instead of trusting it). Used by the page
// load, the page itself after a refresh, and tests.

import { isAgentAccess, isPersonRole, type AgentAccess, type PersonRole } from './people-copy';
import type { ProjectArrivalStatus } from './project-arrival';

/** What a member asked for in a project they're already in (tasker 140). */
export type UpgradeNeed = 'agents_read' | 'agents_write' | 'edit';

/** One project in an upgrade request, with what the member has there now. */
export type UpgradeRequestItem = {
	project_id: string;
	project_name: string;
	need: UpgradeNeed;
	/** Their role there now (viewer/editor), when known. */
	role: string | null;
	/** What their agents may do there now, when known. */
	agent_access: AgentAccess | null;
	/** The project's standing approval ("editors' agents can make changes") is already on. */
	editor_agents_write: boolean;
};

export type IncomingPeopleRequest = {
	id: string;
	created_at: string;
	expires_at: string | null;
	/**
	 * access = wants to see your projects; rejoin = a former member used the project's
	 * link; upgrade = a member (or their agent) wants more in projects they're already in.
	 */
	kind: 'access' | 'rejoin' | 'upgrade';
	/** The project a rejoin is about; for an upgrade, the first project asked about. */
	project: { id: string; name: string } | null;
	/** Upgrade only: each project asked about (1 to 10, all yours). Empty otherwise. */
	items: UpgradeRequestItem[];
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
	kind: 'access' | 'rejoin' | 'upgrade';
	settled_elsewhere: boolean;
	/** Only structured grants returned for the owner's decision, never inferred from a hint. */
	projects: Array<{
		project_id: string;
		project_name: string;
		role: PersonRole;
		agent_access: AgentAccess;
		status?: ProjectArrivalStatus;
	}>;
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

function isUpgradeNeed(value: unknown): value is UpgradeNeed {
	return value === 'agents_read' || value === 'agents_write' || value === 'edit';
}

/** Upgrade items, dropping malformed ones and repeats of a project. */
function readUpgradeItems(value: unknown): UpgradeRequestItem[] {
	if (!Array.isArray(value)) return [];
	const items: UpgradeRequestItem[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		const item = record(entry);
		const projectId = text(item?.project_id);
		if (!item || !projectId || !isUpgradeNeed(item.need) || seen.has(projectId)) continue;
		seen.add(projectId);
		items.push({
			project_id: projectId,
			project_name: text(item.project_name) ?? 'your project',
			need: item.need,
			role: text(item.role),
			agent_access: isAgentAccess(item.agent_access) ? item.agent_access : null,
			editor_agents_write: item.editor_agents_write === true
		});
	}
	return items;
}

function readIncoming(value: unknown): IncomingPeopleRequest | null {
	const row = record(value);
	const id = text(row?.id);
	const createdAt = text(row?.created_at);
	if (!row || !id || !createdAt) return null;
	const from = record(row.from) ?? {};
	const project = record(row.project);
	const projectId = text(project?.id);
	// An upgrade with nothing readable to approve isn't shown at all.
	const items = row.kind === 'upgrade' ? readUpgradeItems(row.items) : [];
	if (row.kind === 'upgrade' && items.length === 0) return null;
	const kind =
		row.kind === 'upgrade'
			? 'upgrade'
			: row.kind === 'rejoin' && projectId
				? 'rejoin'
				: 'access';
	const firstItem = items[0];
	return {
		id,
		created_at: createdAt,
		expires_at: text(row.expires_at),
		kind,
		project: projectId
			? { id: projectId, name: text(project?.name) ?? 'your project' }
			: firstItem
				? { id: firstItem.project_id, name: firstItem.project_name }
				: null,
		items,
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
	const projects: OutgoingPeopleRequest['projects'] = [];
	const seen = new Set<string>();
	for (const value of Array.isArray(row.projects) ? row.projects : []) {
		const project = record(value);
		const projectId = text(project?.project_id);
		if (
			!project ||
			!projectId ||
			seen.has(projectId) ||
			!isPersonRole(project.role) ||
			!isAgentAccess(project.agent_access)
		)
			continue;
		seen.add(projectId);
		projects.push({
			project_id: projectId,
			project_name: text(project.project_name) ?? 'this project',
			role: project.role,
			agent_access: project.agent_access,
			...(project.status === 'joined' ||
			project.status === 'rejoined' ||
			project.status === 'already_member'
				? { status: project.status }
				: {})
		});
	}
	return {
		id,
		created_at: createdAt,
		decided_at: text(row.decided_at),
		status,
		kind: row.kind === 'upgrade' || row.kind === 'rejoin' ? row.kind : 'access',
		settled_elsewhere: row.settled_elsewhere === true,
		projects,
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
