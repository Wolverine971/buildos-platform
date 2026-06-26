type ProjectOwnerCandidate = {
	id: string | null;
	created_by: string | null;
};

type ActorOwnerRow = {
	id: string | null;
	user_id: string | null;
};

type UserOwnerRow = {
	id: string | null;
};

export function mapProjectLoopOwnerUserIds(
	projects: ProjectOwnerCandidate[],
	actors: ActorOwnerRow[],
	users: UserOwnerRow[]
): Map<string, string> {
	const actorUserByActorId = new Map<string, string>();
	for (const actor of actors) {
		if (actor.id && actor.user_id) {
			actorUserByActorId.set(actor.id, actor.user_id);
		}
	}

	const validUserIds = new Set(
		users.map((user) => user.id).filter((id): id is string => Boolean(id))
	);
	const userIdByProjectId = new Map<string, string>();

	for (const project of projects) {
		if (!project.id || !project.created_by) continue;

		// Legacy projects may store auth/public user ids directly in created_by.
		if (validUserIds.has(project.created_by)) {
			userIdByProjectId.set(project.id, project.created_by);
			continue;
		}

		// Current ontology projects store an onto_actors.id in created_by.
		const actorUserId = actorUserByActorId.get(project.created_by);
		if (actorUserId && validUserIds.has(actorUserId)) {
			userIdByProjectId.set(project.id, actorUserId);
		}
	}

	return userIdByProjectId;
}
