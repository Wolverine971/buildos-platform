// packages/shared-agent-ops/src/ontology/project-member-handles.ts
//
// One way to turn "@sam" into a project member. Task assignment and entity
// pings both name people the way the user does, by name or handle, and both
// must agree on who that is. Matching is structural (a handle against a
// member's name and email local-part), never a reading of free text.

export type ProjectMemberActor = {
	id?: string;
	user_id?: string | null;
	name?: string | null;
	email?: string | null;
};

export type IndexedProjectMember = {
	actorId: string;
	actor: ProjectMemberActor | null;
	keys: Set<string>;
};

export type ProjectMemberHandleMatch =
	| { status: 'match'; member: IndexedProjectMember }
	| { status: 'ambiguous'; members: IndexedProjectMember[] }
	| { status: 'none' };

/** "@Sam Lee" -> "samlee". Null when nothing usable is left. */
export function normalizeHandleToken(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed) return null;
	const withoutPrefix = trimmed.replace(/^@+/, '');
	const cleaned = withoutPrefix.replace(/[^a-z0-9._-]/g, '');
	return cleaned.length > 0 ? cleaned : null;
}

/** Every handle a member answers to: full name, name without spaces, each name part, email local-part. */
export function buildMemberHandleKeys(actor: ProjectMemberActor | null): Set<string> {
	const keys = new Set<string>();
	if (!actor) return keys;

	const name = actor.name?.trim().toLowerCase();
	if (name) {
		for (const candidate of [name, name.replace(/\s+/g, ''), ...name.split(/\s+/)]) {
			const normalized = normalizeHandleToken(candidate);
			if (normalized) keys.add(normalized);
		}
	}

	const email = actor.email?.trim().toLowerCase();
	if (email) {
		const normalized = normalizeHandleToken(email.split('@')[0] ?? email);
		if (normalized) keys.add(normalized);
	}

	return keys;
}

/** Shown to agents in match errors: a name or an actor id, never email text. */
export function formatMemberLabel(member: IndexedProjectMember): string {
	const name = member.actor?.name?.trim();
	const email = member.actor?.email?.trim().toLowerCase();
	if (name && name.toLowerCase() !== email) return name;
	return `member ${member.actorId}`;
}

/** Rows of `onto_project_members` joined to their actor, indexed for matching. */
export function indexProjectMemberRows(
	rows: ReadonlyArray<{ actor_id?: unknown; actor?: unknown }>
): IndexedProjectMember[] {
	return rows
		.map((row): IndexedProjectMember | null => {
			if (typeof row.actor_id !== 'string') return null;
			const rawActor = Array.isArray(row.actor) ? (row.actor[0] ?? null) : row.actor;
			const actor =
				rawActor && typeof rawActor === 'object' ? (rawActor as ProjectMemberActor) : null;
			return { actorId: row.actor_id, actor, keys: buildMemberHandleKeys(actor) };
		})
		.filter((member): member is IndexedProjectMember => member !== null);
}

/** An exact handle wins; otherwise a prefix that fits exactly one member. */
export function matchProjectMemberHandle(
	handle: string,
	members: readonly IndexedProjectMember[]
): ProjectMemberHandleMatch {
	const exact = members.filter((member) => member.keys.has(handle));
	if (exact.length === 1 && exact[0]) return { status: 'match', member: exact[0] };
	if (exact.length > 1) return { status: 'ambiguous', members: exact };

	const prefix = members.filter((member) =>
		Array.from(member.keys).some((key) => key.startsWith(handle))
	);
	if (prefix.length === 1 && prefix[0]) return { status: 'match', member: prefix[0] };
	if (prefix.length > 1) return { status: 'ambiguous', members: prefix };
	return { status: 'none' };
}
