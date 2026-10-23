// apps/web/src/lib/components/people/hub/hub-actions.ts
//
// What Profile > People & agents can change, as thin calls to the same project
// endpoints the Share window uses. Each returns null on success or a message.

import type { AgentAccess, PersonRole } from '$lib/components/people/people-copy';

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
	try {
		const res = await fetch(url, {
			method,
			credentials: 'same-origin',
			headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (res.ok) return null;
		const payload = await res.json().catch(() => null);
		return typeof payload?.error === 'string' && payload.error
			? payload.error
			: 'Could not save that. Try again.';
	} catch {
		return 'Could not reach BuildOS. Try again.';
	}
}

const project = (projectId: string) => `/api/onto/projects/${encodeURIComponent(projectId)}`;

export function setMemberRole(projectId: string, memberId: string, role: PersonRole) {
	return send(`${project(projectId)}/members/${encodeURIComponent(memberId)}`, 'PATCH', {
		role_key: role
	});
}

export function setMemberAgents(projectId: string, memberId: string, access: AgentAccess) {
	return send(
		`${project(projectId)}/members/${encodeURIComponent(memberId)}/agent-access`,
		'PATCH',
		{ agent_access: access }
	);
}

export function removeMember(projectId: string, memberId: string) {
	return send(`${project(projectId)}/members/${encodeURIComponent(memberId)}`, 'DELETE');
}

export function resendInvite(projectId: string, inviteId: string) {
	return send(`${project(projectId)}/invites/${encodeURIComponent(inviteId)}/resend`, 'POST');
}

export function revokeInvite(projectId: string, inviteId: string) {
	return send(`${project(projectId)}/invites/${encodeURIComponent(inviteId)}/revoke`, 'POST');
}

export function clearExpiredInvites(projectId: string) {
	return send(`${project(projectId)}/invites/clear-expired`, 'POST');
}

/** Invite someone already in another of your projects; their email stays on the server. */
export function inviteExistingPerson(
	projectId: string,
	actorId: string,
	role: PersonRole,
	agentAccess: AgentAccess
) {
	return send(`${project(projectId)}/invites`, 'POST', {
		invitee_actor_id: actorId,
		role_key: role,
		agent_access: agentAccess
	});
}

/** Runs every change, then reports how many failed (first message wins). */
export async function runAll(
	tasks: Array<() => Promise<string | null>>
): Promise<{ failed: number; message: string | null }> {
	const results = await Promise.all(tasks.map((task) => task()));
	const errors = results.filter((result): result is string => Boolean(result));
	return { failed: errors.length, message: errors[0] ?? null };
}
