// apps/web/src/lib/server/people/access-history.ts
//
// Access history ("who got access, and when") for the projects a person owns.
// Rows come from public.list_project_access_events (server-only, explicit user id);
// this file turns each one into a plain sentence. No emails or names are stored in
// the log itself: the RPC resolves them at read time.

import { agentAccessLabel, roleLabel } from '$lib/components/people/people-copy';

export const ACCESS_EVENT_KINDS = [
	'member_joined',
	'member_removed',
	'member_left',
	'role_changed',
	'agents_changed',
	'invite_sent',
	'invite_resent',
	'invite_accepted',
	'invite_declined',
	'invite_revoked',
	'invite_expired',
	'editors_agents_write_changed',
	'restricted_changed',
	'ownership_transferred'
] as const;

export type AccessEventKind = (typeof ACCESS_EVENT_KINDS)[number];

/** One row as list_project_access_events returns it. */
export type AccessEventRow = {
	id: string;
	occurred_at: string;
	project_id: string;
	project_name: string | null;
	kind: string;
	via: string | null;
	by_actor_id: string | null;
	by_name: string | null;
	by_is_you: boolean;
	subject_actor_id: string | null;
	subject_name: string | null;
	subject_is_you: boolean;
	subject_label: string | null;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
};

/** What the browser gets. */
export type AccessHistoryEvent = {
	id: string;
	occurred_at: string;
	project_id: string;
	project_name: string;
	kind: AccessEventKind;
	text: string;
	by_you: boolean;
};

export type AccessHistoryPage = {
	events: AccessHistoryEvent[];
	next_before: string | null;
	next_before_id: string | null;
};

export function isAccessEventKind(value: unknown): value is AccessEventKind {
	return typeof value === 'string' && (ACCESS_EVENT_KINDS as readonly string[]).includes(value);
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function field(record: Record<string, unknown> | null, key: string): unknown {
	return record && typeof record === 'object' ? record[key] : undefined;
}

/** "Editor", or null when the log has no role (owners by handoff, old rows). */
function roleOf(record: Record<string, unknown> | null): string | null {
	const role = str(field(record, 'role_key'));
	return role === 'owner' || role === 'editor' || role === 'viewer' ? roleLabel(role) : null;
}

/** Turn one log row into a plain sentence, from the owner's point of view. */
export function describeAccessEvent(row: AccessEventRow): string {
	const project = str(row.project_name) ?? 'a project';
	const by = row.by_is_you ? 'You' : (str(row.by_name) ?? null);
	const subject = row.subject_is_you
		? 'you'
		: (str(row.subject_name) ?? str(row.subject_label) ?? 'someone');
	const Subject = row.subject_is_you ? 'You' : subject;
	const subjects = row.subject_is_you ? 'your' : `${subject}’s`;
	const invitee = str(row.subject_label) ?? str(row.subject_name) ?? 'someone';
	const asRole = (record: Record<string, unknown> | null) => {
		const role = roleOf(record);
		return role ? ` as ${role}` : '';
	};

	switch (row.kind as AccessEventKind) {
		case 'member_joined': {
			if (row.via === 'invite') {
				return `${Subject} joined ${project}${asRole(row.after)}, from ${row.subject_is_you ? 'an' : 'your'} invite.`;
			}
			if (row.via === 'invite_link') {
				return `${Subject} joined ${project}${asRole(row.after)} with the invite link.`;
			}
			const addedBySomeoneElse =
				row.by_actor_id && row.subject_actor_id && row.by_actor_id !== row.subject_actor_id;
			if (addedBySomeoneElse && by) {
				return `${by} added ${subject} to ${project}${asRole(row.after)}.`;
			}
			return `${Subject} joined ${project}${asRole(row.after)}.`;
		}
		case 'member_removed':
			return by
				? `${by} removed ${subject} from ${project}.`
				: `${Subject} ${row.subject_is_you ? 'were' : 'was'} removed from ${project}.`;
		case 'member_left':
			return `${Subject} left ${project}.`;
		case 'role_changed': {
			const from = roleOf(row.before);
			const to = roleOf(row.after);
			const change = from && to ? ` from ${from} to ${to}` : to ? ` to ${to}` : '';
			return by
				? `${by} changed ${subjects} role on ${project}${change}.`
				: `${row.subject_is_you ? 'Your' : subjects} role on ${project} changed${change}.`;
		}
		case 'agents_changed': {
			const to = str(field(row.after, 'agent_access'));
			if (to === 'off') {
				return by
					? `${by} turned off ${subjects} agents on ${project}.`
					: `${row.subject_is_you ? 'Your' : subjects} agents were turned off on ${project}.`;
			}
			const label = agentAccessLabel(to);
			return by
				? `${by} set ${subjects} agents to ${label} on ${project}.`
				: `${row.subject_is_you ? 'Your' : subjects} agents were set to ${label} on ${project}.`;
		}
		case 'invite_sent':
			return `${by ?? 'Someone'} invited ${invitee} to ${project}${asRole(row.after)}.`;
		case 'invite_resent':
			return `${by ?? 'Someone'} sent the invite to ${invitee} for ${project} again.`;
		case 'invite_accepted':
			return `${row.subject_is_you ? 'You' : (str(row.subject_name) ?? invitee)} accepted the invite to ${project}.`;
		case 'invite_declined':
			return `${invitee} declined the invite to ${project}.`;
		case 'invite_revoked':
			return by
				? `${by} withdrew the invite to ${invitee} for ${project}.`
				: `The invite to ${invitee} for ${project} was withdrawn.`;
		case 'invite_expired':
			return `An invite to ${invitee} for ${project} expired unanswered.`;
		case 'editors_agents_write_changed': {
			const on = field(row.after, 'on') === true;
			return `${by ?? 'Someone'} turned ${on ? 'on' : 'off'} ‘Editors’ agents can make changes’ for ${project}.`;
		}
		case 'restricted_changed': {
			const on = field(row.after, 'restricted') === true;
			return `${by ?? 'Someone'} turned ${on ? 'on' : 'off'} ‘Only agents you pick’ for ${project}.`;
		}
		case 'ownership_transferred':
			return `${by ?? 'Someone'} made ${subject} owner of ${project}.`;
		default:
			return `Access to ${project} changed.`;
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Read one RPC row defensively. Returns null for anything we can't show. */
export function readAccessEventRow(value: unknown): AccessEventRow | null {
	const row = asRecord(value);
	if (!row) return null;
	const id = str(row.id);
	const occurredAt = str(row.occurred_at);
	const projectId = str(row.project_id);
	if (!id || !occurredAt || !projectId || !isAccessEventKind(row.kind)) return null;
	return {
		id,
		occurred_at: occurredAt,
		project_id: projectId,
		project_name: str(row.project_name),
		kind: row.kind,
		via: str(row.via),
		by_actor_id: str(row.by_actor_id),
		by_name: str(row.by_name),
		by_is_you: row.by_is_you === true,
		subject_actor_id: str(row.subject_actor_id),
		subject_name: str(row.subject_name),
		subject_is_you: row.subject_is_you === true,
		subject_label: str(row.subject_label),
		before: asRecord(row.before),
		after: asRecord(row.after)
	};
}

export function toAccessHistoryEvent(row: AccessEventRow): AccessHistoryEvent {
	return {
		id: row.id,
		occurred_at: row.occurred_at,
		project_id: row.project_id,
		project_name: row.project_name ?? 'a project',
		kind: row.kind as AccessEventKind,
		text: describeAccessEvent(row),
		by_you: row.by_is_you
	};
}

/** The RPC's jsonb result as a page for the browser. */
export function readAccessHistoryPage(data: unknown): AccessHistoryPage {
	const result = asRecord(data) ?? {};
	const rows = Array.isArray(result.events) ? result.events : [];
	const events = rows
		.map(readAccessEventRow)
		.filter((row): row is AccessEventRow => row !== null)
		.map(toAccessHistoryEvent);
	return {
		events,
		next_before: str(result.next_before),
		next_before_id: str(result.next_before_id)
	};
}

export const ACCESS_HISTORY_DEFAULT_LIMIT = 50;
export const ACCESS_HISTORY_MAX_LIMIT = 200;

export type AccessHistoryQuery = {
	limit: number;
	before: string | null;
	beforeId: string | null;
	projectId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse ?limit=&before=&before_id=&project_id=. Returns an error message when invalid. */
export function parseAccessHistoryQuery(
	params: URLSearchParams
): { ok: true; query: AccessHistoryQuery } | { ok: false; message: string } {
	const rawLimit = params.get('limit');
	let limit = ACCESS_HISTORY_DEFAULT_LIMIT;
	if (rawLimit !== null && rawLimit !== '') {
		const parsed = Number(rawLimit);
		if (!Number.isInteger(parsed) || parsed < 1) {
			return { ok: false, message: 'limit must be a whole number above 0' };
		}
		limit = Math.min(parsed, ACCESS_HISTORY_MAX_LIMIT);
	}

	const before = params.get('before') || null;
	if (before && Number.isNaN(Date.parse(before))) {
		return { ok: false, message: 'before must be a date' };
	}
	const beforeId = params.get('before_id') || null;
	if (beforeId && !UUID.test(beforeId)) {
		return { ok: false, message: 'before_id must be an id' };
	}
	if (beforeId && !before) {
		return { ok: false, message: 'before_id needs before' };
	}
	const projectId = params.get('project_id') || null;
	if (projectId && !UUID.test(projectId)) {
		return { ok: false, message: 'project_id must be an id' };
	}
	return { ok: true, query: { limit, before, beforeId, projectId } };
}

// Method syntax on purpose: supabase-js's generic rpc() fits it, and tests can pass a stub.
type RpcClient = {
	rpc(
		fn: 'list_project_access_events',
		args: {
			p_user_id: string;
			p_limit?: number;
			p_before?: string;
			p_before_id?: string;
			p_project_id?: string;
		}
	): PromiseLike<{
		data: unknown;
		error: { code?: string | null; message?: string | null } | null;
	}>;
};

/** One page of history for userId. The caller must have checked that userId is the session user. */
export async function loadAccessHistory(
	admin: RpcClient,
	userId: string,
	query: AccessHistoryQuery
): Promise<
	| { ok: true; page: AccessHistoryPage }
	| { ok: false; error: { code?: string | null; message?: string | null } }
> {
	const { data, error } = await admin.rpc('list_project_access_events', {
		p_user_id: userId,
		p_limit: query.limit,
		...(query.before ? { p_before: query.before } : {}),
		...(query.beforeId ? { p_before_id: query.beforeId } : {}),
		...(query.projectId ? { p_project_id: query.projectId } : {})
	});
	if (error) return { ok: false, error };
	return { ok: true, page: readAccessHistoryPage(data) };
}
