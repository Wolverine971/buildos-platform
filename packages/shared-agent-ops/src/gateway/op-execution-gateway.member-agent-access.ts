// packages/shared-agent-ops/src/gateway/op-execution-gateway.member-agent-access.ts
//
// What a member's agents may do in a project someone else owns: the owner's per-person
// setting (onto_project_members.agent_access: off, read, write) plus the owner's
// standing approval (project_agent_settings.editor_agents_write: every editor's agents
// can write unless the owner turned that person's agents off). Same rule as the SQL
// helper people_layer_effective_agent_access.

export type MemberAgentAccess = 'off' | 'read' | 'write';

export type MemberAgentAccessRow = {
	project_id: string;
	role_key: string | null;
	access: string | null;
	/** What the owner set for this person (missing reads as off). */
	agent_access: MemberAgentAccess;
	/** After the owner's standing approval ("editors' agents can write here"). */
	effective: MemberAgentAccess;
};

function asAgentAccess(value: unknown): MemberAgentAccess {
	return value === 'read' || value === 'write' ? value : 'off';
}

/**
 * What a member's agents may do. Off always wins; while the owner's standing approval
 * is on, an editor's agents can write. Same rule as people_layer_effective_agent_access.
 */
export function effectiveMemberAgentAccess(
	row: { role_key?: unknown; access?: unknown; agent_access?: unknown },
	editorAgentsWrite: boolean
): MemberAgentAccess {
	const raw = asAgentAccess(row.agent_access);
	if (raw === 'off') return 'off';
	if (
		editorAgentsWrite &&
		row.role_key !== 'owner' &&
		(row.access === 'write' || row.access === 'admin')
	) {
		return 'write';
	}
	return raw;
}

/**
 * The person's agent setting in each of these projects (current memberships only),
 * with the owner's standing approval applied. A failed settings read applies no
 * standing approval, which can only narrow access.
 */
export async function loadMemberAgentAccess(
	admin: any,
	actorId: string,
	projectIds: string[]
): Promise<Map<string, MemberAgentAccessRow>> {
	const ids = [...new Set(projectIds.filter((id) => typeof id === 'string' && id))];
	const result = new Map<string, MemberAgentAccessRow>();
	if (ids.length === 0) return result;

	const [membersResult, settingsResult] = await Promise.all([
		admin
			.from('onto_project_members')
			.select('project_id, role_key, access, agent_access')
			.eq('actor_id', actorId)
			.is('removed_at', null)
			.in('project_id', ids),
		admin
			.from('project_agent_settings')
			.select('project_id, editor_agents_write')
			.in('project_id', ids)
			.eq('editor_agents_write', true)
	]);
	if (membersResult.error) {
		throw new Error(membersResult.error.message || 'Failed to load project agent settings');
	}
	if (settingsResult.error) {
		console.warn('[AccessWall] Could not read standing approvals:', settingsResult.error);
	}
	const standing = new Set<string>(
		(settingsResult.error ? [] : (settingsResult.data ?? []))
			.filter((row: { editor_agents_write?: unknown }) => row.editor_agents_write === true)
			.map((row: { project_id?: unknown }) => String(row.project_id))
	);

	for (const row of (membersResult.data ?? []) as Array<Record<string, unknown>>) {
		if (typeof row.project_id !== 'string') continue;
		result.set(row.project_id, {
			project_id: row.project_id,
			role_key: typeof row.role_key === 'string' ? row.role_key : null,
			access: typeof row.access === 'string' ? row.access : null,
			agent_access: asAgentAccess(row.agent_access),
			effective: effectiveMemberAgentAccess(row, standing.has(row.project_id))
		});
	}
	return result;
}

/** The owner's display name: users.name, else @handle, else a non-email actor name. */
export async function loadProjectOwnerName(
	admin: any,
	ownerActorId: string | null | undefined
): Promise<string | null> {
	if (!ownerActorId) return null;
	try {
		const { data: actor } = await admin
			.from('onto_actors')
			.select('name, email, user_id')
			.eq('id', ownerActorId)
			.maybeSingle();
		if (!actor) return null;
		if (typeof actor.user_id === 'string') {
			const { data: user } = await admin
				.from('users')
				.select('name, username')
				.eq('id', actor.user_id)
				.maybeSingle();
			const name = typeof user?.name === 'string' ? user.name.trim() : '';
			if (name && !name.includes('@')) return name.slice(0, 80);
			const handle = typeof user?.username === 'string' ? user.username.trim() : '';
			if (handle) return `@${handle}`;
		}
		const actorName = typeof actor.name === 'string' ? actor.name.trim() : '';
		const email = typeof actor.email === 'string' ? actor.email.trim().toLowerCase() : '';
		if (actorName && !actorName.includes('@') && actorName.toLowerCase() !== email) {
			return actorName.slice(0, 80);
		}
	} catch {
		/* a name is a nicety */
	}
	return null;
}
